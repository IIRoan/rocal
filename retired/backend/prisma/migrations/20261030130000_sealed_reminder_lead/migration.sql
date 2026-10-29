-- The reminder lead sealed on the device for the iPhone extension; additive, so it can be applied before the deploy that writes it.
ALTER TABLE "event_notification" ADD COLUMN "encrypted_lead" TEXT;

-- Nothing shows encryption device labels any more, and the API has stopped storing them.
UPDATE "user_encryption_device" SET "device_label" = NULL WHERE "device_label" IS NOT NULL;
