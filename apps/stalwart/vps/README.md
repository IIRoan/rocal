# VPS services

Public VPS at `193.180.211.139` (`mail.solace.onl`) for Stalwart on Railway.
Architecture diagrams: [README.md](../README.md).

## Service map

```mermaid
flowchart LR
    subgraph Public
        HAP[HAProxy]
    end
    subgraph frp
        FRPS[frps :7000]
        FREL[frpc-relay]
    end
    subgraph Mail
        PF[Postfix]
    end

    HAP --> FRPS
    FREL --> PF
```

## Services

All systemd units should be enabled (`systemctl enable`) for boot.

### HAProxy

- **Role:** Public TCP/HTTP edge; TLS on :443; PROXY v2 to frps mail backends.
- **Ports:** 25, 80 (HTTPS redirect), 443.
  - **Public mail:** `/jmap`, `/.well-known`, `/api/discover`, `/api/auth`, `/auth/*` for third-party clients and the notifications worker. The Solace API reaches Stalwart through the Railway backend gate instead (see [README.md](../README.md)).
  - **Allowlisted only:** `/admin`, `/login`, `/logo`, `/account`, `/oauth`, and other `/api/*`.
  - Non-allowlisted hits to `/` or admin surfaces return a small **HTML 404** (not an empty body — empty 404s made browsers download a `.bin`).
  - Allowlist file: `/etc/haproxy/admin-allow.lst` from GitHub Environment secret `ADMIN_ALLOW_IP` on `IIRoan/rocal` `mail-vps` (never in git).
  - Loopback Admin UI remains on `127.0.0.1:8080` via SSH tunnel.
