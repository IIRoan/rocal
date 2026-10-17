-- DropForeignKey
ALTER TABLE "event_participant" DROP CONSTRAINT "event_participant_user_id_fkey";

-- DropIndex
DROP INDEX "event_participant_event_id_user_id_key";

-- AddForeignKey
ALTER TABLE "event_participant" ADD CONSTRAINT "event_participant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
