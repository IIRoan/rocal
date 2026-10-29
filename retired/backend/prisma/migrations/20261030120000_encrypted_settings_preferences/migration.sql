-- App-only preferences sealed on the device; additive, so it can be applied before the deploy that writes it.
ALTER TABLE "user_settings" ADD COLUMN "encrypted_preferences" TEXT;
