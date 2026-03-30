ALTER TABLE "public"."calendar"
ADD COLUMN "ics_share_token" TEXT,
ADD COLUMN "ics_share_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "calendar_ics_share_token_key"
ON "public"."calendar"("ics_share_token");

