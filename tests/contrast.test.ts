import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrast is checked against the tokens as they are actually written in
 * style.css, not against a copy of them. A palette this warm is exactly the
 * kind that drifts a shade lighter during polish and quietly drops under 4.5:1.
 */

const css = readFileSync(join(import.meta.dirname, "..", "src", "style.css"), "utf8");

function tokensIn(blockSelector: string): Record<string, string> {
  const start = css.indexOf(blockSelector);
  if (start === -1) throw new Error(`No block matching ${blockSelector} in style.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) tokens[match[1]!] = match[2]!;
  return tokens;
}

const relativeLuminance = (hexColor: string) => {
  const channels = [1, 3, 5].map((i) => parseInt(hexColor.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** [label, foreground token, background token, minimum ratio] */
const PAIRS: Array<[string, string, string, number]> = [
  ["body text", "ink", "paper", 4.5],
  ["muted text", "ink-muted", "paper", 4.5],
  ["muted text on sunken", "ink-muted", "paper-sunken", 4.5],
  ["ink on raised", "ink", "paper-raised", 4.5],
  ["amber on paper", "amber", "paper", 4.5],
  ["amber on its own surface", "amber", "amber-surface", 4.5],
  ["seal on paper", "seal", "paper", 4.5],
  ["seal on its own surface", "seal", "seal-surface", 4.5],
  ["danger on paper", "danger", "paper", 4.5],
  ["danger on its own surface", "danger", "danger-surface", 4.5],
  ["primary button label", "paper", "ink", 4.5],
  ["focus ring against paper", "amber", "paper", 3.0],
  ["strong rule against paper", "rule-strong", "paper", 1.5],
];

describe.each([
  ["light", ":root {"],
  ["dark", ':root[data-theme="dark"] {'],
])("%s theme meets WCAG AA", (_theme, selector) => {
  const tokens = tokensIn(selector);

  it("defines every token the pairs reference", () => {
    for (const [, fg, bg] of PAIRS) {
      expect(tokens[fg], `--${fg} missing`).toBeTruthy();
      expect(tokens[bg], `--${bg} missing`).toBeTruthy();
    }
  });

  it.each(PAIRS)("%s clears %s:1", (label, fg, bg, min) => {
    const ratio = contrast(tokens[fg]!, tokens[bg]!);
    expect(ratio, `${label}: ${tokens[fg]} on ${tokens[bg]} is ${ratio.toFixed(2)}:1, needs ${min}:1`)
      .toBeGreaterThanOrEqual(min);
  });
});

describe("both themes stay in step", () => {
  it("defines the same token names in light and dark", () => {
    const light = Object.keys(tokensIn(":root {")).sort();
    const dark = Object.keys(tokensIn(':root[data-theme="dark"] {')).sort();
    // A token defined in one theme only renders as an inherited surprise in the other.
    expect(dark).toEqual(light.filter((name) => dark.includes(name)));
    for (const name of ["paper", "ink", "amber", "seal", "danger"]) {
      expect(light).toContain(name);
      expect(dark).toContain(name);
    }
  });

  it("actually inverts, rather than shipping the light palette twice", () => {
    const light = tokensIn(":root {");
    const dark = tokensIn(':root[data-theme="dark"] {');
    expect(relativeLuminance(light.paper!)).toBeGreaterThan(relativeLuminance(dark.paper!));
    expect(relativeLuminance(light.ink!)).toBeLessThan(relativeLuminance(dark.ink!));
  });
});
