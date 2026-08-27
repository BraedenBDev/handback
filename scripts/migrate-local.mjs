/**
 * Applies every forward migration, in order, to a local D1.
 *
 * The Playwright web server used to name 0001_initial.sql directly, so adding a
 * migration silently left the end-to-end database a schema behind and the
 * failure surfaced as "the create button does nothing". Reading the directory
 * means a new migration is picked up without anyone remembering to.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (!files.length) throw new Error(`No migrations found in ${dir}`);

const persistTo = process.argv[2] ?? ".wrangler/e2e";
for (const file of files) {
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "handback", "--local", "--persist-to", persistTo, "--file", join(dir, file)],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  console.log(`  applied ${file}`);
}
