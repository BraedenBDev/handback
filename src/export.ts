import type { HandoffDocument } from "../shared/schema.ts";

/**
 * The survival path. If this service disappears, the user still has the work.
 * The JSON export is deliberately plaintext: it lands on the user's own disk,
 * they already hold the key, and an export they cannot open without the
 * original link would not be a backup at all. The UI says so plainly.
 */
export function toPortableJson(doc: HandoffDocument): string {
  return JSON.stringify({ format: "handback-portable-v1", exportedAt: new Date().toISOString(), ...doc }, null, 2);
}

export function toMarkdown(doc: HandoffDocument): string {
  const { state } = doc;
  const lines: string[] = [
    `# ${state.objective}`,
    "",
    `*Handback version ${doc.version} — updated ${doc.updatedAt}*`,
    "",
    "## Where this stands",
    "",
    state.summary,
    "",
  ];

  if (state.decisions?.length) {
    lines.push("## Decisions", "");
    for (const item of state.decisions) lines.push(`- **${item.decision}** — ${item.rationale}`);
    lines.push("");
  }
  if (state.constraints?.length) {
    lines.push("## Constraints", "");
    for (const item of state.constraints) lines.push(`- \`${item.kind}\` ${item.text}`);
    lines.push("");
  }
  if (state.tasks?.length) {
    lines.push("## Tasks", "");
    for (const task of state.tasks) lines.push(`- [${task.status === "done" ? "x" : " "}] ${task.title} (${task.status})`);
    lines.push("");
  }
  if (state.openQuestions?.length) {
    lines.push("## Open questions", "");
    for (const question of state.openQuestions) lines.push(`- ${question}`);
    lines.push("");
  }
  if (state.sources?.length) {
    lines.push("## Sources", "");
    for (const source of state.sources) lines.push(`- [${source.title}](${source.url})`);
    lines.push("");
  }
  if (state.handoffNote) lines.push("## Note to whoever picks this up", "", state.handoffNote, "");
  if (doc.history.length) {
    lines.push("## History", "");
    for (const entry of doc.history) lines.push(`- v${entry.version} — ${entry.note} (${entry.approvedAt})`);
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadFile(filename: string, contents: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
