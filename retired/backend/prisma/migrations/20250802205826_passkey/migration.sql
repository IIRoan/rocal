/*
  Warnings:

  - Added the required column `notification_time` to the `event_notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "event_notification" ADD COLUMN     "is_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notification_time" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3),
    "aaguid" TEXT,

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_notification_notification_time_idx" ON "event_notification"("notification_time");

-- CreateIndex
CREATE INDEX "event_notification_is_enabled_is_sent_idx" ON "event_notification"("is_enabled", "is_sent");

-- AddForeignKey
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
