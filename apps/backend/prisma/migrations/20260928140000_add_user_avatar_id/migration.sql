-- Opaque R2 object id for uploaded profile pictures.
ALTER TABLE "user" ADD COLUMN "avatar_id" TEXT;

CREATE UNIQUE INDEX "user_avatar_id_key" ON "user"("avatar_id");
