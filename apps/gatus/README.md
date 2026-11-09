# Gatus status page (Solace)

[Gatus](https://github.com/TwiN/gatus) monitors Solace and mail from Railway. The image is
built from a pinned commit of [CarmJos/gatus](https://github.com/CarmJos/gatus) (upstream PR
#1651, 90-day retention) with the patches below; the page reads history from its own
`/timeline` endpoint, not Gatus's `period-statuses`.
Deploy as a **separate Railway service** (root directory `apps/gatus`, volume at `/data`).
`apps/gatus` must be on the GitHub `master` branch before Railway can build it.

## Status page

`status.html` is the public page: one self-contained file (no framework, no dependencies)
in Solace's tokens. By default it follows the browser's light or dark preference, live; the
header's System / Light / Dark control pins a choice in `localStorage` (`solace-status-theme`),
and System clears it.
The Python front (`stalwart-discord-bridge.py`) serves it at `/` and `/endpoints/<key>`
(also `/suites/*`, so the stock Gatus UI is never shown) and proxies `/api/*` to Gatus.

`/` is the overview: per service, 90 daily bars and uptime over 24 hours, 7 days, 30 days and
90 days. Each service links to `/endpoints/<key>`, a detail view where the whole page follows
one period: the chart's range (24 hours, 7 days, 30 days, 90 days), a day, or an hour. For that
period it shows a summary (uptime, checks passed, average response), its outages, the
response-time chart, and its checks: one bar per bucket (hours for 24 hours, 7 days and a day;
six-hour blocks for 30 days; days for 90 days), or for an hour every individual check. Below
the bars, individual checks are listed newest first (on a range, the latest ones Gatus keeps,
30 at a time with "Show more"; on an hour, all of them, opening on the first failure); each row
expands to its conditions and errors.

Day bars are calendar days in the viewer's time zone (green at 99% or more, amber from 90%,
red below). Clicking a day (on the overview, the 30- or 90-day chart, or a check bar) opens it,
and clicking an hour (on a chart or a check bar) opens its individual checks. A breadcrumb
(`Overview / Wed, Nov 4 / …`) steps back out, the range buttons return to a range, and the
URL carries the zoom (`?day=2026-11-04&hour=16`). With a chart or bar strip focused, arrow
keys browse and Enter opens.
Charts scale to healthy points and pin failing hours or checks to the top edge, since a
failed check reports its timeout; outages from the recorded status changes are shaded red
across the chart, and a zoomed view lists each one with its exact window.

**Timeline endpoint.** `GET /timeline/<key>?from=<unix s>&to=<unix s>&step=3600|21600|86400&tz=<IANA zone>`
in the Python front reads Gatus's SQLite read-only and returns uptime buckets (checks,
successes, average response) for windows up to 92 days, with daily buckets starting at
midnight in `tz`, plus individual checks for windows of two hours or less. Gatus's own API
can't answer "hours of a past day".

**History kept:** hourly uptime for 90 days (`uptime-hourly-retention.patch`; upstream merges
anything older than 48 hours into days, so days from before this patch only have a daily
total), and the last 2,880 checks per endpoint (`maximum-number-of-results`), a day at the
30-second JMAP interval and longer for slower checks. About 2,200 uptime rows and 2,880
results per endpoint; the SQLite file stays in the tens of MB.

The page skips refreshes while the tab is hidden:

| View | Request | When | Size |
|------|---------|------|------|
| Overview | `/api/v1/endpoints/statuses?pageSize=1` | load, then every minute | ~5 KB |
| Overview | `/timeline` (90 days, daily) + `statuses?pageSize=1` (events) per endpoint | load, then every 15 minutes | ~8 KB each |
| Detail | `statuses?pageSize=30` (header and the latest checks; "Show more" fetches the next page) | load, then every minute | ~13 KB |
| Detail | `/timeline` for the chart range (24 to 168 buckets) | load, range change, every 15 minutes | ~8 KB |
| Detail | `/timeline` for the selected day or hour | on selection, every 15 minutes | ~2–6 KB |

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

## Security updates

`security-dependencies.patch` pins patched Go modules while preserving the upstream source commit and the existing behavior patches. The image pins Go 1.27.3 and Alpine 3.24. At startup root fixes ownership of the existing `/data` volume, then `su-exec` runs the config preparation, Gatus and Python front as `gatus` (UID 10001). The front relays upstream redirects without fetching their targets.
