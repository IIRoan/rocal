-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "push_notifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "push_device" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_job" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "event_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_device_token_hash_key" ON "push_device"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "push_device_user_id_token_hash_key" ON "push_device"("user_id", "token_hash");

-- CreateIndex
CREATE INDEX "push_device_user_id_is_enabled_idx" ON "push_device"("user_id", "is_enabled");

-- CreateIndex
CREATE INDEX "idx_notification_job_status_available" ON "notification_job"("status", "available_at");

-- CreateIndex
CREATE INDEX "idx_notification_job_user_kind_status" ON "notification_job"("user_id", "kind", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_job_pending_new_mail_push_user_idx"
  ON "notification_job"("user_id")
  WHERE "kind" = 'new_mail' AND "channel" = 'push' AND "status" = 'pending';

-- AddForeignKey
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_job" ADD CONSTRAINT "notification_job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