- **Repo:** `vps/haproxy.cfg` → `/etc/haproxy/haproxy.cfg`
- **Backends:** one server each, the frps group ports `127.0.0.1:10025` (smtp) and `127.0.0.1:18080` (http)
- **TLS cert:** `/etc/haproxy/certs/mail.solace.onl.pem` (HAProxy terminates HTTPS). This file is **separate** from Stalwart’s ACME-managed certificates (used for SMTP STARTTLS on :25). Renewing Stalwart ACME does **not** update HAProxy.
  - One-shot: `vps/install-haproxy-cert.sh`
  - Automated: GitHub Action + [`scripts/sync-haproxy-cert.py`](../scripts/sync-haproxy-cert.py) (see [HAProxy TLS cert sync](#haproxy-tls-cert-sync))

### Automated VPS deploy (protected)

Merging allowlisted `apps/stalwart/vps/` files to **`master`/`main`** triggers [`.github/workflows/sync-mail-vps.yml`](../../../.github/workflows/sync-mail-vps.yml), which SSHs to the VPS and runs [`apply-vps-repo.sh`](apply-vps-repo.sh).

Security model: **merge-time gates + narrow deploy**, not a manual Actions click.

| Gate | Purpose |
|------|---------|
| Branch protection on `master` | No drive-by pushes; PR + Code Owner review required |
| CODEOWNERS (`@IIRoan`) | `.github/workflows/` + `apps/stalwart/vps/` need owner review |
| Environment `mail-vps` | Secrets only; deployment branches limited to `master`/`main` |
| No `pull_request` trigger | Fork PRs never receive `mail-vps` secrets |
| Explicit file allowlist | Only known basenames are copied (not a recursive `vps/` dump) |
| `apply-vps-repo.sh` default-deny | Skips frp config installs unless opted in |
| Manual `workflow_dispatch` | Owner-only fallback (e.g. re-run without a new commit) |

#### Required GitHub settings

These must be on for the model to hold (script below applies them when you have admin rights):

1. **Branch protection** on `master` (and `main` if used):
   - Require a pull request before merging
   - Require review from Code Owners
   - Restrict who can push / dismiss reviews (you / admins)
   - Block force pushes and deletions
2. **Environment `mail-vps`**:
   - Deployment branches: **Selected** → `master`, `main`
   - Optional: required reviewers if you want a second click after merge (solo owners usually skip this so deploy stays automatic after a protected merge)
3. Never attach `mail-vps` secrets to workflows that run on `pull_request` from forks.

Local / emergency apply (bypasses GitHub; trusted shell only):

```bash
sudo APPLY_ALLOWLIST=/path/to/admin-allow.lst ./apply-vps-repo.sh .
```

Secrets: Environment **`mail-vps`** (see [HAProxy TLS cert sync](#haproxy-tls-cert-sync)). SSH user defaults to `Roan`. Long-term: least-privilege deploy user with sudo limited to `apply-vps-repo.sh` + `haproxy` reload.

### frps

- **Role:** Accepts inbound frp tunnels from Railway.
- **Port:** 7000 (control); dynamic proxy ports whitelisted in `vps/frps.toml`
- **TLS:** forced, with client certs checked against the Solace frp CA in `/etc/frp/tls/` (installed by `apply_frp` from the `FRP_TLS_*` secrets; rollout order in [README.md](../README.md#tunnel-mutual-tls-one-time-rollout))
- **Repo:** `vps/frps.toml` → `/etc/frp/frps.toml` (mode 600; `__FRP_TOKEN__` rendered from `mail-vps` secret `FRP_TOKEN` by **Sync mail VPS** with `apply_frp`)

### frpc-relay

- **Role:** STCP proxy exposing Postfix `127.0.0.1:2525` to Railway relay visitors.
- **Repo:** `vps/frpc-relay.toml` → `/etc/frp/frpc-relay.toml` (mode 600; token and `__FRP_RELAY_STCP_KEY__` rendered from `mail-vps` secrets)
- **Required** for outbound mail from Railway (see [OUTBOUND_RELAY.md](OUTBOUND_RELAY.md))

### Postfix

- **Role:** Authenticated submission relay; delivers to the internet from the VPS IP.
- **Listen:** `127.0.0.1:2525` (STCP from Railway), `127.0.0.1:587` (manual tests on the VPS); nothing listens publicly
- **SASL user:** `relay-client@mail.solace.onl`
- **Repo:** `vps/postfix-main.cf`, `vps/postfix-master.cf`

### gatus-monitor (optional)

- **Role:** JSON health snapshot for Gatus SSH probes from Railway (`status.solace.onl`).
- **Repo:** `vps/gatus-monitor.sh` → `/usr/local/bin/gatus-monitor.sh`
- **Setup:** See [apps/gatus/README.md](../../gatus/README.md)
- **Reports:** service states, online members per frp group (`smtp`, `http`; two during a deploy), JMAP through the group port, and the Postfix queue

## Tunnel groups

frps exposes two group ports on loopback: `10025` (smtp) and `18080` (http). Each
Stalwart container's frpc registers one proxy per group under a per-container name, and
frps spreads connections across every registered container. HAProxy has a single server
per backend pointing at those ports, so a deploy needs no VPS action: the new container
joins the groups, the old one leaves them on SIGTERM, and the port never goes empty. The
container side is described in [README.md](../README.md#zero-downtime-deploys).

## Operations

Admin UI: from an allowlisted egress IP open `https://mail.solace.onl/admin/`. Otherwise tunnel:

```bash
ssh -N -L 8080:127.0.0.1:8080 USER@mail.solace.onl
# browse http://127.0.0.1:8080/admin/
```

Allowlist updates: set Environment secret `ADMIN_ALLOW_IP` on `mail-vps`, then run workflow **Sync HAProxy config**.

```bash
# Service status
systemctl status haproxy frps frpc-relay postfix

# Containers registered in the tunnel groups (two during a deploy)
curl -s http://127.0.0.1:7500/api/proxy/tcp | python3 -m json.tool | grep -E '"(name|status)"'

# Health snapshot (same JSON Gatus reads)
/usr/local/bin/gatus-monitor.sh

# Config validation
sudo haproxy -c -f /etc/haproxy/haproxy.cfg && sudo systemctl reload haproxy
sudo postfix check && sudo systemctl reload postfix
```

## Firewall (UFW)

Allow: 22, 25, 80, 443, 7000 (frp control from Railway).

Port 80 must be open so HAProxy can 301 to HTTPS and send HSTS. Do not leave it firewalled/black-holed.

Ports 587 and 2525 are **not** exposed publicly — Postfix binds them to loopback and Railway reaches 2525 only via the STCP tunnel.

## HAProxy TLS cert sync

HAProxy terminates `https://mail.solace.onl` with `/etc/haproxy/certs/mail.solace.onl.pem`.
Stalwart ACME renewal does **not** update that PEM. [`scripts/sync-haproxy-cert.py`](../scripts/sync-haproxy-cert.py)
copies the newest Stalwart cert+key onto the VPS.

Workflow: [`.github/workflows/sync-haproxy-cert.yml`](../.github/workflows/sync-haproxy-cert.yml)

| Trigger | Behavior |
|---------|----------|
| Cron (Mondays 06:17 UTC) | Sync only if live HTTPS cert expires within **14 days** |
| `workflow_dispatch` on `main` | Defaults to `--force` (sync now) |

GitHub Environment **`mail-vps`** (`master`/`main` only) holds:

| Secret | Purpose |
|--------|---------|
| `STALWART_DATABASE_URL` | Public Postgres URL (`DATABASE_PUBLIC_URL` from Railway `Postgres-stalwart`) |
| `VPS_SSH_PRIVATE_KEY` | Private key for `gh-cert-sync` on the mail VPS |
| `VPS_SSH_HOST` | default `mail.solace.onl` |
| `VPS_SSH_USER` | default `Roan` |
| `VPS_SSH_PORT` | default `22` |
| `VPS_SSH_KNOWN_HOSTS` | Pinned VPS host key for every deploy workflow: `ssh-keyscan -t ed25519 -p <port> <VPS_SSH_HOST>`, after checking its `ssh-keygen -lf -` fingerprint against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VPS |
| `ADMIN_ALLOW_IP` | Operator egress IP/CIDR for public `/admin` + admin OAuth surfaces (written to `/etc/haproxy/admin-allow.lst`; never in git) |
| `FRP_TOKEN` | frps auth token (32+ alphanumeric); same value as Railway `FRPC_TOKEN`; never in git |
| `FRP_RELAY_STCP_KEY` | Relay STCP secret (32+ alphanumeric); same value as Railway `FRPC_RELAY_STCP_KEY`; never in git |
| `FRP_TLS_CA`, `FRP_TLS_SERVER_CERT`, `FRP_TLS_SERVER_KEY`, `FRP_TLS_CLIENT_CERT`, `FRP_TLS_CLIENT_KEY` | Base64 PEMs from `scripts/frp-tls-certs.sh` for frps and `frpc-relay`; `apply_frp` refuses to run without a matching set |

Public mailbox `/account` and `/login` are blocked except for the allowlisted IP (admin OAuth only). JMAP (`/jmap`) stays public for Solace clients.

HAProxy / VPS deploy is automated on protected `master` merges ([`.github/workflows/sync-mail-vps.yml`](../../../.github/workflows/sync-mail-vps.yml)); see [Automated VPS deploy](#automated-vps-deploy-protected). Legacy manual alias: [`.github/workflows/sync-haproxy-cfg.yml`](../../../.github/workflows/sync-haproxy-cfg.yml).

Bootstrap on the VPS as root:

```bash
sudo ./vps/setup-gh-cert-sync-user.sh
```

Paste the printed key into `VPS_SSH_PRIVATE_KEY`, set `VPS_SSH_USER=gh-cert-sync`, then delete `/root/gh-cert-sync-github-haproxy-cert.pem`.

Manual run:

```bash
export STALWART_DATABASE_URL='postgresql://…'
export VPS_SSH_PRIVATE_KEY="$(cat ~/.ssh/id_ed25519)"
export VPS_SSH_HOST=193.180.211.139
export VPS_SSH_USER=gh-cert-sync
pip install 'psycopg[binary]'
python3 scripts/sync-haproxy-cert.py --force
```
