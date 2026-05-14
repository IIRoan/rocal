ALTER TABLE "mail_directory_entry"
ADD COLUMN "user_id" TEXT;

UPDATE "mail_directory_entry" AS mail
SET "user_id" = users."id"
FROM "user" AS users
WHERE lower(mail."email") = lower(users."email")
  AND mail."user_id" IS NULL;

CREATE UNIQUE INDEX "mail_directory_entry_user_id_key"
ON "mail_directory_entry"("user_id");

ALTER TABLE "mail_directory_entry"
ADD CONSTRAINT "mail_directory_entry_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;