-- Calendar and category names are encrypted client-side and the plaintext
-- column is stored as "" once ciphertext exists, so (user_id, name) can no
-- longer be unique. Duplicate plaintext names are still rejected in services.
DROP INDEX IF EXISTS "calendar_user_id_name_key";
DROP INDEX IF EXISTS "event_category_user_id_name_key";

-- Keep per-user category lookups indexed after dropping the composite key.
CREATE INDEX IF NOT EXISTS "event_category_user_id_idx" ON "event_category"("user_id");
