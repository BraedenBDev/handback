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
