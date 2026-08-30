/**
 * Refetches the self-hosted webfonts into public/fonts/.
 *
 * The site does not load fonts from Google: that sent every visitor's IP to a
 * third party, and put a render-blocking request to a host we do not control on
 * the critical path. This script pulls the woff2 files once so they can be
 * served from our own origin, and is only needed when a family or weight
 * changes.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * Both families are variable, so Google returns one file per style per subset
 * and every weight interpolates from it. Only latin and latin-ext are kept; the
 * site is English and the other subsets are dead weight.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API =
  "https://fonts.googleapis.com/css2?family=Vollkorn:ital,wght@0,400;0,600;0,700;1,400" +
  "&family=Spline+Sans+Mono:wght@400;500;600;700&display=swap";

// Without a modern browser UA, Google serves ttf instead of woff2.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const NAMES = {
  "Vollkorn|normal|latin": "vollkorn-latin.woff2",
  "Vollkorn|normal|latin-ext": "vollkorn-latin-ext.woff2",
  "Vollkorn|italic|latin": "vollkorn-italic-latin.woff2",
  "Vollkorn|italic|latin-ext": "vollkorn-italic-latin-ext.woff2",
  "Spline Sans Mono|normal|latin": "spline-sans-mono-latin.woff2",
  "Spline Sans Mono|normal|latin-ext": "spline-sans-mono-latin-ext.woff2",
};

const css = await fetch(API, { headers: { "User-Agent": UA } }).then((r) => r.text());
const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[\s\S]*?\})/g)];

const out = path.join(process.cwd(), "public", "fonts");
await mkdir(out, { recursive: true });

const written = new Set();
for (const [, subset, block] of blocks) {
  if (subset !== "latin" && subset !== "latin-ext") continue;
  const family = /font-family:\s*'([^']+)'/.exec(block)[1];
  const style = /font-style:\s*(\w+)/.exec(block)[1];
  const name = NAMES[`${family}|${style}|${subset}`];
  if (!name || written.has(name)) continue;
  const url = /url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/.exec(block)[1];
  const body = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
  await writeFile(path.join(out, name), body);
  written.add(name);
  console.log(`${name}  ${(body.length / 1024).toFixed(0)}KB`);
}
console.log(`\n${written.size} files. The @font-face blocks in src/style.css reference these by name.`);
