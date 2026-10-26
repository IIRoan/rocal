# Stalwart 1.0 migration

## Recorded state, 26 October 2026

Production has been migrated to **1.0.0**, using the official `stalwart-migrate` release. The prerequisite 0.16.27 deployment was `e960e0a9-9cd6-4f18-8265-7a80524d3f17`; the original 0.16.21 deployment was `f8f59577-c50f-4d59-80c6-6419b6b55c40`.

The final production run finished at **19:20:52 UTC**, with six accounts verified, zero mismatches and zero copy errors. It preserved 450 messages and 747 account objects. The live database is `stalwart_v1`; the original `railway` database is retained but is stale after the cutover. Never point 0.16 at the 1.0 database or switch back to the stale source after 1.0 accepts writes.

The compatible API and notifications worker have also been deployed. Mail containers have **no attached volume**, use shared Redis coordination and retain Railway's 90-second deployment overlap. PostgreSQL and S3 remain the authoritative mail stores.

The initial upgrade missed a client startup regression: mail-only third-party OAuth tokens cannot call `x:AccountSettings/get` or `set`. The admin-applied production and test plans now register `solace-mail-bridge` as first-party, preserving each account's existing permissions for encryption setup. This does not grant users server-administration or cross-account access. Only a superuser can save a first-party client; preconfigure its exact callback and backend description instead of granting the scoped provisioner that authority. Existing grants retain their previous scope: restart the API to clear its token cache and reload web/native clients after correcting the registration. The previous registration is backed up in `oauth-account-settings-before.gpg`.

## Official tooling and deployment shape

