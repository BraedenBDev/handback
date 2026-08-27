import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { decryptDocument, encryptDocument, exportKey, generateKey, importKey, readKeyFromFragment } from "../../src/crypto.ts";
import { applyContribution } from "../../src/contribution.ts";
import { stampDocument, verifyDocument } from "../../src/hash.ts";
import { toMarkdown } from "../../src/export.ts";
import type { HandoffDocument } from "../../shared/schema.ts";

/**
 * The whole product promise against the real Worker: agent A creates, the link
 * survives a full context loss, agent B reads and proposes, a human approves,
 * and agent A reopens the SAME link and sees the contribution.
 */
describe("full handoff lifecycle", () => {
  it("survives create, reopen, contribute, approve and reopen again", async () => {
    const origin = "https://handback.link";
    const key = await generateKey();
    const now = "2026-08-27T00:00:00.000Z";

    const v1: HandoffDocument = await stampDocument({
      state: {
        objective: "Choose a gestoría for Almost a Lab",
        summary: "Mi Gestoría declined international work.",
        tasks: [{ title: "Compare quotes", status: "in_progress" }],
      },
      version: 1, createdAt: now, updatedAt: now, parentHash: null, history: [],
    });

    const created = await SELF.fetch(`${origin}/api/h`, {
      method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify({ envelope: await encryptDocument(key, v1) }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    // The only thing the user keeps. Everything else can be thrown away.
    const link = `${origin}/h/${id}#k=${await exportKey(key)}`;

    // --- Agent B: nothing but the link, no shared memory --------------------
    const recoveredKey = await importKey(readKeyFromFragment(new URL(link).hash)!);
    const fetched = (await (await SELF.fetch(`${origin}/api/h/${id}`)).json()) as any;
    const reopened = await decryptDocument(recoveredKey, fetched.envelope);
    expect(reopened.state.objective).toBe("Choose a gestoría for Almost a Lab");
    await expect(verifyDocument(reopened)).resolves.toBe("verified");

    // --- Agent B proposes; a human approves ---------------------------------
    const v2 = await stampDocument(applyContribution(reopened, {
      baseVersion: reopened.version,
      note: "Adding the transfer-pricing finding",
      operations: [
        { op: "add_decision", value: "Split the engagement", rationale: "Transfer pricing starts at €1,000/mo" },
        { op: "set_task_status", value: "Compare quotes", status: "done" },
      ],
    }));
    expect(v2.parentHash).toBe(v1.contentHash);

    const saved = await SELF.fetch(`${origin}/api/h/${id}`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelope: await encryptDocument(recoveredKey, v2), expectedVersion: reopened.version }),
    });
    expect(saved.status).toBe(200);

    // --- Agent A reopens the ORIGINAL link ----------------------------------
    const keyFromOriginalLink = await importKey(readKeyFromFragment(new URL(link).hash)!);
    const refetched = (await (await SELF.fetch(`${origin}/api/h/${id}`)).json()) as any;
    const final = await decryptDocument(keyFromOriginalLink, refetched.envelope);

    expect(final.version).toBe(2);
    expect(final.state.decisions?.[0]?.decision).toBe("Split the engagement");
    expect(final.state.tasks?.[0]?.status).toBe("done");
    await expect(verifyDocument(final)).resolves.toBe("verified");

    // --- Version 1 is still recoverable -------------------------------------
    const historical = (await (await SELF.fetch(`${origin}/api/h/${id}?version=1`)).json()) as any;
    const restored = await decryptDocument(keyFromOriginalLink, historical.envelope);
    expect(restored.version).toBe(1);
    expect(restored.state.tasks?.[0]?.status).toBe("in_progress");

    // --- And the work walks away as a readable file -------------------------
    expect(toMarkdown(final)).toContain("Split the engagement");
  });
});
