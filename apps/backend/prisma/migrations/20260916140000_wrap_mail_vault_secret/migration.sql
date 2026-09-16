-- Additive: existing rows keep working on the server-derived passphrase until a
-- signed-in client re-wraps them under the user's E2EE account key.
ALTER TABLE "mail_vault_backup" ADD COLUMN "wrapped_secret" TEXT;
ALTER TABLE "mail_vault_backup" ADD COLUMN "wrap_algorithm" TEXT;
