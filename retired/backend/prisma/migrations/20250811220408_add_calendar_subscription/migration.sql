-- AlterTable
ALTER TABLE "public"."calendar_event" ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "is_synced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subscription_id" TEXT,
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."calendar_subscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sync_interval_minutes" INTEGER NOT NULL DEFAULT 15,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" TEXT NOT NULL DEFAULT 'pending',
    "last_error_message" TEXT,
    "etag" TEXT,
    "last_modified" TEXT,
    "user_id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."calendar_sync_log" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "events_added" INTEGER NOT NULL DEFAULT 0,
    "events_updated" INTEGER NOT NULL DEFAULT 0,
    "events_deleted" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "sync_duration_ms" INTEGER,
    "http_status_code" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "calendar_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_subscription_is_active_last_sync_at_idx" ON "public"."calendar_subscription"("is_active", "last_sync_at");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_subscription_user_id_url_key" ON "public"."calendar_subscription"("user_id", "url");

-- CreateIndex
CREATE INDEX "calendar_sync_log_subscription_id_started_at_idx" ON "public"."calendar_sync_log"("subscription_id", "started_at");

-- CreateIndex
CREATE INDEX "calendar_sync_log_status_started_at_idx" ON "public"."calendar_sync_log"("status", "started_at");

-- CreateIndex
CREATE INDEX "calendar_event_is_synced_subscription_id_idx" ON "public"."calendar_event"("is_synced", "subscription_id");

-- CreateIndex
CREATE INDEX "calendar_event_external_id_subscription_id_idx" ON "public"."calendar_event"("external_id", "subscription_id");

-- AddForeignKey
ALTER TABLE "public"."calendar_subscription" ADD CONSTRAINT "calendar_subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calendar_subscription" ADD CONSTRAINT "calendar_subscription_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calendar_sync_log" ADD CONSTRAINT "calendar_sync_log_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."calendar_subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
