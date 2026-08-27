import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../server/app.ts";

const temporaryDirectories: string[] = [];

function appWithFreshDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "handback-test-"));
  temporaryDirectories.push(directory);
  return createApp(join(directory, "test.sqlite"));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const envelope = { format: "handback-aes256gcm-v1", iv: "AAAAAAAAAAAAAAAA", ciphertext: "ZmFrZQ" };

describe("handoff API", () => {
  it("creates at version 1 and reads back the same envelope", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);
    expect(created.body.version).toBe(1);

    const fetched = await request(app).get(`/api/h/${created.body.id}`).expect(200);
    expect(fetched.body.envelope).toEqual(envelope);
  });

  it("rejects an envelope that is not the expected shape", async () => {
    const app = appWithFreshDatabase();
    await request(app).post("/api/h").send({ envelope: { format: "rot13", iv: "x" } }).expect(400);
  });

  it("rejects extra keys smuggled into the envelope", async () => {
    const app = appWithFreshDatabase();
    await request(app)
      .post("/api/h")
      .send({ envelope: { ...envelope, plaintextTitle: "Q3 pricing" } })
      .expect(400);
  });

  it("requires expectedVersion on update", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);
    const response = await request(app).put(`/api/h/${created.body.id}`).send({ envelope }).expect(400);
    expect(response.body.error).toBe("expected_version_required");
  });

  it("enforces expectedVersion instead of accepting and ignoring it", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);

    await request(app).put(`/api/h/${created.body.id}`).send({ envelope, expectedVersion: 1 }).expect(200);

    // Second write still claiming version 1 is a lost update, and must 409.
    const conflict = await request(app)
      .put(`/api/h/${created.body.id}`)
      .send({ envelope, expectedVersion: 1 })
      .expect(409);
    expect(conflict.body).toMatchObject({ error: "version_conflict", currentVersion: 2 });
  });

  it("increments the version on each accepted write", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);
    const second = await request(app).put(`/api/h/${created.body.id}`).send({ envelope, expectedVersion: 1 });
    const third = await request(app).put(`/api/h/${created.body.id}`).send({ envelope, expectedVersion: 2 });
    expect([second.body.version, third.body.version]).toEqual([2, 3]);
  });

  it("404s an unknown id and 400s a malformed one", async () => {
    const app = appWithFreshDatabase();
    await request(app).get("/api/h/aaaaaaaaaaaaaaaaaa").expect(404);
    await request(app).get("/api/h/short").expect(400);
  });
});

describe("append-only version history", () => {
  it("keeps every version's envelope, not just the latest", async () => {
    const app = appWithFreshDatabase();
    const v1 = { ...envelope, ciphertext: "dmVyc2lvbjE" };
    const v2 = { ...envelope, ciphertext: "dmVyc2lvbjI" };
    const v3 = { ...envelope, ciphertext: "dmVyc2lvbjM" };

    const created = await request(app).post("/api/h").send({ envelope: v1 }).expect(201);
    const id = created.body.id;
    await request(app).put(`/api/h/${id}`).send({ envelope: v2, expectedVersion: 1 }).expect(200);
    await request(app).put(`/api/h/${id}`).send({ envelope: v3, expectedVersion: 2 }).expect(200);

    // The original ciphertext is still recoverable — this is the whole point of
    // appending rather than overwriting.
    const first = await request(app).get(`/api/h/${id}?version=1`).expect(200);
    expect(first.body.envelope.ciphertext).toBe("dmVyc2lvbjE");
    expect(first.body.currentVersion).toBe(3);

    const second = await request(app).get(`/api/h/${id}?version=2`).expect(200);
    expect(second.body.envelope.ciphertext).toBe("dmVyc2lvbjI");

    const latest = await request(app).get(`/api/h/${id}`).expect(200);
    expect(latest.body.envelope.ciphertext).toBe("dmVyc2lvbjM");
    expect(latest.body.version).toBe(3);
  });

  it("lists the versions it holds", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);
    await request(app).put(`/api/h/${created.body.id}`).send({ envelope, expectedVersion: 1 }).expect(200);

    const listed = await request(app).get(`/api/h/${created.body.id}/versions`).expect(200);
    expect(listed.body.versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
  });

  it("404s a version that does not exist yet", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);
    const response = await request(app).get(`/api/h/${created.body.id}?version=9`).expect(404);
    expect(response.body).toMatchObject({ error: "version_not_found", currentVersion: 1 });
  });

  it("rejects a nonsense version parameter", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);
    await request(app).get(`/api/h/${created.body.id}?version=banana`).expect(400);
    await request(app).get(`/api/h/${created.body.id}?version=0`).expect(400);
  });

  it("never overwrites an envelope a racing writer already claimed", async () => {
    const app = appWithFreshDatabase();
    const created = await request(app).post("/api/h").send({ envelope }).expect(201);
    const id = created.body.id;

    const winner = { ...envelope, ciphertext: "d2lubmVy" };
    const loser = { ...envelope, ciphertext: "bG9zZXI" };
    await request(app).put(`/api/h/${id}`).send({ envelope: winner, expectedVersion: 1 }).expect(200);
    await request(app).put(`/api/h/${id}`).send({ envelope: loser, expectedVersion: 1 }).expect(409);

    // The loser's ciphertext must not be anywhere in the store.
    const v2 = await request(app).get(`/api/h/${id}?version=2`).expect(200);
    expect(v2.body.envelope.ciphertext).toBe("d2lubmVy");
  });
});
