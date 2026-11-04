# Gatus status page (Solace)

[Gatus](https://github.com/TwiN/gatus) monitors Solace and mail from Railway. The image is
built from a pinned commit of [CarmJos/gatus](https://github.com/CarmJos/gatus) for its
`period-statuses` API (upstream PR #1651), which the page uses for one bar per day over 90 days.
Deploy as a **separate Railway service** (root directory `apps/gatus`, volume at `/data`).
`apps/gatus` must be on the GitHub `master` branch before Railway can build it.

## Status page

`status.html` is the public page: one self-contained file (no framework, no dependencies)
in Solace's tokens. By default it follows the browser's light or dark preference, live; the
header's System / Light / Dark control pins a choice in `localStorage` (`solace-status-theme`),
and System clears it.
The Python front (`stalwart-discord-bridge.py`) serves it at `/` and `/endpoints/<key>`
(also `/suites/*`, so the stock Gatus UI is never shown) and proxies `/api/*` to Gatus.

`/` is the overview; each service links to `/endpoints/<key>`, a detail view with uptime
(24 hours to 90 days), a response-time chart (24 hours, 7 days, 30 days; Gatus keeps hourly
points for 48 hours and daily ones before that), the 90-day bars, the last 30 checks, the
latest check's conditions and errors, and every recorded incident.

The page reads the Gatus API from the browser and skips refreshes while the tab is hidden:

| View | Request | When | Size |
|------|---------|------|------|
| Overview | `/api/v1/endpoints/statuses?pageSize=1` | load, then every minute | ~5 KB |
| Overview | `period-statuses/90d/90` + `statuses?pageSize=1` (events) per endpoint | load, then every 15 minutes | ~8 KB each |
| Detail | `statuses?pageSize=30` | load, then every minute | ~13 KB |
| Detail | `period-statuses/90d/90` + `response-times/<range>/history` | load, range change, every 15 minutes | ~6 KB |

Display names and descriptions live in `SERVICES` at the top of the page script, keyed by
the Gatus key (`group_name`, lowercased). Endpoint names and groups in the config are storage
keys: renaming one drops its 90-day history, so rename in `SERVICES` instead.

## Railway variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | auto | Public listen port (status page + proxy) |
| `prometheus_user`, `prometheus_password` | yes | Stalwart `/metrics/prometheus` Basic auth |
| `DISCORD_WEBHOOK_URL` | yes | Discord webhook for Gatus downtime and scrape failures |
| `STALWART_WEBHOOK_BEARER` | Stalwart alerts | Bearer token Stalwart sends to `/hooks/stalwart` |
| `VPS_MONITOR_SSH_USERNAME`               | VPS monitor | Dedicated forced-command account                        |
| `VPS_MONITOR_SSH_PRIVATE_KEY_B64`        | VPS monitor | Base64 private key, stored only in Railway              |
| `VPS_MONITOR_SSH_KNOWN_HOSTS`            | VPS monitor | Operator-verified OpenSSH known-hosts entry for the VPS |

## Alerting (two layers)

| Layer | Watches | Notifies |
|-------|---------|----------|
| **Gatus** | Endpoints below + Prometheus scrape shape | Discord (`DISCORD_WEBHOOK_URL`) after 2 failures / 2 recoveries |
| **Stalwart Enterprise Alerts** | Live metric expressions (S3/store errors, SMTP concurrency, queue backlog, …) | Email to `admin@solace.onl` |

Do not point a Stalwart WebHook at `DISCORD_WEBHOOK_URL`. Discord expects its own JSON body; Stalwart event payloads are a different shape. Discord for this stack is Gatus-only.

## Monitors

Intervals are set for fast detection: alerts fire after two failures, so downtime reaches
Discord within about twice the interval (one minute for mail, two for the API). The website
stays at 2m because each check is a Vercel invocation. About 8,800 checks a day in total.

| Group | Endpoint | Interval | What it proves |
|-------|----------|----------|----------------|
| Application | `website`: `solace.onl` (`HEAD`) | 2m | Web frontend reachable, TLS valid |
| Application | `api-health`: `api.solace.onl/api/health` | 1m | API process up (primary signal) |
| Application | `api-mail-jmap`: `api.solace.onl/api/health/mail-jmap` | 1m | API reaches Stalwart over the private network |
| Mail | `jmap-session`: `mail.solace.onl/jmap/session` | 30s | Public JMAP through Railway HTTPS |
| Mail | `mta-sts`: `mta-sts.solace.onl/.well-known/mta-sts.txt` | 10m | VPS `:443` passthrough to Stalwart serves the MTA-STS policy, and Stalwart's ACME certificate (the one SMTP STARTTLS presents) has > 14 days left. Not `starttls://`: Go's SMTP client sends `EHLO localhost`, which Stalwart rejects |
| Stalwart Metrics | `stalwart-metrics`: `mail.solace.onl/metrics/prometheus` | 2m | Exporter alive, metric families registered, store I/O present, no error counters exported |
| VPS | `vps-health` (SSH, optional) | 1m | HAProxy, frps, STCP relay, Postfix, tunnel group members, local JMAP |

The Prometheus check is a single scrape; counter **values** and thresholds are handled by
**Stalwart Enterprise Alerts** (email). Discord alert condition details are capped at 1024
characters; the API retains the full results. Grafana
([dashboard #23498](https://grafana.com/grafana/dashboards/23498-service-stalwart/)) remains
useful for rate graphs.

## Local test

```bash
cd apps/gatus
podman build -t solace-gatus .
podman run --rm -p 8080:8080 -e PORT=8080 solace-gatus
python3 -B -m unittest discover -s tests -v
```

Without `prometheus_*` the metrics monitor fails auth; without `DISCORD_WEBHOOK_URL` alerts are off.

## Optional

- **Status page auth:** `GATUS_ADMIN_USERNAME` / `GATUS_ADMIN_PASSWORD`
- **VPS SSH monitor:** install `apps/stalwart/vps/gatus-monitor.sh` as root-owned mode 755, then run `sudo bash apps/stalwart/vps/setup-gatus-monitor.sh --check /path/to/monitor.pub` and `--apply` after review. Set the three `VPS_MONITOR_SSH_*` variables above; the account has no sudo, forwarding or arbitrary command access.
- `ssh-known-hosts.patch` adds `GATUS_SSH_KNOWN_HOSTS` to the pinned Gatus source; the entrypoint requires a host-key pin for VPS monitoring and writes credential files with mode 600. The image build tests matching, changed, unknown and missing host keys, plus deadlines for stalled handshakes and commands.
- SSH probes refuse connections when host pins are absent, including custom configurations. VPS service states use a fixed allowlist; raw command errors never enter monitor JSON.
