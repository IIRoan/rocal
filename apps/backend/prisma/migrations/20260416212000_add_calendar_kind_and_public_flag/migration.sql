-- AlterTable
ALTER TABLE "calendar"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'owned',
ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;
