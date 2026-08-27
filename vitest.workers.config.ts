import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

/**
 * API tests run inside workerd against the real Worker and a real (local) D1.
 *
 * There used to be a parallel Express implementation of these same routes, and
 * the suite tested THAT while the Worker was what actually shipped. The only
 * thing holding them in step was a smoke script run by hand after each deploy.
 * Express is gone; this is the one implementation and these tests exercise it.
 */
const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

export default defineWorkersConfig({
  test: {
    include: ["tests/worker/**/*.test.ts"],
    setupFiles: ["./tests/worker/setup.ts"],
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Each test file gets its own storage, so version numbers from one
          // file cannot leak into another's expectations.
          isolatedStorage: true,
          bindings: { TEST_MIGRATIONS: migrations },
        },
      },
    },
  },
});
