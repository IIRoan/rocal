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
| `prometheus_user` | yes | Stalwart Prometheus basic auth (WebUI) |
| `prometheus_password` | yes | Stalwart Prometheus basic auth |
| `SLOT_MANAGER_TOKEN` | yes | Bearer token for `/slot-manager/status` |
| `DISCORD_WEBHOOK_URL` | yes | Discord webhook for Gatus downtime and scrape failures |

## Alerting (two layers)

| Layer | Watches | Notifies |
|-------|---------|----------|
| **Gatus** | HTTP endpoints + Prometheus scrape shape | Discord (`DISCORD_WEBHOOK_URL`) after 2 failures / 2 recoveries |
| **Stalwart Enterprise Alerts** | Live metric expressions (S3/store errors, SMTP concurrency, queue backlog, …) | Email to `admin@solace.onl` |

Do not point a Stalwart WebHook at `DISCORD_WEBHOOK_URL`. Discord expects its own JSON body; Stalwart event payloads are a different shape. Discord for this stack is Gatus-only.

## Monitors

Intervals are intentionally relaxed for **Vercel Hobby** (Application) and to avoid
hammering Stalwart with duplicate Prometheus scrapes.

| Group | Endpoint | Interval | What it proves |
|-------|----------|----------|----------------|
| Application | `solace.onl` | 5m | Web frontend |
| Application | `api.solace.onl/api/health` | 5m | Backend API |
| Mail | `mail.solace.onl/jmap/session` | 2m | End-to-end mail path |
| Mail | `mail.solace.onl/slot-manager/status` | 2m | Blue/green tunnels |

### Stalwart Metrics group

Both monitors scrape `mail.solace.onl/slot-manager/metrics/prometheus` once each
(every **5m**). Conditions are combined so we do not fan out 6–8 scrapes of the same URL.

| Monitor | What it checks |
|---------|----------------|
| `stalwart-metrics` | Exporter alive + SMTP/delivery/IMAP/HTTP/store gauges registered |
| `stalwart-error-counters` | Store I/O present; fails if unexpected/S3/SMTP-concurrency/calendar error counters appear |

These verify that metric families are being exported. Counter **values** and threshold
expressions are handled by **Stalwart Enterprise Alerts** (email). Gatus Discord-alerts if
those error counters appear on the scrape (`stalwart-error-counters`).
Grafana ([dashboard #23498](https://grafana.com/grafana/dashboards/23498-service-stalwart/))
remains useful for rate graphs.

## Local test

```bash
cd apps/gatus
docker build -t solace-gatus .
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e prometheus_user=prometheus \
  -e prometheus_password=secret \
  -e SLOT_MANAGER_TOKEN=your-token \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  solace-gatus
```

## Optional

- **Status page auth:** `GATUS_ADMIN_USERNAME` / `GATUS_ADMIN_PASSWORD`
- **VPS SSH monitor:** set `VPS_MONITOR_SSH_USERNAME` and `VPS_MONITOR_SSH_PRIVATE_KEY` (or `_B64`);
  install `apps/stalwart/vps/gatus-monitor.sh` on the VPS and restrict the SSH user with `authorized_keys command=`
