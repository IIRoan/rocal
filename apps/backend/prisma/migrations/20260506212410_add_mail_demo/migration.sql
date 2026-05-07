-- CreateTable
CREATE TABLE "mail_directory_entry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "local_part" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "display_name" TEXT,
    "stalwart_account_id" TEXT NOT NULL,
    "stalwart_domain_id" TEXT NOT NULL,
    "stalwart_public_key_id" TEXT,
    "public_key_armored" TEXT NOT NULL,
    "public_key_fingerprint" TEXT NOT NULL,
    "key_algorithm" TEXT NOT NULL DEFAULT 'openpgp',
    "source" TEXT NOT NULL DEFAULT 'internal',
    "trust" TEXT NOT NULL DEFAULT 'verified',
    "key_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_directory_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_vault_backup" (
    "id" TEXT NOT NULL,
    "directory_entry_id" TEXT NOT NULL,
    "vault_version" INTEGER NOT NULL,
    "encrypted_vault_b64" TEXT NOT NULL,
    "kdf" TEXT NOT NULL,
    "kdf_salt_b64" TEXT NOT NULL,
    "kdf_memory_kib" INTEGER NOT NULL,
    "kdf_iterations" INTEGER NOT NULL,
    "kdf_parallelism" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_vault_backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_directory_entry_email_key" ON "mail_directory_entry"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mail_directory_entry_stalwart_account_id_key" ON "mail_directory_entry"("stalwart_account_id");

-- CreateIndex
CREATE INDEX "mail_directory_entry_domain_local_part_idx" ON "mail_directory_entry"("domain", "local_part");

-- CreateIndex
CREATE UNIQUE INDEX "mail_vault_backup_directory_entry_id_key" ON "mail_vault_backup"("directory_entry_id");

-- AddForeignKey
ALTER TABLE "mail_vault_backup" ADD CONSTRAINT "mail_vault_backup_directory_entry_id_fkey" FOREIGN KEY ("directory_entry_id") REFERENCES "mail_directory_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
