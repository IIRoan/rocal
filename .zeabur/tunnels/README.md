# Cloudflare tunnels

`zeabur-apps-production` serves new Zeabur domains under `*.roan.dev`. `solace-production` serves the explicit hostnames in [the Solace tunnel config](solace/config.yaml). Each tunnel has its own credential and one connector per Webdock worker.

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
| Each hostname listed by the Solace tunnel | `c02a554c-963f-4bd3-aa99-a6813f7933d4.cfargotunnel.com` | Proxied |

Preserve exact DNS records for existing unrelated services and the direct DNS-only mail exchange records. For a new app, select `webdock-apps / https` in the Zeabur **Add domain** form. The HTTPRoute uses the Gateway's automatically renewed wildcard origin certificate. Cloudflare presents its own edge certificate.

`test2.roan.dev` has its own DNS-only CNAME to `edge.solace.onl` because its existing Ingress uses the direct listener.

## Verification and recovery

Verify that the Gateway is Programmed and each connector Deployment has one Ready replica on each VPS. Check the HTTPRoute's Accepted and ResolvedRefs conditions, then request a fresh app hostname externally. The Gateway runs on the platform Traefik. Solace uses its own two-replica Traefik origin on the Webdock workers.

Verify the public API, JMAP session and event stream, discovery and MTA-STS, the status page and SMTP STARTTLS on both MX hosts. Confirm authenticated responses remain private and that the origin receives Cloudflare's client IP. Reconcile a previous Git revision for a bad connector or origin rollout. During the cutover window, restore the saved Cloudflare records and keep the direct listeners available for rollback.
