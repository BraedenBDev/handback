/**
 * Smoke test against a live deployment. Run: node scripts/smoke-live.ts <base-url>
 * Exercises the same lifecycle as tests/roundtrip.test.ts, but over the network
 * against the real Worker and real D1, because a passing local suite says
 * nothing about whether the deployed thing behaves the same.
 */
import { decryptDocument, encryptDocument, exportKey, generateKey, importKey } from "../src/crypto.ts";
import { applyContribution } from "../src/contribution.ts";
import type { HandoffDocument } from "../shared/schema.ts";

const base = process.argv[2] ?? "http://localhost:8787";
const checks: Array<[string, boolean]> = [];
const check = (label: string, passed: boolean) => checks.push([label, passed]);

const now = new Date().toISOString();
const SENTINEL = `SMOKE-${now}`;
const v1: HandoffDocument = {
  state: { objective: `Live smoke ${SENTINEL}`, summary: "Written by scripts/smoke-live.ts", tasks: [{ title: "Deploy", status: "in_progress" }] },
  version: 1, createdAt: now, updatedAt: now, history: [],
};

const key = await generateKey();
const created = await fetch(`${base}/api/h`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v1) }),
});
check("POST /api/h returns 201", created.status === 201);
const { id } = await created.json() as { id: string };

const link = `${base}/h/${id}#k=${await exportKey(key)}`;

// Reopen with nothing but the link.
const fetched = await fetch(`${base}/api/h/${id}`);
const stored = await fetched.json() as { version: number; envelope: any };
const reopened = await decryptDocument(await importKey(new URL(link).hash.replace("#k=", "")), stored.envelope);
check("reopened via link decrypts", reopened.state.objective === `Live smoke ${SENTINEL}`);
check("server returned no plaintext", !JSON.stringify(stored).includes(SENTINEL));

// Contribute against the correct version.
const v2 = applyContribution(reopened, {
  baseVersion: reopened.version, note: "smoke contribution",
  operations: [{ op: "set_task_status", value: "Deploy", status: "done" }],
});
const put = await fetch(`${base}/api/h/${id}`, {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope: await encryptDocument(key, v2), expectedVersion: reopened.version }),
});
check("PUT with correct expectedVersion returns 200", put.status === 200);

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

const shell = await fetch(`${base}/h/${id}`);
check("SPA route serves the app shell", shell.status === 200 && (await shell.text()).includes("<div id=\"root\">"));

console.log(`\n  ${base}\n`);
for (const [label, passed] of checks) console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}`);
const failed = checks.filter(([, passed]) => !passed).length;
console.log(`\n  ${checks.length - failed}/${checks.length} passed\n`);
console.log(`  live handoff: ${link}\n`);
process.exit(failed ? 1 : 0);
