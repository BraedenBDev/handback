import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const envelope = { format: "handback-aes256gcm-v1", iv: "AAAAAAAAAAAAAAAA", ciphertext: "ZmFrZQ" };
const origin = "https://handback.link";

const post = (body: unknown) =>
  SELF.fetch(`${origin}/api/h`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const put = (id: string, body: unknown) =>
  SELF.fetch(`${origin}/api/h/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`${origin}${path}`);

async function createOne(env = envelope) {
  const response = await post({ envelope: env });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; version: number };
}

describe("creating and reading", () => {
  it("creates at version 1 and reads back the same envelope", async () => {
    const { id, version } = await createOne();
    expect(version).toBe(1);
    const body = (await (await get(`/api/h/${id}`)).json()) as any;
    expect(body.envelope).toEqual(envelope);
    expect(body.currentVersion).toBe(1);
  });

  it("mints unpredictable ids", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) ids.add((await createOne()).id);
    expect(ids.size).toBe(5);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });

  it("rejects an envelope that is not the expected shape", async () => {
    expect((await post({ envelope: { format: "rot13", iv: "x" } })).status).toBe(400);
  });

  it("rejects extra keys smuggled into the envelope", async () => {
    expect((await post({ envelope: { ...envelope, plaintextTitle: "Q3 pricing" } })).status).toBe(400);
  });

  it("rejects a request with no envelope at all", async () => {
    expect((await post({})).status).toBe(400);
    expect((await SELF.fetch(`${origin}/api/h`, { method: "POST", body: "not json" })).status).toBe(400);
  });

  it("404s an unknown id and 400s a malformed one", async () => {
    expect((await get("/api/h/aaaaaaaaaaaaaaaaaa")).status).toBe(404);
    expect((await get("/api/h/short")).status).toBe(400);
  });
});

describe("optimistic concurrency", () => {
  it("requires expectedVersion on update", async () => {
    const { id } = await createOne();
    const response = await put(id, { envelope });
    expect(response.status).toBe(400);
    expect((await response.json()) as any).toMatchObject({ error: "expected_version_required" });
  });

  it("enforces expectedVersion instead of accepting and ignoring it", async () => {
    const { id } = await createOne();
    expect((await put(id, { envelope, expectedVersion: 1 })).status).toBe(200);

    const conflict = await put(id, { envelope, expectedVersion: 1 });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()) as any).toMatchObject({ error: "version_conflict", currentVersion: 2 });
  });

  it("rejects a non-integer or zero expectedVersion", async () => {
    const { id } = await createOne();
    for (const bad of [0, -1, 1.5, "1", null]) {
      expect((await put(id, { envelope, expectedVersion: bad })).status).toBe(400);
    }
  });

  it("increments the version on each accepted write", async () => {
    const { id } = await createOne();
    const second = (await (await put(id, { envelope, expectedVersion: 1 })).json()) as any;
    const third = (await (await put(id, { envelope, expectedVersion: 2 })).json()) as any;
    expect([second.version, third.version]).toEqual([2, 3]);
  });

  it("404s an update to a handoff that does not exist", async () => {
    expect((await put("aaaaaaaaaaaaaaaaaa", { envelope, expectedVersion: 1 })).status).toBe(404);
  });
});

describe("append-only version history", () => {
  it("keeps every version's envelope, not just the latest", async () => {
    const v1 = { ...envelope, ciphertext: "dmVyc2lvbjE" };
    const v2 = { ...envelope, ciphertext: "dmVyc2lvbjI" };
    const v3 = { ...envelope, ciphertext: "dmVyc2lvbjM" };

    const { id } = await createOne(v1);
    await put(id, { envelope: v2, expectedVersion: 1 });
    await put(id, { envelope: v3, expectedVersion: 2 });

    const first = (await (await get(`/api/h/${id}?version=1`)).json()) as any;
    expect(first.envelope.ciphertext).toBe("dmVyc2lvbjE");
    expect(first.currentVersion).toBe(3);

    const latest = (await (await get(`/api/h/${id}`)).json()) as any;
    expect(latest.envelope.ciphertext).toBe("dmVyc2lvbjM");
    expect(latest.version).toBe(3);
  });

  it("lists the versions it holds", async () => {
    const { id } = await createOne();
    await put(id, { envelope, expectedVersion: 1 });
    const listed = (await (await get(`/api/h/${id}/versions`)).json()) as any;
    expect(listed.versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
  });

  it("404s the versions listing for an unknown handoff", async () => {
    expect((await get("/api/h/aaaaaaaaaaaaaaaaaa/versions")).status).toBe(404);
  });

  it("404s a version that does not exist yet", async () => {
    const { id } = await createOne();
    const response = await get(`/api/h/${id}?version=9`);
    expect(response.status).toBe(404);
    expect((await response.json()) as any).toMatchObject({ error: "version_not_found", currentVersion: 1 });
  });

  it("rejects a nonsense version parameter", async () => {
    const { id } = await createOne();
    for (const bad of ["banana", "0", "-1", "1.5"]) {
      expect((await get(`/api/h/${id}?version=${bad}`)).status).toBe(400);
    }
  });

  it("never overwrites an envelope a racing writer already claimed", async () => {
    const { id } = await createOne();
    const winner = { ...envelope, ciphertext: "d2lubmVy" };
    const loser = { ...envelope, ciphertext: "bG9zZXI" };
    expect((await put(id, { envelope: winner, expectedVersion: 1 })).status).toBe(200);
    expect((await put(id, { envelope: loser, expectedVersion: 1 })).status).toBe(409);

    const v2 = (await (await get(`/api/h/${id}?version=2`)).json()) as any;
    expect(v2.envelope.ciphertext).toBe("d2lubmVy");
  });
});

describe("canonical host", () => {
  it("301s www to the apex, preserving path and query", async () => {
    const response = await SELF.fetch("https://www.handback.link/h/abc?x=1", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://handback.link/h/abc?x=1");
  });

  it("301s the workers.dev subdomain to the apex", async () => {
    const response = await SELF.fetch("https://handback.example.workers.dev/api/h", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://handback.link/api/h");
  });

  it("does not redirect the canonical host", async () => {
    expect((await get("/api/h/short")).status).toBe(400);
  });

  it("rejects unsupported methods rather than redirecting them", async () => {
    const response = await SELF.fetch(`${origin}/api/h/aaaaaaaaaaaaaaaaaa`, { method: "DELETE" });
    expect(response.status).toBe(404);
  });
});
