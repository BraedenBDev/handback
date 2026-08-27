import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../server/app.ts";
import { decryptDocument, encryptDocument, exportKey, generateKey, importKey, readKeyFromFragment } from "../src/crypto.ts";
import { applyContribution } from "../src/contribution.ts";
import { toMarkdown } from "../src/export.ts";
import type { HandoffDocument } from "../shared/schema.ts";

/**
 * The whole product promise in one test: agent A creates, the link survives a
 * full context loss, agent B reads and proposes, a human approves, and agent A
 * reopens the SAME link and sees the contribution.
 */
describe("full handoff lifecycle", () => {
  it("survives create, reopen, contribute, approve and reopen again", async () => {
    const directory = mkdtempSync(join(tmpdir(), "handback-e2e-"));
    try {
      const app = createApp(join(directory, "e2e.sqlite"));

      // --- Agent A: stage and the human approves creation -----------------
      const key = await generateKey();
      const now = "2026-08-27T00:00:00.000Z";
      const v1: HandoffDocument = {
        state: {
          objective: "Choose a gestoría for Almost a Lab",
          summary: "Mi Gestoría declined international work.",
          tasks: [{ title: "Compare quotes", status: "in_progress" }],
        },
        version: 1,
        createdAt: now,
        updatedAt: now,
        history: [],
      };
      const created = await request(app).post("/api/h").send({ envelope: await encryptDocument(key, v1) }).expect(201);

      // The only thing the user keeps. Everything else can be thrown away.
      const link = `https://handback.link/h/${created.body.id}#k=${await exportKey(key)}`;

      // --- Agent B: nothing but the link, no shared memory ----------------
      const recoveredKey = await importKey(readKeyFromFragment(new URL(link).hash)!);
      const fetched = await request(app).get(`/api/h/${created.body.id}`).expect(200);
      const reopened = await decryptDocument(recoveredKey, fetched.body.envelope);
      expect(reopened.state.objective).toBe("Choose a gestoría for Almost a Lab");
      expect(reopened.version).toBe(1);

      // --- Agent B stages a contribution; a human approves it -------------
      const v2 = applyContribution(reopened, {
        baseVersion: reopened.version,
        note: "Adding the transfer-pricing finding",
        operations: [
          { op: "add_decision", value: "Split the engagement", rationale: "Transfer pricing starts at €1,000/mo" },
          { op: "set_task_status", value: "Compare quotes", status: "done" },
        ],
      });
      await request(app)
        .put(`/api/h/${created.body.id}`)
        .send({ envelope: await encryptDocument(recoveredKey, v2), expectedVersion: reopened.version })
        .expect(200);

      // --- Agent A reopens the ORIGINAL link and sees the contribution ----
      const keyFromOriginalLink = await importKey(readKeyFromFragment(new URL(link).hash)!);
      const refetched = await request(app).get(`/api/h/${created.body.id}`).expect(200);
      const final = await decryptDocument(keyFromOriginalLink, refetched.body.envelope);

      expect(final.version).toBe(2);
      expect(final.state.decisions?.[0]?.decision).toBe("Split the engagement");
      expect(final.state.tasks?.[0]?.status).toBe("done");
      expect(final.history.at(-1)?.note).toBe("Adding the transfer-pricing finding");

      // --- And the work walks away as a readable file ---------------------
      const markdown = toMarkdown(final);
      expect(markdown).toContain("Choose a gestoría for Almost a Lab");
      expect(markdown).toContain("Split the engagement");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
