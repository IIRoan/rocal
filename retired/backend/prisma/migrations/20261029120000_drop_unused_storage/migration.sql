-- Apply after the encrypted-only deploy is stable: the previous deployment still reads these.
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
