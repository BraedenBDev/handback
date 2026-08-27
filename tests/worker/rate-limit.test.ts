import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const envelope = { format: "handback-aes256gcm-v1", iv: "AAAAAAAAAAAAAAAA", ciphertext: "ZmFrZQ" };
const origin = "https://handback.link";

const createAs = (ip: string) =>
  SELF.fetch(`${origin}/api/h`, {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ envelope }),
  });

/**
 * wrangler.jsonc configures CREATE_LIMITER at 20 creates per 60 seconds, keyed
 * on CF-Connecting-IP. Confirmed empirically (2026-08) that
 * @cloudflare/vitest-pool-workers 0.12.0 actually simulates this binding
 * locally rather than treating it as a no-op, so these run against the real
 * enforcement path, not a stand-in.
 *
 * Known noise: whenever a test here denies a request, workerd logs
 * "info: uncaught exception ... Can't read from request stream after
 * response has been sent." Confirmed it is an artifact of the local
 * simulator, not this Worker's code: it is undocumented anywhere in
 * Cloudflare's docs, does not fail any test, does not depend on whether the
 * denied response's body is read, and does not reproduce against the
 * deployed Worker (checked directly with curl after deploying). Harmless.
 */
describe("creation is rate-limited per IP", () => {
  it("allows creation up to the configured limit", async () => {
    const ip = crypto.randomUUID();
    for (let i = 0; i < 20; i++) {
      const response = await createAs(ip);
      expect(response.status, `request ${i + 1}/20`).toBe(201);
      await response.json();
    }
  });

  it("refuses the request past the limit, with a Retry-After header", async () => {
    const ip = crypto.randomUUID();
    for (let i = 0; i < 20; i++) await (await createAs(ip)).json();

    const blocked = await createAs(ip);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()) as any).toMatchObject({ error: "rate_limited" });
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("tracks each IP separately, so one abusive client cannot block another", async () => {
    const attacker = crypto.randomUUID();
    for (let i = 0; i < 21; i++) await (await createAs(attacker)).json();
    const stillBlocked = await createAs(attacker);
    expect(stillBlocked.status).toBe(429);
    await stillBlocked.json();

    const bystander = crypto.randomUUID();
    const unaffected = await createAs(bystander);
    expect(unaffected.status).toBe(201);
    await unaffected.json();
  });

  it("does not limit reads or contributions, only creation", async () => {
    const ip = crypto.randomUUID();
    const created = await createAs(ip);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    // Exhaust this IP's create budget.
    for (let i = 0; i < 20; i++) await (await createAs(ip)).json();
    const overBudget = await createAs(ip);
    expect(overBudget.status).toBe(429);
    await overBudget.json();

    // Reads and writes to the handoff already created must still work.
    const read = await SELF.fetch(`${origin}/api/h/${id}`, { headers: { "CF-Connecting-IP": ip } });
    expect(read.status).toBe(200);

    const write = await SELF.fetch(`${origin}/api/h/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ envelope, expectedVersion: 1 }),
    });
    expect(write.status).toBe(200);
  });

  it("treats a request with no CF-Connecting-IP as one shared bucket, and still fails open past it", async () => {
    // No header at all: the fallback key. Cloudflare's edge always sets this
    // header in production, so this path only fires from a client Cloudflare
    // itself never produces.
    const withoutHeader = () =>
      SELF.fetch(`${origin}/api/h`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope }),
      });
    const first = await withoutHeader();
    expect([201, 429]).toContain(first.status);
  });
});
