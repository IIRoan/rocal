-- CreateTable
CREATE TABLE "event_notification" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "minutes_before" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "minutes_before" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_notification_event_id_idx" ON "event_notification"("event_id");

-- CreateIndex
CREATE INDEX "event_notification_notification_type_idx" ON "event_notification"("notification_type");

-- CreateIndex
CREATE INDEX "notification_log_event_id_user_id_idx" ON "notification_log"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "notification_log_sent_at_idx" ON "notification_log"("sent_at");

-- CreateIndex
CREATE INDEX "notification_log_status_idx" ON "notification_log"("status");

-- AddForeignKey
ALTER TABLE "event_notification" ADD CONSTRAINT "event_notification_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
