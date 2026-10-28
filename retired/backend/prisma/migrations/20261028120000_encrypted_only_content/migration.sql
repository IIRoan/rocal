-- Owned names and event content are stored only as client ciphertext: drop plaintext left beside it.
UPDATE "calendar" SET "name" = '', "encryption_state" = 'encrypted'
WHERE "encrypted_name" IS NOT NULL AND ("name" <> '' OR "encryption_state" <> 'encrypted');

UPDATE "event_category" SET "name" = '', "encryption_state" = 'encrypted'
WHERE "encrypted_name" IS NOT NULL AND ("name" <> '' OR "encryption_state" <> 'encrypted');

UPDATE "calendar_event"
SET "title" = '', "description" = NULL, "location" = NULL, "encryption_state" = 'encrypted'
WHERE "encrypted_content" IS NOT NULL
  AND ("title" <> '' OR "description" IS NOT NULL OR "location" IS NOT NULL OR "encryption_state" <> 'encrypted');

-- Empty server-seeded calendars whose names were never encrypted; clients now seed encrypted defaults.
DELETE FROM "calendar" c
WHERE c."kind" = 'owned'
  AND NOT c."is_sync_only"
  AND c."encrypted_name" IS NULL
  AND NOT (c."name" = 'Invitations' AND NOT c."is_visible")
  AND NOT EXISTS (SELECT 1 FROM "calendar_event" e WHERE e."calendar_id" = c."id");

UPDATE "user_settings" s SET "default_calendar_id" = NULL
WHERE s."default_calendar_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "calendar" c WHERE c."id" = s."default_calendar_id");
