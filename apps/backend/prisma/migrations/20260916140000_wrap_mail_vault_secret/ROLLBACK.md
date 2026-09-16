# Rolling back the mail vault re-key

A re-keyed vault is encrypted with a random secret sealed to the user's E2EE
account key. `MAIL_VAULT_HMAC_KEY` no longer opens it, so **a code rollback
alone loses access to every vault that has already moved.**

## Before deploying

Take a dump and keep it until `vault-wrap-progress` shows `legacy: 0` and mail
has been opened on web and native:

    docker run --rm postgres:17-alpine pg_dump --format=custom \
      --no-owner --no-privileges "$DATABASE_URL" > vault-rekey-$(date +%F).dump

## Checking progress

    GET /api/mail/account/vault-wrap-progress   -> { wrapped, legacy, total }

`legacy` counts vaults the server can still open. Retire `MAIL_VAULT_HMAC_KEY`
only once it reaches zero.

## Rolling back

Restore just the vault table from the dump taken before the deploy, then deploy
the previous commit:

    docker run --rm -i postgres:17-alpine pg_restore --data-only \
      --table=mail_vault_backup --dbname "$DATABASE_URL" < vault-rekey-<date>.dump

Any mail label changes made after the dump are lost; mail itself is untouched,
since it lives in Stalwart and not in Postgres.

Dropping the columns is not required to roll back — the old code ignores them.
