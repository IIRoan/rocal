-- AlterTable
ALTER TABLE "public"."event_notification"
  ADD COLUMN "notification_date_local" TEXT,
  ADD COLUMN "notification_timezone" TEXT NOT NULL DEFAULT 'UTC';

UPDATE "public"."event_notification" en
SET
  "notification_timezone" = COALESCE(NULLIF(ce."timezone", ''), 'UTC'),
  "notification_date_local" = to_char(
    timezone(
      COALESCE(NULLIF(ce."timezone", ''), 'UTC'),
      en."notification_time"
    ),
    'YYYY-MM-DD"T"HH24:MI:SS'
  )
FROM "public"."calendar_event" ce
WHERE ce."id" = en."event_id"
  AND en."notification_date_local" IS NULL;

UPDATE "public"."event_notification"
SET "notification_date_local" = to_char("notification_time", 'YYYY-MM-DD"T"HH24:MI:SS')
WHERE "notification_date_local" IS NULL;

ALTER TABLE "public"."event_notification"
  ALTER COLUMN "notification_date_local" SET NOT NULL;
