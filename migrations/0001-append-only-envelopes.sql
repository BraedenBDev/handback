-- Move from one-row-per-handoff (envelope overwritten in place) to append-only
-- envelopes. The old table is renamed rather than dropped so the migration is
-- reversible; delete handoffs_v1 once the new shape has been verified in prod.
--
-- Note: rows migrated from the old model bring only their CURRENT envelope.
-- Earlier versions were overwritten and are genuinely gone — this migration
-- cannot invent history that was never stored.

ALTER TABLE handoffs RENAME TO handoffs_v1;

CREATE TABLE handoffs (
  id             TEXT PRIMARY KEY,
  currentVersion INTEGER NOT NULL,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);

CREATE TABLE envelopes (
  handoffId  TEXT NOT NULL,
  version    INTEGER NOT NULL,
  format     TEXT NOT NULL,
  iv         TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  PRIMARY KEY (handoffId, version),
  FOREIGN KEY (handoffId) REFERENCES handoffs(id)
);

INSERT INTO handoffs (id, currentVersion, createdAt, updatedAt)
  SELECT id, version, createdAt, updatedAt FROM handoffs_v1;

INSERT INTO envelopes (handoffId, version, format, iv, ciphertext, createdAt)
  SELECT id,
         version,
         json_extract(envelope, '$.format'),
         json_extract(envelope, '$.iv'),
         json_extract(envelope, '$.ciphertext'),
         updatedAt
  FROM handoffs_v1;
