/// <reference types="@cloudflare/vitest-pool-workers" />

// Augments the pool's own `cloudflare:test` declaration rather than replacing
// it, so SELF, env and applyD1Migrations keep their real types.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
