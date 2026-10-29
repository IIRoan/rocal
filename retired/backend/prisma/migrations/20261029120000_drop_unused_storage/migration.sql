-- Apply after the encrypted-only deploy is stable: the previous deployment still reads these.
BEGIN;

-- An unsealed vault cannot be re-sealed by the server, so stop before changing anything; never delete one.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "mail_vault_backup" WHERE "wrapped_secret" IS NULL OR btrim("wrapped_secret") = '') THEN
    RAISE EXCEPTION 'mail_vault_backup has rows without wrapped_secret; have their owners re-seal them first';
  END IF;
END $$;

DROP TABLE "oauth_access_token";
DROP TABLE "oauth_refresh_token";
DROP TABLE "oauth_consent";
DROP TABLE "oauth_client";
DROP TABLE "jwks";
DROP TABLE "calendar_sharing";

ALTER TABLE "calendar"
  DROP COLUMN "force_full_encryption",
  DROP COLUMN "ics_share_token",
  DROP COLUMN "ics_share_enabled";

ALTER TABLE "user_settings" DROP COLUMN "event_encryption_mode";

ALTER TABLE "mail_vault_backup" ALTER COLUMN "wrapped_secret" SET NOT NULL;

COMMIT;
