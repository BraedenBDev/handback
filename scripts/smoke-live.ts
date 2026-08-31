/**
 * Smoke test against a live deployment. Run: node scripts/smoke-live.ts <base-url>
 * Exercises the same lifecycle as tests/roundtrip.test.ts, but over the network
 * against the real Worker and real D1, because a passing local suite says
 * nothing about whether the deployed thing behaves the same.
 */
import { decryptDocument, encryptDocument, exportKey, generateKey, importKey } from "../src/crypto.ts";
import { applyContribution } from "../src/contribution.ts";
import { stampDocument, verifyDocument } from "../src/hash.ts";
import type { HandoffDocument } from "../shared/schema.ts";

const base = process.argv[2] ?? "http://localhost:8787";
const checks: Array<[string, boolean]> = [];
const check = (label: string, passed: boolean) => checks.push([label, passed]);

const now = new Date().toISOString();
const SENTINEL = `SMOKE-${now}`;
const v1: HandoffDocument = await stampDocument({
  state: { objective: `Live smoke ${SENTINEL}`, summary: "Written by scripts/smoke-live.ts", tasks: [{ title: "Deploy", status: "in_progress" }] },
  version: 1, createdAt: now, updatedAt: now, parentHash: null, history: [],
});

const key = await generateKey();
const created = await fetch(`${base}/api/h`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v1), retentionDays: 1 }),
});
check("POST /api/h returns 201", created.status === 201);
const { id, expiresAt } = await created.json() as { id: string; expiresAt: string | null };

const hoursLeft = expiresAt ? (new Date(expiresAt).getTime() - Date.now()) / 3_600_000 : -1;
check("a requested expiry window is honoured", hoursLeft > 23.5 && hoursLeft < 24.5);

const neverExpires = await fetch(`${base}/api/h`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v1), retentionDays: null }),
});
check("a never-expiring handoff stores no expiry", ((await neverExpires.json()) as any).expiresAt === null);

const badWindow = await fetch(`${base}/api/h`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v1), retentionDays: 9999 }),
});
check("an out-of-range expiry window is refused", badWindow.status === 400);

const link = `${base}/h/${id}#k=${await exportKey(key)}`;

// Reopen with nothing but the link.
const fetched = await fetch(`${base}/api/h/${id}`);
const stored = await fetched.json() as { version: number; envelope: any };
const reopened = await decryptDocument(await importKey(new URL(link).hash.replace("#k=", "")), stored.envelope);
check("reopened via link decrypts", reopened.state.objective === `Live smoke ${SENTINEL}`);
check("its seal verifies after a network round trip", (await verifyDocument(reopened)) === "verified");
check("server returned no plaintext", !JSON.stringify(stored).includes(SENTINEL));

// Contribute against the correct version.
const v2 = await stampDocument(applyContribution(reopened, {
  baseVersion: reopened.version, note: "smoke contribution",
  operations: [{ op: "set_task_status", value: "Deploy", status: "done" }],
}));
check("the new version chains to its parent's seal", v2.parentHash === v1.contentHash);
const put = await fetch(`${base}/api/h/${id}`, {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v2), expectedVersion: reopened.version }),
});
check("PUT with correct expectedVersion returns 200", put.status === 200);
const renewed = ((await put.clone().json()) as any).expiresAt as string | null;
check("the expiry window slides on a contribution", !!renewed && new Date(renewed) > new Date(expiresAt!));

// The lost-update guard.
const conflict = await fetch(`${base}/api/h/${id}`, {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v2), expectedVersion: 1 }),
});
check("PUT with stale expectedVersion returns 409", conflict.status === 409);

const missingVersion = await fetch(`${base}/api/h/${id}`, {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v2) }),
});
check("PUT without expectedVersion returns 400", missingVersion.status === 400);

const extraKeys = await fetch(`${base}/api/h`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: { format: "handback-aes256gcm-v1", iv: "AAAA", ciphertext: "ZmFrZQ", title: "leak" } }),
});
check("POST rejects extra envelope keys", extraKeys.status === 400);

// The original link still works at v2 — the key was never regenerated.
const refetched = await fetch(`${base}/api/h/${id}`);
const final = await decryptDocument(
  await importKey(new URL(link).hash.replace("#k=", "")),
  ((await refetched.json()) as any).envelope,
);
check("original link still decrypts at v2", final.version === 2 && final.state.tasks?.[0]?.status === "done");

// Append-only history: every version must still be readable and decryptable.
const firstVersion = await fetch(`${base}/api/h/${id}?version=1`);
check("earlier version is still retrievable", firstVersion.status === 200);
const firstDoc = await decryptDocument(key, ((await firstVersion.json()) as any).envelope);
check("earlier version still decrypts with the same key", firstDoc.version === 1 && firstDoc.state.tasks?.[0]?.status === "in_progress");

const listed = await fetch(`${base}/api/h/${id}/versions`);
const versions = ((await listed.json()) as any).versions.map((v: any) => v.version);
check("versions endpoint lists every version held", JSON.stringify(versions) === "[1,2]");

const missingVersionRead = await fetch(`${base}/api/h/${id}?version=99`);
check("unknown version 404s", missingVersionRead.status === 404);
const badVersionRead = await fetch(`${base}/api/h/${id}?version=banana`);
check("nonsense version 400s", badVersionRead.status === 400);

check("the contributed version seals cleanly", (await verifyDocument(final)) === "verified");

// One canonical origin. www redirects via a zone rule that runs ahead of the
// Worker; the workers.dev subdomain is retired outright.
const wwwRedirect = await fetch(`https://www.handback.link/h/${id}`, { redirect: "manual" });
check(
  "www redirects to the canonical host",
  wwwRedirect.status === 301 && wwwRedirect.headers.get("location") === `https://handback.link/h/${id}`,
);

const retired = await fetch("https://handback.braeden-bihag.workers.dev/", { redirect: "manual" })
  .then((r) => r.status)
  .catch(() => 0);
check("the workers.dev subdomain no longer serves", retired === 0 || retired >= 400);

// Handoff pages must never become a search result.
const handoffHeaders = await fetch(`${base}/h/${id}`);
check(
  "handoff pages are noindex",
  (handoffHeaders.headers.get("x-robots-tag") ?? "").includes("noindex"),
);
// robots.txt deliberately does NOT disallow /h/ — noindex is enforced by the
// X-Robots-Tag header above instead, which a Disallow would prevent a crawler
// from ever seeing (see public/robots.txt). A naive `.includes("Disallow: /h/")`
// here used to pass vacuously: that exact string appears inside this file's own
// explanatory comment, so the check never actually inspected a directive.
const robots = await (await fetch(`${base}/robots.txt`)).text();
const directives = robots.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
check("robots.txt allows crawling /h/ (noindex is the X-Robots-Tag header's job)", directives.includes("Allow: /"));
check("robots.txt has no real Disallow directive for /h/", !directives.some((line) => line.startsWith("Disallow:")));

const shell = await fetch(`${base}/h/${id}`);
check("SPA route serves the app shell", shell.status === 200 && (await shell.text()).includes("<div id=\"root\">"));

console.log(`\n  ${base}\n`);
for (const [label, passed] of checks) console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}`);
const failed = checks.filter(([, passed]) => !passed).length;
console.log(`\n  ${checks.length - failed}/${checks.length} passed\n`);
console.log(`  live handoff: ${link}\n`);
process.exit(failed ? 1 : 0);
