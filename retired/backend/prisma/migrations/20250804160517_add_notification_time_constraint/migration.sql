-- Add constraint to ensure notification_time is in the future when created
-- This constraint ensures data integrity for the notification system
ALTER TABLE "event_notification" 
ADD CONSTRAINT "chk_notification_time_future" 
CHECK ("notification_time" > "created_at");