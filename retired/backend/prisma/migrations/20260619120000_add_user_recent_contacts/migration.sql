-- CreateTable
CREATE TABLE "user_recent_contacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "encrypted_content" TEXT NOT NULL,
    "encryption_key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_recent_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_recent_contacts_user_id_key" ON "user_recent_contacts"("user_id");

-- AddForeignKey
ALTER TABLE "user_recent_contacts" ADD CONSTRAINT "user_recent_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
