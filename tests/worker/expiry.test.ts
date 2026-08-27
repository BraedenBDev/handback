import { env, SELF, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../worker/index.ts";

const envelope = { format: "handback-aes256gcm-v1", iv: "AAAAAAAAAAAAAAAA", ciphertext: "ZmFrZQ" };
const origin = "https://handback.link";

// A fresh IP per call, for the same reason as tests/worker/api.test.ts.
const create = async (retentionDays?: number | null) =>
  SELF.fetch(`${origin}/api/h`, {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
    body: JSON.stringify(retentionDays === undefined ? { envelope } : { envelope, retentionDays }),
  });

async function createdId(retentionDays?: number | null) {
  const response = await create(retentionDays);
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; expiresAt: string | null };
}

const expireNow = (id: string) =>
  env.DB.prepare("UPDATE handoffs SET expiresAt = ? WHERE id = ?")
    .bind(new Date(Date.now() - 1000).toISOString(), id)
    .run();

const rowsFor = async (id: string) => {
  const handoffs = await env.DB.prepare("SELECT count(*) AS n FROM handoffs WHERE id = ?").bind(id).first<{ n: number }>();
  const envelopes = await env.DB.prepare("SELECT count(*) AS n FROM envelopes WHERE handoffId = ?").bind(id).first<{ n: number }>();
  return { handoffs: handoffs!.n, envelopes: envelopes!.n };
};

describe("choosing a window", () => {
  it("defaults to seven days when the client says nothing", async () => {
    const { expiresAt } = await createdId();
    const days = (new Date(expiresAt!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("honours an explicit window", async () => {
    const { expiresAt } = await createdId(1);
    const hours = (new Date(expiresAt!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
  });

  it("stores no expiry at all for never", async () => {
    const { expiresAt } = await createdId(null);
    expect(expiresAt).toBeNull();
  });

  it("rejects a nonsense window rather than quietly picking one", async () => {
    for (const bad of [0, -1, 1.5, 400, "7"]) {
      const response = await create(bad as number);
      expect(response.status, `retentionDays=${bad}`).toBe(400);
    }
  });
});

describe("an expired handoff", () => {
  it("is gone on the first read, not merely unserved", async () => {
    const { id } = await createdId(1);
    await expireNow(id);
    expect(await rowsFor(id)).toEqual({ handoffs: 1, envelopes: 1 });

    const read = await SELF.fetch(`${origin}/api/h/${id}`);
    expect(read.status).toBe(410);
    expect((await read.json()) as any).toMatchObject({ error: "expired" });

    // The ciphertext is deleted on the way past, not left for a sweep.
    expect(await rowsFor(id)).toEqual({ handoffs: 0, envelopes: 0 });
  });

  it("refuses a contribution rather than resurrecting itself", async () => {
    const { id } = await createdId(1);
    await expireNow(id);
    const write = await SELF.fetch(`${origin}/api/h/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelope, expectedVersion: 1 }),
    });
    expect(write.status).toBe(410);
    expect(await rowsFor(id)).toEqual({ handoffs: 0, envelopes: 0 });
  });

  it("takes every version with it, not just the latest", async () => {
    const { id } = await createdId(1);
    await SELF.fetch(`${origin}/api/h/${id}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelope, expectedVersion: 1 }),
    });
    expect((await rowsFor(id)).envelopes).toBe(2);

    await expireNow(id);
    await SELF.fetch(`${origin}/api/h/${id}`);
    expect(await rowsFor(id)).toEqual({ handoffs: 0, envelopes: 0 });
  });
});

describe("the window slides on activity", () => {
  it("moves the expiry forward when a contribution lands", async () => {
    const { id, expiresAt } = await createdId(1);
    // Pretend the handoff is most of a day old.
    const nearlyDue = new Date(Date.now() + 60_000).toISOString();
    await env.DB.prepare("UPDATE handoffs SET expiresAt = ? WHERE id = ?").bind(nearlyDue, id).run();

    const write = await SELF.fetch(`${origin}/api/h/${id}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelope, expectedVersion: 1 }),
    });
    expect(write.status).toBe(200);
    const renewed = ((await write.json()) as any).expiresAt as string;

    // Someone picking this up on the last day does not lose it mid-edit.
    expect(new Date(renewed).getTime()).toBeGreaterThan(new Date(nearlyDue).getTime());
    expect(new Date(renewed).getTime()).toBeGreaterThan(new Date(expiresAt!).getTime() - 5000);
  });

  it("leaves a never-expiring handoff alone", async () => {
    const { id } = await createdId(null);
    const write = await SELF.fetch(`${origin}/api/h/${id}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelope, expectedVersion: 1 }),
    });
    expect(((await write.json()) as any).expiresAt).toBeNull();
  });
});

describe("the scheduled sweep", () => {
  it("removes handoffs nobody came back to", async () => {
    const doomed = await createdId(1);
    const keep = await createdId(30);
    const forever = await createdId(null);
    await expireNow(doomed.id);

    const ctx = createExecutionContext();
    await worker.scheduled!({ scheduledTime: Date.now(), cron: "17 3 * * *", noRetry() {} } as any, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(await rowsFor(doomed.id)).toEqual({ handoffs: 0, envelopes: 0 });
    expect((await rowsFor(keep.id)).handoffs).toBe(1);
    expect((await rowsFor(forever.id)).handoffs).toBe(1);
  });
});
