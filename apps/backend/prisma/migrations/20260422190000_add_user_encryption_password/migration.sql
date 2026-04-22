CREATE TABLE "user_encryption_password" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kdf_algorithm" TEXT NOT NULL DEFAULT 'PBKDF2-SHA-256',
  "kdf_salt" TEXT NOT NULL,
  "kdf_iterations" INTEGER NOT NULL DEFAULT 310000,
  "wrapped_account_key" TEXT NOT NULL,
  "wrapped_search_key" TEXT NOT NULL,
  "wrap_algorithm" TEXT NOT NULL DEFAULT 'AES-GCM-256',
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_encryption_password_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_encryption_password_user_id_key"
ON "user_encryption_password"("user_id");

ALTER TABLE "user_encryption_password"
ADD CONSTRAINT "user_encryption_password_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;