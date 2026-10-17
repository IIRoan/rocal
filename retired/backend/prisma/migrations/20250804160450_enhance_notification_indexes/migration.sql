-- DropIndex
DROP INDEX "event_notification_event_id_idx";

-- DropIndex
DROP INDEX "event_notification_is_enabled_is_sent_idx";

-- DropIndex
DROP INDEX "event_notification_notification_time_idx";

-- DropIndex
DROP INDEX "event_notification_notification_type_idx";

-- DropIndex
DROP INDEX "notification_log_sent_at_idx";

-- DropIndex
DROP INDEX "notification_log_status_idx";

-- CreateIndex
CREATE INDEX "idx_event_notification_time_enabled_sent" ON "event_notification"("notification_time", "is_enabled", "is_sent");

-- CreateIndex
CREATE INDEX "idx_event_notification_event_type" ON "event_notification"("event_id", "notification_type");

-- CreateIndex
CREATE INDEX "idx_event_notification_sent_created" ON "event_notification"("is_sent", "created_at");

-- CreateIndex
CREATE INDEX "idx_notification_log_sent_at_status" ON "notification_log"("sent_at", "status");

-- CreateIndex
CREATE INDEX "idx_notification_log_user_sent" ON "notification_log"("user_id", "sent_at");

-- CreateIndex
CREATE INDEX "idx_notification_log_failed" ON "notification_log"("status", "created_at");
