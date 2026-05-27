ALTER TABLE "event_participant"
ADD COLUMN "email" TEXT,
ADD COLUMN "display_name" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

UPDATE "event_participant" AS ep
SET
  "email" = LOWER(BTRIM(u."email")),
  "display_name" = COALESCE(NULLIF(BTRIM(u."name"), ''), LOWER(BTRIM(u."email")))
FROM "user" AS u
WHERE ep."user_id" = u."id";

UPDATE "event_participant"
SET "email" = CONCAT("id", '@participants.solace.local')
WHERE "email" IS NULL OR BTRIM("email") = '';

ALTER TABLE "event_participant"
ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "event_participant"
DROP CONSTRAINT IF EXISTS "event_participant_event_id_user_id_key";

CREATE INDEX IF NOT EXISTS "event_participant_event_id_user_id_idx"
ON "event_participant"("event_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "event_participant_event_id_email_key"
ON "event_participant"("event_id", "email");
