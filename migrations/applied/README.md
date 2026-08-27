# Applied migrations

One-off migrations already run against production D1. They are kept for the
record and are NOT re-runnable: `2026-08-27-append-only-envelopes.sql` rewrites
an older schema that no longer exists on a fresh database.

Forward migrations that build a database from empty live in `migrations/`, which
is what the test suite applies.
