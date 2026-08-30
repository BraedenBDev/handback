/**
 * scripts/render-assets.mjs — rasterises the two hand-authored SVG/HTML sources
 * into the PNGs that Apple and the unfurlers need. Playwright only; no extra dep.
 *
 *   node scripts/render-assets.mjs
 *
 * Writes:
 *   public/og.png                 1200x630, from public/og.html
 *   public/apple-touch-icon.png    180x180 opaque, from public/apple-touch-icon-source.svg
 *   public/favicon-32.png / -16.png  raster fallback for browsers without SVG favicons
 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";

const ROOT = process.argv[2] ?? process.cwd();
const pub = (f) => path.join(ROOT, "public", f);
// Hand-authored render SOURCES live in design/, not public/, so they are not
// themselves served as pages. Only the rendered PNGs ship.
const dsn = (f) => path.join(ROOT, "design", f);

const browser = await chromium.launch();

// --- og.png ---------------------------------------------------------------
// 1200x630 is the size the OG spec asks for and what every unfurler resamples
// from, so there is no 2x variant to keep in sync. colorScheme is forced light
// because a PNG cannot adapt afterwards, and a dark-preferring machine running
// this would otherwise bake the wrong card.
{
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(dsn("og.html")).href, { waitUntil: "networkidle" });
  // Without this the webfonts are still swapping and the card renders in Georgia.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: pub("og.png") });
  await ctx.close();
}

// --- apple-touch-icon.png + raster favicon fallbacks -----------------------
// The SVG is inlined into an HTML shell rather than navigated to directly:
// Chromium opens a bare .svg as an *image document*, which cannot be styled and
// letterboxes at sizes other than its intrinsic one.
// omitBackground stays false — iOS paints every transparent pixel black.
for (const [file, size, out] of [
  ["apple-touch-icon-source.svg", 180, "apple-touch-icon.png"],
  ["favicon.svg", 32, "favicon-32.png"],
  ["favicon.svg", 16, "favicon-16.png"],
]) {
  const svg = await readFile(file.endsWith("-source.svg") ? dsn(file) : pub(file), "utf8");
  const ctx = await browser.newContext({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
    colorScheme: "light", // the PNG fallbacks bake the light variant, the one Safari sees
  });
  const page = await ctx.newPage();
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:#FBF9F5}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: pub(out), omitBackground: false });
  await ctx.close();
}

await browser.close();
console.log("rendered og.png, apple-touch-icon.png, favicon-32.png, favicon-16.png");
