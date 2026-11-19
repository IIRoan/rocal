# Solace mail in production

Solace runs the API, notifications worker and two Stalwart replicas on Zeabur OSS on K3s. Vercel serves the web app. Railway runs [Gatus Monitoring](../gatus/README.md) and holds recovery copies. The current cluster and host layout is documented here and in the [mail VPS runbook](vps/README.md).

## Workloads and data

| Namespace | Resource | Role |
| --- | --- | --- |
| `solace-mail` | `stalwart-a`, `stalwart-b` | Stalwart and a HAProxy gateway per pod. A runs on `webdock-mail`; B runs on `webdock-1`. The `mail-live` Service selects the ready replicas. |
| `solace-mail` | `solace-api`, `notifications` | API on `webdock-1`, worker on `webdock-mail`. Each has a local HAProxy route to the private mail gate. |
| `solace-mail` | `mail-database` | Two-instance CloudNativePG cluster for Stalwart metadata and queues. The write Service is `mail-database-rw`. The old `mail-pg` and `mail-pg-standby` StatefulSets are scaled to zero. |
| `solace-mail` | `mail-redis`, `mail-redis-replica`, Sentinel | Shared ephemeral state and coordination. A Sentinel runs on each Webdock worker, with a third witness on `roan-server`. |
| `solace-mail` | `mail-s3` | Solace's mail blob storage. The observed StatefulSet has one replica. |
| `solace-api` | `app-postgres`, `app-postgres-standby` | Application PostgreSQL primary on `webdock-1` and standby on `webdock-mail`. |

`roan-server` is the control plane and runs the Builder controller. BuildKit limits are 4 CPU and 8 GiB. Build placement is currently unpinned. Verify the Job and BuildKit pod placement separately from the controller. Keep the API, notifications and both Stalwart replicas on the Webdock workers.

## Request paths

- **Public HTTPS.** Cloudflare tunnel connectors and ingress route `api.solace.onl` to `solace-api:8080`. They route `mail.solace.onl`, MTA-STS and discovery hosts to `mail-live:8082`, the public mail gateway. Web and native clients use the Solace API's JMAP proxy.
- **Private JMAP.** The API and worker send the shared `STALWART_GATE_KEY` through the origin-restricted `StalwartGate`. Their pods map the compatibility hostname `stalwart-gate.railway.internal` to the local HAProxy sidecar on port 8081. The sidecars forward to `mail-live.solace-mail.svc.cluster.local:8081`. The hostname keeps the client origin check compatible.
- **SMTP.** Public port 25 goes to HAProxy on each MX host and then directly over TCP to Stalwart with PROXY v2. Stalwart presents the STARTTLS certificate. The VPS runbook covers MX order, outbound relays and routine checks.

The DATA stage runs the [SimpleLogin Sieve script](stalwart/sieve/solace-simplelogin.sieve). It strips incoming `X-Solace-*` markers and annotates DKIM-verified SimpleLogin forwards. `tests/test_simplelogin_sieve.py` keeps the script and the MTA plan in sync.

## Configuration and rollout

- [`stalwart/plan/`](stalwart/plan/) contains the Stalwart JMAP objects for listeners, DNS and certificates, stores, OAuth, provisioning, encryption, MTA rules and webhooks. Use [`scripts/stalwart-plan.sh`](scripts/stalwart-plan.sh) for dry-run, drift and apply. The live cluster configuration selects its stores and credentials. Keep that selection when reviewing a plan for production.
- [`backend-gate.cfg`](backend-gate.cfg) and [`admin-gate.lua`](admin-gate.lua) are the repo's gateway sources. The production pods mount the `mail-live-config` ConfigMap and get runtime credentials from Kubernetes Secrets. Before shipping a change, compare the mounted gateway configuration and the repo source.
- The [Solace Zeabur configuration](../../.zeabur/README.md) versions the existing Kubernetes resources and Secret references. Review its server-side diff before applying changes to workload placement, image digests, selectors, health probes or PVCs. Keep platform Helm values, host configuration, and backup data in their operational stores.
- Roll the Stalwart replicas individually. Check Stalwart `/healthz/ready`, gateway readiness and both `mail-live` endpoints before proceeding to the other replica. After a rollout, validate public JMAP, the API's private JMAP health check and STARTTLS on each MX. Verify one-node failover and recovery separately during a planned exercise.

The [Stalwart release and build recipe](https://github.com/IIRoan/rocal/releases/tag/stalwart-v1.1.0-solace.1) include the literal PostgreSQL subject-search patch. See the [regression and reindex instructions](tests/SUBJECT-SEARCH.md) before replacing the binary. [The 1.0 migration runbook](UPGRADE-1.0.md) records the legacy Railway recovery procedure. The [former Railway/VPS sources](https://github.com/IIRoan/rocal/tree/467b75c1f4b43da93e199c9d4fec6841a036ff61/apps/stalwart) remain in Git history.

## Mailbox provisioning and operator access

Mailbox JMAP uses the account owner's OAuth bearer. The admin-applied first-party `solace-mail-bridge` client retains the account's permissions, including encryption setup. The API uses a separate `STALWART_PROVISION_TOKEN` bound to the scoped `solace-provisioner` role for provisioning. The mail-ingest webhook signs with `STALWART_WEBHOOK_SECRET`, which the API uses to verify the request.

The web `/admin` entry requires an environment-specific `STALWART_ADMIN_URL`. The public gateway checks for a live Solace session, the existing passkey requirements and an opaque user ID in the API's `STALWART_ADMIN_USER_IDS`. Stalwart still requires its own admin login. Configure the private authorizer with `SOLACE_ADMIN_AUTH_URL`, set the same server-only `STALWART_ADMIN_GATE_KEY` on the API and gateway, and set `SOLACE_ADMIN_LOGIN_URL` for the browser redirect. The gateway fails closed when authorization is unavailable. Public JMAP and monitoring have their own paths.
