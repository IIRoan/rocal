-- Allow one pending new-mail push per inbound JMAP email instead of one
-- pending push per user, so consecutive messages each get a lock-screen alert.

DROP INDEX IF EXISTS "notification_job_pending_new_mail_push_user_idx";

CREATE UNIQUE INDEX "notification_job_pending_new_mail_email_idx"
  ON "notification_job" ("user_id", (payload->>'emailId'))
  WHERE "kind" = 'new_mail'
    AND "channel" = 'push'
    AND "status" = 'pending'
    AND payload->>'emailId' IS NOT NULL;
