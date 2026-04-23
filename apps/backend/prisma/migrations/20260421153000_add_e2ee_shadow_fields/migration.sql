ALTER TABLE "calendar"
ADD COLUMN "encrypted_name" TEXT,
ADD COLUMN "blind_index_tokens" TEXT,
ADD COLUMN "encryption_state" TEXT NOT NULL DEFAULT 'plaintext',
ADD COLUMN "encryption_key_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "event_category"
ADD COLUMN "encrypted_name" TEXT,
ADD COLUMN "blind_index_tokens" TEXT,
ADD COLUMN "encryption_state" TEXT NOT NULL DEFAULT 'plaintext',
ADD COLUMN "encryption_key_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "calendar_event"
ADD COLUMN "encrypted_content" TEXT,
ADD COLUMN "blind_index_tokens" TEXT,
ADD COLUMN "encryption_state" TEXT NOT NULL DEFAULT 'plaintext',
ADD COLUMN "encryption_key_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "user_encryption_device" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "device_label" TEXT,
  "public_key" TEXT NOT NULL,
  "public_key_algorithm" TEXT NOT NULL DEFAULT 'RSA-OAEP-256',
  "wrapped_account_key" TEXT NOT NULL,
  "wrapped_search_key" TEXT NOT NULL,
  "wrap_algorithm" TEXT NOT NULL DEFAULT 'RSA-OAEP-256',
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_encryption_device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_encryption_device_user_id_device_id_key"
ON "user_encryption_device"("user_id", "device_id");

CREATE INDEX "user_encryption_device_user_id_last_seen_at_idx"
ON "user_encryption_device"("user_id", "last_seen_at");

ALTER TABLE "user_encryption_device"
ADD CONSTRAINT "user_encryption_device_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;