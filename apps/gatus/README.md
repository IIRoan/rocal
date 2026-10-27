# Gatus status page (Solace)

[Gatus](https://github.com/TwiN/gatus) monitors Solace and mail from Railway. The image is
built from a pinned commit of [CarmJos/gatus](https://github.com/CarmJos/gatus) so each
endpoint can show a **90-day** uptime bar (GitHub-style) instead of a short second/minute
window. Deploy as a **separate Railway service** (root directory `apps/gatus`, volume at
`/data`). `apps/gatus` must be on the GitHub `master` branch before Railway can build it.

UI uses Solace warm tokens with an [sts](https://github.com/sparanoid/sts)-style
dense list (see `theme.css`). Groups (Application / Mail / Stalwart Metrics / VPS)
open by default via `assets/expand-groups.js`. Theme follows `prefers-color-scheme`
(and the in-page toggle cookie). Empty `dashboard-heading` values fall back to Gatus
defaults, so the config uses a space and CSS hides them.

## Railway variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | auto | Public listen port (proxy + Gatus) |
| `prometheus_user`, `prometheus_password` | yes | Stalwart `/metrics/prometheus` Basic auth |
| `DISCORD_WEBHOOK_URL` | yes | Discord webhook for Gatus downtime and scrape failures |
| `VPS_MONITOR_SSH_USERNAME`               | VPS monitor | Dedicated forced-command account                        |
| `VPS_MONITOR_SSH_PRIVATE_KEY_B64`        | VPS monitor | Base64 private key, stored only in Railway              |
| `VPS_MONITOR_SSH_KNOWN_HOSTS`            | VPS monitor | Operator-verified OpenSSH known-hosts entry for the VPS |

## Alerting (two layers)

| Layer | Watches | Notifies |
|-------|---------|----------|
| **Gatus** | HTTP endpoints + Prometheus scrape shape | Discord (`DISCORD_WEBHOOK_URL`) after 2 failures / 2 recoveries (Application + Mail) |
| **Stalwart Enterprise Alerts** | Live metric expressions (S3/store errors, SMTP concurrency, queue backlog, …) | Email to `admin@solace.onl` |

Do not point a Stalwart WebHook at `DISCORD_WEBHOOK_URL`. Discord expects its own JSON body; Stalwart event payloads are a different shape. Discord for this stack is Gatus-only.

## Monitors

**Mail** is polled aggressively (Railway/VPS — no Vercel cost). **Application** stays
moderate on Vercel Hobby: website uses `HEAD` (no HTML body), API uses the cheap
`/api/health` JSON probe. Default Discord alert is **2 failures** (~detection latency
≈ 2× interval).

| Group | Endpoint | Interval | Budget / notes | What it proves |
|-------|----------|----------|----------------|----------------|
| Application | `solace.onl` (`HEAD`) | 2m | `< 3000ms`; ~720/day | Web frontend reachable |
| Application | `api.solace.onl/api/health` | 1m | `< 5000ms`; ~1440/day | Backend API process |
| Application | `api.solace.onl/api/health/mail-jmap` | 1m | `< 10000ms`; ~1440/day | API can reach Stalwart (one unauthenticated request, no token minting) |
| Mail | `mail.solace.onl/jmap/session` | 30s | Discord after **2** fails (~1m) | Stalwart JMAP on the public mail edge |

### Stalwart Metrics group

Both monitors scrape Stalwart's own `mail.solace.onl/metrics/prometheus` once each
(every **2m**). Conditions are combined so we do not fan out 6–8 scrapes of the same URL.

| Monitor | What it checks |
|---------|----------------|
| `stalwart-metrics` | Exporter alive + SMTP/delivery/IMAP/HTTP/store gauges registered |
| `stalwart-error-counters` | Store I/O present; fails if unexpected/S3/SMTP-concurrency/calendar error counters appear |

These verify that metric families are being exported. Counter **values** and threshold
expressions are handled by **Stalwart Enterprise Alerts** (email). Gatus Discord-alerts if
those error counters appear on the scrape (`stalwart-error-counters`).
Discord alert condition details are capped at 1024 characters; the status page retains the full results.
Grafana ([dashboard #23498](https://grafana.com/grafana/dashboards/23498-service-stalwart/))
remains useful for rate graphs.

## Local test

```bash
cd apps/gatus
docker build -t solace-gatus .
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e prometheus_user=prometheus -e prometheus_password=your-password \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  solace-gatus
```

## Optional

- **Status page auth:** `GATUS_ADMIN_USERNAME` / `GATUS_ADMIN_PASSWORD`
- **VPS SSH monitor:** install `apps/stalwart/vps/gatus-monitor.sh` as root-owned mode 755, then run `sudo bash apps/stalwart/vps/setup-gatus-monitor.sh --check /path/to/monitor.pub` and `--apply` after review. Set the three `VPS_MONITOR_SSH_*` variables above; the account has no sudo, forwarding or arbitrary command access.
- `vps-health` checks HAProxy, FRP server, STCP relay, Postfix, both tunnel group memberships and local JMAP readiness every minute, with the existing two-failure/two-recovery alerts.
- `ssh-known-hosts.patch` adds `GATUS_SSH_KNOWN_HOSTS` to the pinned Gatus source; the entrypoint requires a host-key pin for VPS monitoring and writes credential files with mode 600. The image build tests matching, changed, unknown and missing host keys, plus deadlines for stalled handshakes and commands.
