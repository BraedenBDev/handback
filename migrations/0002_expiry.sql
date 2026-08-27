-- Handoffs expire on a sliding window: retentionDays after the last approved
-- write, not after creation. A colleague who picks one up on day six and
-- contributes should not watch it vanish under them on day seven.
--
-- NULL retentionDays means the creator chose "never", and expiresAt stays NULL.
ALTER TABLE handoffs ADD COLUMN retentionDays INTEGER;
ALTER TABLE handoffs ADD COLUMN expiresAt TEXT;