Use the [official migration tool](https://github.com/stalwartlabs/stalwart-migrate/blob/v1.0.0/README.md) and its [v1.0.0 release](https://github.com/stalwartlabs/stalwart-migrate/releases/tag/v1.0.0). It requires **0.16.27**, reads the old database and writes a new, empty database. Never point the 1.0 server directly at the old store.

The tested Linux x86-64 migration release archive has SHA-256 `26e552e194b63922fe793dd5b2864d57692208f251de92588f4010fd7d0c016f`. Use the published release executable; the first Docker tag observed during release day contained an older build of the migration tool.

The mail and test images pin `stalwartlabs/stalwart:v1.0.0@sha256:baafeacd6cbde77acdd94af49972d41c6709e54a376df48e18a9fe3f445eb3d5`, with `stalwart-cli` 1.0.14 and a schema fetched from the actual 1.0 server. The desired-state plans were converted using the official mappings.

This environment keeps PostgreSQL, the existing S3 bucket and the VPS relay. It has one steady-state mail replica, with overlapping old/new instances during deployments. [Stalwart 1.0 requires a Redis-based in-memory store for concurrent nodes](https://stalw.art/docs/faq/operations/). `InMemoryStore/Redis` uses the private Redis service and `Coordinator/Default` reuses that connection. Both must be configured before starting concurrent nodes; storage changes require a process restart.

The temporary `stalwart-operations` volume was removed. There is no mail-container volume or filesystem mail store. Redis is an authenticated, private, ephemeral service running the pinned official `redis:8.10.3-alpine` image. Its purpose is shared leases, transient state and pub/sub; mail remains in PostgreSQL and S3. Redis is a single instance: zero-interruption mail deployment does not imply that Redis, the database or the VPS is highly available. Do not roll Redis with overlapping independent empty instances.

The entrypoint requires `STALWART_REDIS_URL`, verifies that the stored Redis and coordinator settings match before applying its plan, and only then joins the VPS tunnel groups. Credentials are injected into a mode-0600 temporary plan; Stalwart's standalone Redis configuration persists its connection URL in the protected settings database. Back up this configuration encrypted.

The migrated WebUI cache was an old bundle without a 1.0-compatible manifest. The Application now pins the official WebUI 2.0.0 bundle, SHA-256 `52cf9f8c23db5676b3cb485e522bc69b46d0ce36f1c93a628aa7458bbc2ad8e4`; `Action/UpdateApps` refreshed the cached bundle. `/admin/` and its OAuth metadata return HTTP 200. The startup plan upserts the legacy WebUI OAuth registration and preserves API-created clients.

Project: `2f38e580-18c7-473a-897d-28cb8327faa1`; production environment: `b643afb2-4790-46d4-9d36-cc7203e88ee3`.

| Resource | Service ID | Migration change |
| --- | --- | --- |
| stalwart-mail | `54a5a6b0-1b2e-466c-a049-067e8877a1c8` | No volume, Redis coordination, 90-second overlap, `PGDATABASE=stalwart_v1` |
| Postgres-stalwart | `f6a6a71a-f82e-4461-9083-c946f5b0c7ef` | New empty database alongside `railway`; retain original |
| Redis-stalwart | `832b234d-6841-476f-842e-a1dd2cf178fb` | Private ephemeral Redis; no public endpoint or attached volume |
| Solace API | `9888bad7-ab8f-4594-9952-fd98487c7758` | Deploy compatible OAuth bridge before switching mail |
| notifications-rust | `11cd36e0-9160-4e88-9641-024e04154da4` | Rebuild with the shared backend library after its checks pass |

## Backups and recovery evidence

The follow-up memory tuning lowered PostgreSQL `max_connections` from 500 to 100 on 26 October. `shared_buffers` remains 128 MiB and Stalwart's pool remains 32 per node. PostgreSQL reported 152 MiB shared memory after restart, previously 175 MiB. The owner-scoped bootstrap monitor observed two failed one-second probes during the database restart and recovered without restarting mail.

The Dockerfile enables jemalloc background reclamation through an `/etc/malloc.conf` symlink targeting `background_thread:true`. The official binary's network-binding capability disables environment configuration under the service user; the former `_RJEM_MALLOC_CONF` variable and a plain `MALLOC_CONF` both fail in this deployment. Arena counts and decay times retain upstream defaults. A synthetic comparison of 6,144 requests per configuration, including 2 MiB blob downloads at concurrency eight, measured about 960 versus 971 requests/second and 186 versus 139 MiB RSS after 20 seconds idle. This is local workload evidence, not a production capacity guarantee. The allocator regression test exercises the built container as its service user; it failed with environment-only configuration and passed with the symlink.

The allocator change needs only a rolling mail-container replacement. Its rollback is the previous 1.0 image from commit `f3c4cf7d`, using the current database and Redis settings; no data migration or database restore is involved.

HAProxy's backend gate also caps workers at eight to match Railway's eight-vCPU quota. Live inspection found 48 automatically selected workers and about 224 MiB RSS before the cap. The gateway's key checks, allowed paths, header stripping and PROXY v2 forwarding remain unchanged. Repeated local proxy tests on the same eight CPUs, with 16 concurrent clients and 16,384 requests per configuration, measured median throughput of 1,500 versus 1,640 requests/second and p95 latency of 12.59 versus 11.30 ms; isolated idle RSS was about 38 versus 22 MiB.

`memory-tuning-before-postgres-config.gpg` and `memory-tuning-after-postgres-config.gpg` preserve the database configuration. `memory-tuning-before-v1-postgres.gpg` was decrypted and independently restored into isolated PostgreSQL 18.6 with all 29 public tables. To undo only the connection limit, set `max_connections` back to 500 with `ALTER SYSTEM` and restart the database; retain every other setting. Do not restore the data snapshot merely to reverse a configuration change, because that would discard subsequent mail.

Local encrypted recovery directory:

```text
/var/home/roan/Documents/rocal/.railway-up-stage/stalwart-v1-recovery-20261026
```

The passphrase is stored separately, mode 0600, at:

```text
/var/home/roan/Documents/rocal/.railway-up-stage/recovery-keys/stalwart-v1-20261026.passphrase
```

Keep an independent secure copy of that key. Neither the key nor decrypted secrets belong in Git, terminal output or deployment logs.

| Artifact | Contents and validation |
| --- | --- |
| `baseline-postgres.gpg` | 0.16.21 custom-format PostgreSQL dump; decrypted and restored into an isolated PostgreSQL 18 database |
| `v01627-postgres.gpg` | Fresh 0.16.27 database dump; separately restored before migration rehearsal |
| `baseline-postgres-roles.gpg` | PostgreSQL roles and grants |
| `baseline-stalwart-environment.gpg` | Runtime environment and store config, including secret references and values needed for recovery |
| `baseline-source.gpg` | Original source for mail, backend, worker and infrastructure |
| `baseline-blobs.tar.gpg` | 452 objects; all manifest SHA-256 values checked, all objects restored to an isolated S3 service and read back with matching hashes |
| `rehearsal-evidence.tar.gpg` | Forward and both reverse migration states and reports, including original settings needed to investigate conversion failures |
| `recovery-tools.tar.gpg` | The backup and blob restore scripts used for this rehearsal |

Every encrypted artifact passed decryption and has a SHA-256 sidecar. A second encrypted copy was written to the existing PostgreSQL volume at `/var/lib/postgresql/data/stalwart-recovery-20261026`; remote checksums match. The key was not copied alongside it. That copy shares the database failure domain, so the local copy remains necessary.

The earlier baseline snapshots were taken while mail was live. Fresh `cutover-postgres.gpg`, `cutover-postgres-roles.gpg`, `cutover-stalwart-environment.gpg` and `cutover-blobs.tar.gpg` were then taken with the source mail server stopped and zero source database connections. The outgoing queue was empty. The cutover database was restored into an isolated PostgreSQL 18 database; all 452 blob objects were restored and read back with matching SHA-256 hashes. A second live listing matched the blob snapshot before the final migration. `production-migration-state.tar.gpg` preserves the completed state and report; remote checksums of all five new artifacts match.

The official forward migration was rehearsed against the restored 0.16.27 database and a separately restored local blob bucket. Both copied-data servers stayed stopped during migration. Recovery mode was used only for isolated configuration inspection; it disables SMTP and background workers. The tool copied six accounts, 450 messages and 747 objects; `--final --verify-full` completed with zero account mismatches and zero copy errors. The migrated database also booted the official 1.0 server in isolated recovery mode and answered an authenticated registry query. The 17 dropped registry records were inspected: 12 obsolete AI spam tags and five identical duplicate defaults, not user mail.

The first official reverse migration copied all accounts and messages without write errors, but its full verifier reported one `SenderAuth` conversion mismatch when using `--forward-state`. Independent reads of both restored 0.16 servers showed identical `SenderAuth` and `MtaStageData` values, plus 99 registry types / 2,432 objects exactly equal. Remaining differences were inspected: runtime node state, DNS record order, preserved duplicate defaults and added built-in spam tags. All original spam tags and account credentials were preserved. Do not hide this failure with `--allow-errors` or describe that reverse run as fully verified. Preserve its report when evaluating a newer official tool release. A second rehearsal without `--forward-state` copied the same mail but reported 18 ACME settings mismatches (`description` is unknown to the 0.16 schema), so omitting that option is not a verified workaround.

## Implementation validation

- `cargo xtask check` passed with the pinned Rust 1.98.1 toolchain: formatting, Clippy, workspace unit tests, all 433 API cases in both development and production modes against the official 1.0 server, generated API/entity checks, Jest destination coverage, production build and memory budgets.
- Owner-scoped OAuth, concurrent first token minting and cross-account mailbox isolation are covered by that suite. The initial capability check missed the required owner-account settings access; the regression now exercises the app's settings/mailboxes/identities bootstrap, owner settings updates, and denied global administration and cross-account settings reads/writes. A focused login test also passed against 0.16.27, and its official server accepted the new atomic redirect patch while preserving existing entries.
- The official converter validated the production and test plans against the 1.0 schema. Shell syntax, relay helper checks, repository rules and whitespace checks passed.
- Container entrypoint tests: 14 passed, five optional HAProxy/frp binary tests skipped. Regressions reject missing or mismatched Redis configuration, safely render credentials, and prevent applying the new plan to the previous deployment through its public URL; the last regression fails against the original entrypoint.
- Live checks confirmed the 1.0.0 binary, no mail volume, Redis pub/sub subscriber, clustering startup, mail readiness, authenticated public JMAP, SMTP greeting, WebUI and `/api/health`. PKCE/callback/state, token refresh and owner-scoped mailbox/email queries passed using the noreply service identity. The initial registry-denial check was too broad: owner settings must work while global administration remains denied. The current 1.0 Docker digest and Git tag were rechecked against the published release.
- The OAuth correction was reproduced against a fresh official 1.0 test server before applying the trusted-client plan. The corrected bootstrap/encryption-update/isolation test passes, as do all 433 API cases in both modes. Live owner settings, mailbox and identity reads pass with newly issued and refreshed service-identity tokens; global account administration remains denied. The API was redeployed to clear cached tokens. Real-device UI confirmation remains separate from these protocol checks.

Final validation logs are kept in `validation-logs.tar.gpg` with the other encrypted recovery artifacts. Temporary restored databases and blobs are removed after validation; the encrypted snapshots, migration states and recovery scripts remain available for another rehearsal.

## Rolling deployment evidence

Deployment `8a44b91f-0795-4902-ba9c-ce61c885d19d` replaced `b50e297b-0f23-40b2-868c-c773625feefc`. The new container became ready at 19:35:12 UTC. Redis showed two subscribers to `stwt.agora` during overlap, returning to one after the old deployment was removed. Railway reports no mail volume and `overlapSeconds: 90`.

Continuous checks covered the transition and old-instance retirement: authenticated JMAP sessions, existing OAuth bearer sessions and public SMTP greetings all remained available. The existing OAuth client registration survived startup. This demonstrates the tested rolling replacement, not uninterrupted long-lived connections or resilience to a database, Redis or VPS failure.

The current 1.0 PostgreSQL dump (`v1-live-postgres.gpg`) was also restored successfully into isolated PostgreSQL 18. `v1-stalwart-environment.gpg`, `v1-mail-variables.gpg` and `v1-redis-variables.gpg` preserve the final configuration encrypted. This live database-only dump is supplementary; the pre-cutover stopped-source database/blob set is the coherent recovery snapshot.

## Repeatable cutover sequence (already completed)

1. Provision private authenticated Redis, retain one mail replica and no mail volume, and keep 90-second deployment overlap for the eventual coordinated 1.0 deployment. Apply infrastructure changes in stages: do not change `PGDATABASE` or deploy 1.0 before migration. During the one-time schema transition, explicitly stop the old version; mixed 0.16/1.0 deployments are not supported.
2. Finish the backend and mail checks, build the images and deploy the compatible API while mail is still on 0.16.27. Verify health and token minting. The bridge supports both releases, requests the mail OAuth scope and validates callback URL, state and PKCE. On 1.0, the admin-applied plan must preconfigure its first-party registration before minting tokens so the apps can access their owner's encryption settings. Existing OAuth tokens will not survive the database migration; Solace must mint fresh tokens after the switch.
3. Verify PostgreSQL free space and create an empty `stalwart_v1` database. The source was about 358 MB before migration; account for both stores, backups, indexes and rollback space. Do not initialize the target with the 1.0 server.
4. Use the existing Postgres-stalwart service as the migration runner, so it remains available when the mail service is stopped. Verify the official executable runs there, then prepare source and target `config.json` files. They must name distinct databases and reference `PGPASSWORD` through `EnvironmentVariable`. Supply the existing blob-store secret variables securely to the migration process. Use a mode-0700 state directory on its existing database volume and keep encrypted copies elsewhere. Do not run the final copy in the mail container that must be stopped.
5. Run the official preparation and live copy below. Review every warning and drop. The checked-in answers keep all categories, reuse the existing blob bucket, pin changed defaults and grant no new custom-role permissions.

```sh
install -d -m 700 /var/lib/postgresql/data/stalwart-migration-v1
test ! -e /var/lib/postgresql/data/stalwart-migration-v1/answers.toml || exit 1
install -m 600 /secure/answers.toml /var/lib/postgresql/data/stalwart-migration-v1/answers.toml

stalwart-migrate prepare \
  --source /secure/source-config.json \
  --state /var/lib/postgresql/data/stalwart-migration-v1 \
  --non-interactive

stalwart-migrate run \
  --source /secure/source-config.json \
  --target /secure/target-config.json \
  --state /var/lib/postgresql/data/stalwart-migration-v1 \
  --concurrency 4
```

Copy [`upgrade/answers.toml`](upgrade/answers.toml) to `/secure/answers.toml` before this first preparation. Keep the migration state and its recorded answers between runs. Later runs copy only changes; do not overwrite their answers file.

6. Enter the mail maintenance window. Stop all 0.16 instances and prevent automatic restarts or deployments. Pause API/worker mail activity, verify no remaining mail database writers, and record queue state. Take fresh encrypted PostgreSQL, roles, runtime configuration and complete blob backups. Verify checksums, decryption and restore before changing the shared spam-model keys.
7. Run the final copy while 0.16 is stopped:

```sh
stalwart-migrate run \
  --source /secure/source-config.json \
  --target /secure/target-config.json \
  --state /var/lib/postgresql/data/stalwart-migration-v1 \
  --concurrency 4 --final --yes --verify-full
```

Require success and review `final-report.txt`. This final step converts the two learned spam-model blobs in the shared bucket. Do not start 1.0 on a partial result, use `--allow-errors`, or rerun with `--force-after-final` after 1.0 has served users.

8. Set only the mail service's `PGDATABASE=stalwart_v1`. Configure `InMemoryStore/Redis` and `Coordinator/Default` on the migrated store using an isolated recovery-mode 1.0 process before normal deployment. Set `STALWART_REDIS_URL` from the Redis service and start the pinned 1.0 image without a volume. The entrypoint validates the cluster configuration and applies settings locally before exposing it through frp. Its relay patch uses the renamed `MtaRoute.host` field. Refresh the official WebUI bundle with `Action/UpdateApps` if an older cached bundle lacks the required manifest.
9. Verify startup and readiness, private/public JMAP, OAuth token minting and refresh, owner isolation, message counts and representative existing blobs, labels/flags and change cursors, inbound and outbound delivery, webhook signature handling and new-mail push. Confirm TLS, source-IP handling and the existing VPS relay identity. Include web and native clients; local API tests do not establish real-device delivery. Full-text indexes rebuild in the background; encrypted content remains encrypted.
10. Resume the API/worker, observe queues and errors, and retain both old stores, all backups and migration state until the new deployment and a supported recovery path are accepted. Commit and publish the final source only after the infrastructure and database state match it.

## Recovery

Before the final migration changes shared spam models, the old database and image can still be restarted. After final migration but before 1.0 serves users, restore the original spam-model keys from the stopped-source snapshot before restarting 0.16.27.

After 1.0 accepts writes, **never switch back to the stale `railway` database**. New mail would be lost, and 1.0 may have removed blobs referenced by that old store. Drain the outgoing 1.0 queue, stop every 1.0 node, back up its database and shared bucket, then use the official reverse migration into another empty database:

```sh
stalwart-migrate rollback \
  --source /secure/target-config.json \
  --target /secure/rollback-config.json \
  --state /var/lib/postgresql/data/stalwart-rollback-v016 \
  --forward-state /var/lib/postgresql/data/stalwart-migration-v1 \
  --concurrency 4 --allow-shared-deletes --yes --verify-full
```

`--allow-shared-deletes` authorizes conversion of shared spam models back to 0.16, so all 1.0 instances must remain stopped. Resolve the recorded verifier issue with a tested official version before relying on this command for production recovery. Queue, task and telemetry rollback has limitations documented by the tool; draining and recording queue state is required.

For disaster recovery, decrypt the chosen coherent snapshot directly into `pg_restore --no-owner --no-acl --exit-on-error` targeting a new empty PostgreSQL database. Restore all blob objects from the matching encrypted tar using its `manifest.json` mapping of opaque archive paths to keys; verify every SHA-256 after upload. Restore the corresponding configuration, secret values and matching image. Test on an isolated endpoint before changing the active database/bucket. Recovery from a snapshot necessarily loses changes newer than that snapshot.

Restore testing used native official binaries; the production Docker build and live 1.0 startup were separately verified on Railway. Real-device web/native acceptance, push delivery and external end-to-end mail delivery were not exercised by the automated checks. The migration does not weaken content encryption or add plaintext search copies.
