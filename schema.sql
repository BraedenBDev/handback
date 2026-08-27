CREATE TABLE IF NOT EXISTS handoffs (
  id         TEXT PRIMARY KEY,
  version    INTEGER NOT NULL,
  envelope   TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
);
