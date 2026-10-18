-- The invite is the approval, so every account that already accepted one may
-- provision a mailbox without a manual step.
UPDATE "user" u
SET "mailbox_approved_at" = COALESCE(i."claimed_at", i."updated_at", now())
FROM "invite" i
WHERE u."mailbox_approved_at" IS NULL
  AND i."status" = 'accepted'
  AND lower(COALESCE(i."claimed_for_email", i."email")) = lower(u."email");
