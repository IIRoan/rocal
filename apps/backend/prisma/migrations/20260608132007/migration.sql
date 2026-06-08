-- AlterTable
ALTER TABLE "calendar" ALTER COLUMN "force_full_encryption" SET DEFAULT true;

-- AlterTable
ALTER TABLE "user_settings" ALTER COLUMN "event_encryption_mode" SET DEFAULT 'full';
