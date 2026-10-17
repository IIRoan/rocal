CREATE TABLE "mail_jmap_sync_state" (
    "id" TEXT NOT NULL,
    "directory_entry_id" TEXT NOT NULL,
    "stalwart_account_id" TEXT NOT NULL,
    "email_state" TEXT NOT NULL,
    "mailbox_state" TEXT NOT NULL,
    "thread_state" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_jmap_sync_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_jmap_sync_state_directory_entry_id_key" ON "mail_jmap_sync_state"("directory_entry_id");
CREATE UNIQUE INDEX "mail_jmap_sync_state_stalwart_account_id_key" ON "mail_jmap_sync_state"("stalwart_account_id");

ALTER TABLE "mail_jmap_sync_state"
ADD CONSTRAINT "mail_jmap_sync_state_directory_entry_id_fkey"
FOREIGN KEY ("directory_entry_id") REFERENCES "mail_directory_entry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
