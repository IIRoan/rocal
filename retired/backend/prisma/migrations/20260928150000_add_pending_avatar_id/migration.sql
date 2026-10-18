ALTER TABLE "user" ADD COLUMN "pending_avatar_id" TEXT;

CREATE UNIQUE INDEX "user_pending_avatar_id_key" ON "user"("pending_avatar_id");
