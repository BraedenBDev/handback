import { applyD1Migrations, env } from "cloudflare:test";

// Builds each test database from migrations/ rather than a schema copied into
// the tests, so a migration that does not actually work is a test failure.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
