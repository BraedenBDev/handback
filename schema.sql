CREATE TABLE IF NOT EXISTS handoffs (
  id             TEXT PRIMARY KEY,
  currentVersion INTEGER NOT NULL,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS envelopes (
  handoffId  TEXT NOT NULL,
  version    INTEGER NOT NULL,
  format     TEXT NOT NULL,
  iv         TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  PRIMARY KEY (handoffId, version),
  FOREIGN KEY (handoffId) REFERENCES handoffs(id)
);
