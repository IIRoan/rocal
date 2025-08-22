-- AlterTable
ALTER TABLE "public"."calendar_event" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';
