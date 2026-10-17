-- Preserve Solace-specific calendar metadata locally while linking owned
-- calendars and events to Stalwart JMAP objects.
ALTER TABLE "public"."calendar"
  ADD COLUMN "stalwart_account_id" TEXT,
  ADD COLUMN "stalwart_calendar_id" TEXT,
  ADD COLUMN "stalwart_synced_at" TIMESTAMP(3);

ALTER TABLE "public"."calendar_event"
  ADD COLUMN "stalwart_account_id" TEXT,
  ADD COLUMN "stalwart_calendar_id" TEXT,
  ADD COLUMN "stalwart_event_id" TEXT,
  ADD COLUMN "stalwart_uid" TEXT,
  ADD COLUMN "stalwart_synced_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "calendar_user_id_stalwart_calendar_id_key"
  ON "public"."calendar"("user_id", "stalwart_calendar_id");

CREATE INDEX "calendar_stalwart_account_id_idx"
  ON "public"."calendar"("stalwart_account_id");

CREATE UNIQUE INDEX "calendar_event_user_id_stalwart_event_id_key"
  ON "public"."calendar_event"("user_id", "stalwart_event_id");

CREATE INDEX "calendar_event_stalwart_account_id_stalwart_calendar_id_idx"
  ON "public"."calendar_event"("stalwart_account_id", "stalwart_calendar_id");
