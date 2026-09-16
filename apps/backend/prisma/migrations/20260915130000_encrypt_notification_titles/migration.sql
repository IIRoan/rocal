-- Reminder titles and new-mail sender/subject must not be readable server-side.
-- Clients now send an AES-GCM ciphertext of the reminder title; existing
-- plaintext titles are discarded (reminders fall back to generic copy).

ALTER TABLE "event_notification" ADD COLUMN "encrypted_display_title" TEXT;

UPDATE "event_notification" SET "display_title" = NULL WHERE "display_title" IS NOT NULL;

ALTER TABLE "event_notification" DROP COLUMN "display_title";

-- Strip plaintext mail/reminder display fields from queued and historical jobs.
UPDATE "notification_job"
SET "payload" = "payload" - 'subject' - 'fromName' - 'title'
WHERE "payload" ?| ARRAY['subject', 'fromName', 'title'];
