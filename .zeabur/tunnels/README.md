# Cloudflare tunnels

`zeabur-apps-production` serves Zeabur projects and new domains under `*.roan.dev`. `solace-production` serves the explicit hostnames in [the Solace tunnel config](solace/config.yaml). These tunnels each have their own credential and one connector per Webdock worker. The Zeabur dashboard and login use the separate management tunnel on the control plane.

## Ownership

| Resource | Owner |
| --- | --- |
| Shared Gateway and platform connector | Admin applies [Gateway bootstrap](../bootstrap/zeabur-application-gateway.yaml) and the [Zeabur overlay](zeabur/) |
| Traefik entry point for the shared Gateway | K3s AddOn `90-traefik-public-endpoint.yaml` from [the Helm values](../bootstrap/zeabur-traefik-helm.yaml) |
| Solace connector, origin listener and ConfigMaps | Flux from the root Kustomization |
| Solace origin Service, policies and Ingresses | Admin applies [networking bootstrap](../bootstrap/networking/) |
| Status ingress | Admin applies [status ingress](../bootstrap/solace-status-ingress.yaml) with field manager `solace-status-migration` |
| Public DNS | Cloudflare, with the CNAME targets recorded below |

Create `cloudflared-credentials` in each of `traefik` and `solace-mail` with the corresponding tunnel's `credentials.json`. Recover the credentials from the encrypted operator archive. A connector needs only its own credential. The Cloudflare account credential stays outside Kubernetes.

| DNS name | Target | Proxy |
| --- | --- | --- |
| `*.roan.dev` | `f8fb5c01-f601-4db9-b994-df4accb06009.cfargotunnel.com` | Proxied |
| `ingress.roan.dev` | `f8fb5c01-f601-4db9-b994-df4accb06009.cfargotunnel.com` | Proxied |
| Explicit project hostnames in [the Zeabur tunnel config](zeabur/config.yaml) | `f8fb5c01-f601-4db9-b994-df4accb06009.cfargotunnel.com` | Proxied |
| Each hostname listed by the Solace tunnel | `c02a554c-963f-4bd3-aa99-a6813f7933d4.cfargotunnel.com` | Proxied |

Preserve exact DNS records for existing unrelated services and the direct DNS-only mail exchange records. For a new app, select `webdock-apps / https` in the Zeabur **Add domain** form. The HTTPRoute uses the Gateway's automatically renewed wildcard origin certificate. Cloudflare presents its own edge certificate.

The Solace web frontend runs one pod on each Webdock worker. Each pod runs a connector for the existing Solace tunnel. The apex reaches a health-checking HAProxy sidecar over loopback. HAProxy uses the local frontend first and the ready peer through the internal Service only when the local frontend fails. A stalled Kubernetes API can mark both pods unready while their local website origins continue serving. The other Solace hostnames use the private Traefik origin independently of the website health check.

Build the frontend from the repository root with `podman build -f apps/web/Dockerfile .`. Publish it to `zot.zot.svc:5000/solace-mail/frontend` and promote the complete digest-pinned reference in [the frontend deployment](../solace-mail/frontend.yaml).

The Zeabur tunnel sends its explicit project hostnames to the private `apps` listener on Webdock Traefik. Generated app names use the shared `webdock-apps` Gateway.

## Worker firewall

The public application ports are TCP 25 on both VPSs, TCP 443 for the `mx.solace.onl` HTTPS compatibility listener, and the Cobblemon TCP and UDP NodePorts on VPS-01. Worker management uses SSH over WireGuard. The existing WireGuard listener on UDP 51820 carries cluster and management traffic.

The worker firewall services read `/etc/zeabur-worker/firewall.nft` and `/etc/zeabur-mail-worker/firewall.nft`. Each configuration restricts new input on `eth0` to mail and WireGuard, with ICMP and link-local DHCPv6 as required. Gatus uses `10.200.31.6` and `10.200.31.2` with these hosts' SSH keys pinned.

Verify management over WireGuard before reloading a worker firewall. Load and test one worker at a time with a timed rollback. The pre-cutover rules are archived on each worker under `/var/lib/zeabur-maintenance`.

## Verification and recovery

Verify that the Gateway is Programmed and each connector Deployment has one Ready replica on each VPS. Check the HTTPRoute's Accepted and ResolvedRefs conditions, then request a fresh app hostname externally. The Gateway runs on the platform Traefik. Solace uses its own two-replica Traefik origin on the Webdock workers.

Probe the website continuously while one replica is replaced. Exercise a loss of frontend readiness with both local apps still serving and verify that fresh requests through Cloudflare succeed.

Verify the public API, JMAP session and event stream, discovery and MTA-STS, the status page and SMTP STARTTLS on both MX hosts. Confirm authenticated responses remain private and that the origin receives Cloudflare's client IP.

If a connector or origin rollout fails, restore the last working tunnel configuration and test the affected hostnames through Cloudflare. The application Ingresses should stay on their private entry points.
