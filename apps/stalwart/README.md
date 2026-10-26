# Stalwart on Railway (Solace mail)

Stalwart mail server runs on [Railway](https://railway.app). A public VPS
(`mail.solace.onl` / `193.180.211.139`) owns the MX, TLS certificates, and
inbound ports. Railway containers connect **outbound** to the VPS over frp, and
client mail traffic enters through the VPS. The Solace API (the Railway service
"Solace API"), the notifications worker and third-party clients all use
`https://mail.solace.onl` through the VPS. The key-gated backend gate (HAProxy
`:8081`, [`backend-gate.cfg`](backend-gate.cfg)) still starts with the container,
and the Railway service domain still points at it; plan 001 step 7 moves the
API to Railway's private network instead.

Desired state for Stalwart objects lives in [`stalwart/plan/`](stalwart/plan/).
WebUI edits are overwritten on the next Railway boot. This tree lives in the Solace
monorepo at `apps/stalwart` (not a nested git repo).

The image and plans target **1.0.0**. Follow [the 1.0 migration runbook](UPGRADE-1.0.md)
before deploying them onto a populated 0.16 database; changing the image alone cannot upgrade it.

## Backend provisioning principal

The Solace API must **not** hold an admin token. It reads mailbox, calendar and
contact data as the account owner (per-user OAuth bearers) and needs elevated
rights only to provision. `stalwart/plan/16-provisioner-role.ndjson` defines the
`solace-provisioner` role with exactly those permissions.

After applying the plan, create a dedicated account bound to that role and issue
it an API token, then set `STALWART_PROVISION_TOKEN` on the API. This step is
manual because the account secret must never live in the repo. Until it is done
the API falls back to the deprecated `STALWART_ADMIN_TOKEN`, which is what it
does today; retire that token once the scoped one works (plan 001 step 7).

## System overview

```mermaid
flowchart TB
    subgraph Internet
        MTA[Remote MTAs / mail clients]
        RCPT[Recipient mail servers]
        API[Solace API<br/>Railway service]
    end

    subgraph VPS["VPS (193.180.211.139)"]
        HAP[HAProxy<br/>:25 :443]
        FRPS[frps :7000]
        PF[Postfix<br/>127.0.0.1:2525]
        FREL[frpc-relay<br/>STCP proxy]
        HAP --> FRPS
        FREL --> PF
        PF --> RCPT
    end

    subgraph Railway["Railway container"]
        SW[Stalwart<br/>:25 :8080]
        FRPC[frpc<br/>smtp + http group proxies]
        REL[frpc relay visitor<br/>STCP :2525, same process]
        HEALTH[Health server<br/>:8090]
        GATE[Backend gate<br/>HAProxy :8081, key required]
        SW --> REL
        FRPC --> SW
        GATE -->|"PROXY v2"| SW
    end

    MTA --> HAP
    API -->|"HTTPS<br/>mail.solace.onl"| HAP
    FRPS <-->|"TCP load-balancing groups<br/>HAProxy PROXY v2 passthrough"| FRPC
    FRPS <-->|"STCP tunnel"| REL
    REL -->|"SMTP + SASL"| FREL
    SW -->|"JMAP / SMTP submit"| SW
```

## Config as code

[`config.json`](railway-entrypoint.sh) only names the **DataStore** (templated from Railway `PG*` env).
Everything else is JMAP objects, applied from NDJSON on every boot:

```sh
scripts/stalwart-plan.sh dry-run
scripts/stalwart-plan.sh apply
scripts/stalwart-plan.sh snapshot
scripts/stalwart-plan.sh drift
scripts/stalwart-plan.sh dns-publish
```

`railway-entrypoint.sh` runs `stalwart-cli apply` after JMAP is up and **before** the relay IP patch.
Failing apply fails the boot.

**In git:** Domain `solace.onl`, DNS/ACME/DKIM *policy*, NetworkListeners, HTTP security, Cache/JMAP/SystemSettings, MTA-STS, SenderAuth, ReportSettings, BlobStore (S3 via `EnvironmentVariable`), MetricsStore/TracingStore, Alerts, WebHooks.

**Not in git:** user accounts, mailbox data, Certificates, DkimSignature private keys, `MtaRoute.host` (container IP), Tasks/queues/logs.

**Secrets** stay in Railway variables. Plan objects use `{"@type":"EnvironmentVariable","variableName":"..."}`. Snapshot strips secrets; omit a secret field on apply so live credentials are not wiped.

DKIM keys rotate automatically (`dkimManagement: Automatic`). Stalwart does **not** continuously reconcile Cloudflare; after a new selector, run `scripts/stalwart-plan.sh dns-publish`. Do not flip MTA-STS to `enforce` until TLS-RPT reports arrive.

Admin UI is allowlisted on public HTTPS via VPS file `/etc/haproxy/admin-allow.lst` (from GitHub Environment secret `ADMIN_ALLOW_IP` on `mail-vps`; never committed). Tunnel fallback: `ssh -N -L 8080:127.0.0.1:8080 USER@mail.solace.onl` then `http://127.0.0.1:8080/admin/`.

## Inbound mail (Internet → Stalwart)

```mermaid
sequenceDiagram
    participant C as Mail client / MTA
    participant H as HAProxy (VPS)
    participant F as frps → frpc tunnel
    participant S as Stalwart (Railway)

    C->>H: SMTP :25 / HTTPS :443
    Note over H: TLS termination on :443<br/>one PROXY v2 header from HAProxy; frpc must not add another
    H->>F: Forward to the localhost frps group port
    F->>S: frpc TCP proxy → Stalwart listener
    S-->>C: Mail delivery / JMAP
```

Every container runs one frpc that registers its proxies into frp **load-balancing
groups** on fixed frps ports, so HAProxy has a single backend per protocol and frps
spreads connections over whichever containers are registered. Proxy names carry a
per-container id (`smtp-<uuid>`, `http-<uuid>`) because frps requires unique names.
frpc logs go straight to the container's stderr.

| Group  | frps port | Container port |
|--------|-----------|----------------|
| `smtp` | 10025     | 25             |
| `http` | 18080     | 8080           |

The DATA stage on port 25 runs the system Sieve script [`stalwart/sieve/solace-simplelogin.sieve`](stalwart/sieve/solace-simplelogin.sieve). It strips any `X-Solace-*` markers. For DKIM-verified SimpleLogin forwards it puts the original sender in From, the reverse alias in Reply-To, and adds `X-Solace-SimpleLogin: forward` for the apps. The plan embeds the file in `30-mta.ndjson`, and `tests/test_simplelogin_sieve.py` keeps them in sync. To roll back, set the `MtaStageData` `then` to `"false"`. Deleting the line does not reset it, because `update` only patches.

## Outbound mail (Solace / JMAP → Internet)

Railway **blocks outbound SMTP ports** (25, 587, 465). Outbound mail uses an
frp **STCP** tunnel. At boot the entrypoint starts the visitor on `:2525`, patches `MtaRoute.host` to the container private IP, then reloads settings.

See [vps/OUTBOUND_RELAY.md](vps/OUTBOUND_RELAY.md).

```mermaid
sequenceDiagram
    participant App as Solace / JMAP client
    participant S as Stalwart (Railway)
    participant V as STCP visitor :2525
    participant F as frps / frpc-relay (VPS)
    participant P as Postfix :2525
    participant R as Recipient (e.g. Proton)

    App->>S: EmailSubmission/set (JMAP)
    S->>V: SMTP + STARTTLS + SASL<br/>to container-ip:2525
    V->>F: STCP through frps :7000
    F->>P: localhost:2525
    P->>R: Deliver from VPS public IP
```

## Rolling deployments

Mail containers have no attached volume. PostgreSQL stores mail metadata and the queue;
S3 stores blobs. The private `Redis-stalwart` service supplies shared ephemeral state
(`InMemoryStore/Redis`) and coordination (`Coordinator/Default`) while old and new
containers overlap. `STALWART_REDIS_URL` comes from a Railway variable reference and is
injected into a mode-0600 temporary plan; never commit its credentials. Stalwart's
standalone Redis configuration stores that URL in its protected settings database.

```mermaid
sequenceDiagram
    participant N as New container
    participant O as Old container
    participant R as Redis
    participant F as frps groups (VPS)

    O->>F: Continue serving
    N->>R: Join shared coordination
    N->>N: Stalwart + gate up, local plan applied, relay route set
    N->>F: Register ready smtp/http proxies
    N->>N: Health 200
    Note over O,N: Railway overlaps deployments for 90 seconds
    O->>F: SIGTERM: health 503, leave groups
    O->>O: Drain FRPC_DRAIN_SECONDS, then stop Stalwart
```

Joining the groups is the last boot step, so a registered container is ready to serve.
If frpc cannot register within `FRPC_READY_TIMEOUT_SECONDS`, boot fails. Configure Redis
and the coordinator before starting concurrent nodes: changing stores requires a restart,
not just `Action/ReloadSettings`. Long-lived JMAP push connections reconnect when their
container stops. Redis itself is a single ephemeral instance; rolling mail deployments
do not make Redis, PostgreSQL or the VPS highly available.

Railway probes `GET /healthz/ready` on `PORT` (8090). Healthcheck, overlap, and drain live in the repo-root [`.railway/railway.ts`](../../.railway/railway.ts).
Readiness needs a ready boot state, live Stalwart and frpc processes, and open
:25/:8080/:8081/relay ports. It deliberately does not probe the VPS, so a tunnel blip
never marks the container (and with it the VPS-independent API gate) unhealthy.

### Tunnel mutual TLS (one-time rollout)

frps only accepts TLS from clients holding a cert signed by the Solace frp CA, and frpc
pins that CA (`serverName = "frps.solace"`), so a leaked `FRPC_TOKEN` or an
intercepted connection can no longer register proxies. Roll out in this order;
each step keeps the old side working:

1. `sh apps/stalwart/scripts/frp-tls-certs.sh <new dir>` and set the five `FRP_TLS_*`
   secrets on `mail-vps` as it prints. Store `ca.key` offline.
2. Set `FRPC_TLS_CERT` and `FRPC_TLS_KEY` on Railway `stalwart-mail` and let it redeploy:
   frpc presents the client cert, which today's frps ignores.
3. Run **Sync mail VPS** with `apply_frp`: frps now requires TLS plus a client cert, and
   `frpc-relay` uses one too. Tunnels drop for a few seconds while frps restarts.
4. Set `FRPC_TLS_CA` on Railway and let it redeploy: frpc now also verifies frps.

Certs last five years (`FRP_TLS_DAYS`); rotating mints a new CA, so repeat all four steps.

## Repository layout

| Path | Purpose |
|------|---------|
| `stalwart/plan/` | Desired-state NDJSON (`stalwart-cli apply` on boot) |
| `scripts/stalwart-plan.sh` | apply / dry-run / snapshot / drift / dns-publish |
| `scripts/sync-haproxy-cert.py` | Export Stalwart ACME cert → HAProxy PEM |
| `scripts/test-relay-route.sh` | Offline tests for relay-route helpers |
| `scripts/frp-tls-certs.sh` | Mints the frp CA, frps server cert and frpc client cert for tunnel mutual TLS |
| `railway-entrypoint.sh` | Stalwart + health server + plan apply + relay IP, then frpc joins the tunnel groups; SIGTERM leaves them before stopping Stalwart |
| `backend-gate.cfg` | HAProxy gate for the Solace API: key check, path allowlist, `X-Real-IP` → PROXY v2 to Stalwart `:8080` |
| `Dockerfile` | Mail image (Railway `rootDirectory: apps/stalwart`) |
| [`vps/README.md`](vps/README.md) | VPS services, cutover, cert sync |
| `../../.github/workflows/sync-haproxy-cert.yml` | Weekly / on-demand HAProxy cert sync |
| `../../.railway/railway.ts` | Solace Railway IaC |

## Railway environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `FRPS_ADDR` | yes | VPS IP or hostname |
| `FRPC_TOKEN` | yes | frp auth token (must match `FRP_TOKEN` in GitHub Environment `mail-vps`) |
| `FRPC_RELAY_STCP_KEY` | yes | Relay STCP secret (must match `FRP_RELAY_STCP_KEY` in `mail-vps`); missing key fails boot |
| `STALWART_ADMIN_TOKEN` | yes | Plan apply + relay route at startup |
| `STALWART_GATE_KEY` | yes | Backend gate key (32+ chars); only its SHA-256 reaches HAProxy; missing key fails boot. The API would send it as `X-Solace-Gate` only if its own `STALWART_GATE_KEY` were set (it is not) |
| `PORT` | yes | Set to `8090` — Railway healthcheck port |
| `PGHOST`, `PGPASSWORD`, etc. | yes | PostgreSQL (Railway plugin) |
| `BUCKET` / `BUCKET_*` | yes | Railway bucket refs for S3 BlobStore |
| `STALWART_MAIL_INGEST_WEBHOOK_SECRET` | no | HMAC for Solace `message-ingest.ham` webhook (omit from plan if unset; live HMAC is kept) |
| `FRPC_READY_TIMEOUT_SECONDS` | no | Deadline for frpc's proxies to register and the relay visitor to listen (default `120` seconds); timeout fails boot |
| `FRPC_DRAIN_SECONDS` | no | Wait between leaving the tunnel groups and stopping Stalwart on SIGTERM (default `10`) |
| `FRPC_TLS_CERT`, `FRPC_TLS_KEY` | rollout | Base64 PEM client cert/key from `scripts/frp-tls-certs.sh`; required once frps enforces mutual TLS |
| `FRPC_TLS_CA` | rollout | Base64 PEM of the frp CA; set after frps has the new server cert, then frpc verifies frps |
| `STALWART_HTTP_PORT` | no | Stalwart HTTP/JMAP port (default `8080`) |
| `STALWART_GATE_PORT` | no | Backend gate port, the Railway domain's target (default `8081`) |
| `RELAY_ROUTE_ID` | no | Stalwart MtaRoute id (default `ivnbzc1aaba9`) |
| `RELAY_BIND_ADDR` | no | Override container private IP for relay route |
| `PG_POOL_MAX_CONNECTIONS` | no | Stalwart → Postgres pool size (default `32`, matching JMAP's 32 concurrent requests) |

Use the **private** Postgres hostname (`*.railway.internal`). Message bodies live in the Railway bucket (`BlobStore` S3); Postgres holds metadata.

## HA verification

```sh
python3 -B -m unittest discover -s apps/stalwart/tests -v
sh apps/stalwart/scripts/test-relay-route.sh
shellcheck apps/stalwart/railway-entrypoint.sh apps/stalwart/vps/apply-vps-repo.sh
```

Run these from the monorepo root. The default suite covers the rendered frpc config,
shutdown order (leave the groups, then stop Stalwart), health, and boot-time secret
checks. For the optional loopback-only frp
integration test, set `FRPC_TEST_BINARY` and `FRPS_TEST_BINARY` to existing
version-matched binaries; it overlaps two containers in one group and checks that the
old one leaves without a failed connection. It uses temporary ports/configs and dummy
credentials; it does not access mail.
For the backend gate test, set `HAPROXY_TEST_BINARY`; it runs `backend-gate.cfg`
in front of a loopback PROXY v2 stub.

## Status page

Uptime monitoring: [`apps/gatus/`](../gatus/README.md). Discord downtime alerts are Gatus-only (`DISCORD_WEBHOOK_URL`). Stalwart Enterprise Alerts in `stalwart/plan/40-integrations.ndjson` email `admin@solace.onl` for live counters.

## VPS

Copy configs from `vps/` to the VPS, enable services, and open firewall ports
22, 25, 80, 443, 7000. Full reference: [vps/README.md](vps/README.md).
