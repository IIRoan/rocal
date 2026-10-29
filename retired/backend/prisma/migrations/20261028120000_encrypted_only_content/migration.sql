BEGIN;

-- Owned names and event content are stored only as client ciphertext: drop plaintext left beside real (non-blank) ciphertext.
UPDATE "calendar" SET "name" = '', "encryption_state" = 'encrypted'
WHERE btrim("encrypted_name") <> '' AND ("name" <> '' OR "encryption_state" <> 'encrypted');

UPDATE "event_category" SET "name" = '', "encryption_state" = 'encrypted'
WHERE btrim("encrypted_name") <> '' AND ("name" <> '' OR "encryption_state" <> 'encrypted');

UPDATE "calendar_event"
SET "title" = '', "description" = NULL, "location" = NULL, "encryption_state" = 'encrypted'
WHERE btrim("encrypted_content") <> ''
  AND ("title" <> '' OR "description" IS NOT NULL OR "location" IS NOT NULL OR "encryption_state" <> 'encrypted');

-- The server-seeded Personal/Work/Family calendars, still as seeded and unused; clients now seed encrypted defaults.
DELETE FROM "calendar" c
WHERE c."kind" = 'owned'
  AND NOT c."is_sync_only"
  AND NOT c."is_public"
  AND c."is_visible"
  AND c."encrypted_name" IS NULL
  AND (c."name", c."color", c."is_default") IN (('Personal', '#10b981', true), ('Work', '#3b82f6', false), ('Family', '#f43f5e', false))
  AND NOT EXISTS (SELECT 1 FROM "calendar_event" e WHERE e."calendar_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "calendar_subscription" s WHERE s."calendar_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "user_settings" s WHERE s."default_calendar_id" = c."id");

-- Profile pictures are uploads only; nothing points at another host.
UPDATE "user" SET "image" = NULL
WHERE "image" IS NOT NULL AND "image" NOT LIKE '/api/profiles/avatars/%';

COMMIT;
