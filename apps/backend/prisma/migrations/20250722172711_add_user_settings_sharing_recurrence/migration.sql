-- AlterTable
ALTER TABLE "calendar_event" ADD COLUMN     "parent_event_id" TEXT;

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "defaultView" TEXT NOT NULL DEFAULT 'month',
    "weekStartDay" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "timeFormat" TEXT NOT NULL DEFAULT '12h',
    "workingHoursStart" INTEGER NOT NULL DEFAULT 540,
    "workingHoursEnd" INTEGER NOT NULL DEFAULT 1020,
    "workingDays" TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "browserNotifications" BOOLEAN NOT NULL DEFAULT true,
    "reminderSound" BOOLEAN NOT NULL DEFAULT true,
    "defaultReminder" INTEGER,
    "defaultEventDuration" INTEGER NOT NULL DEFAULT 60,
    "default_calendar_id" TEXT,
    "compactView" BOOLEAN NOT NULL DEFAULT false,
    "showWeekNumbers" BOOLEAN NOT NULL DEFAULT false,
    "showDeclinedEvents" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_sharing" (
    "id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "shared_with" TEXT NOT NULL,
    "shared_by" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sharing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrence_exception" (
    "id" TEXT NOT NULL,
    "parent_event_id" TEXT NOT NULL,
    "exception_date" TIMESTAMP(3) NOT NULL,
    "modified_event_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'modified',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurrence_exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sharing_calendar_id_shared_with_key" ON "calendar_sharing"("calendar_id", "shared_with");

-- CreateIndex
CREATE UNIQUE INDEX "recurrence_exception_parent_event_id_exception_date_key" ON "recurrence_exception"("parent_event_id", "exception_date");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_sharing" ADD CONSTRAINT "calendar_sharing_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_exception" ADD CONSTRAINT "recurrence_exception_modified_event_id_fkey" FOREIGN KEY ("modified_event_id") REFERENCES "calendar_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
