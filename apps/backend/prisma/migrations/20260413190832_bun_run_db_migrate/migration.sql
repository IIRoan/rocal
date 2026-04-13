-- CreateIndex
CREATE INDEX "calendar_event_user_id_start_end_idx" ON "calendar_event"("user_id", "start", "end");

-- CreateIndex
CREATE INDEX "calendar_event_user_id_recurrence_parent_event_id_idx" ON "calendar_event"("user_id", "recurrence", "parent_event_id");
