-- Index-only scan for the realtime poller's linked-account lookup (WHERE user_id IS NOT NULL).
CREATE INDEX "mail_directory_entry_linked_cover_idx"
ON "mail_directory_entry" ("user_id")
INCLUDE ("id", "email", "stalwart_account_id")
WHERE "user_id" IS NOT NULL;
