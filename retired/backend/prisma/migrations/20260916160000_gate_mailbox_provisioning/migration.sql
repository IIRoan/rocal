-- Mailbox provisioning now needs explicit backend approval.
ALTER TABLE "user" ADD COLUMN "mailbox_approved_at" TIMESTAMP(3);

-- Grandfather every account that already has a provisioned mailbox, so the
-- gate never locks out a working user.
UPDATE "user" u
SET "mailbox_approved_at" = now()
FROM "mail_directory_entry" e
WHERE e."user_id" = u."id";
