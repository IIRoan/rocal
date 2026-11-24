# Solace JMAP DNS failover

The `solace-jmap-failover` Deployment in Zeabur's `solace-mail` project runs on `roan-server`, apart from the two Webdock gateways. Flux rolls out the Bun container from protected `master`. Kustomize mounts the TypeScript from an immutable ConfigMap and changes its name when the code changes. The single replica uses the Recreate strategy and exposes a pod-only readiness check.

| Role | Public target | Worker |
| --- | --- | --- |
| Preferred | `mx.solace.onl` | `webdock-mail` |
| Standby | `mx2.solace.onl` | `webdock-1` |

The monitor checks each gateway every two seconds. It opens a fresh HTTPS connection using the `mail.solace.onl` Host header and TLS identity, with a 1.5-second timeout. CoreDNS resolves each gateway hostname to its worker's WireGuard address. The monitor also reads the public ingress Service's ready endpoints. Public IP routing and firewall checks require an external probe.

Two observations of a missing active ingress endpoint and a ready alternate start the DNS switch while JMAP recovers. When both ingress endpoints are present, two failed JMAP checks on the active gateway and two successful checks on the alternate trigger the switch. A shared JMAP failure with both ingress endpoints present leaves DNS in place. Thirty healthy JMAP checks restore the preferred route after about a minute.

The monitor changes only the target of the DNS-only `mail.solace.onl` CNAME with TTL 60. It reads the record every minute and again before any update. After a Cloudflare failure it keeps probing and waits 30 seconds before re-reading the record. That read also covers a write whose response was lost. A host or cluster outage leaves DNS on the last selected gateway. Client DNS caches and existing connections can delay recovery.

## Rollout

Before the initial cutover, review and apply the [admin-owned networking configuration](../../bootstrap/networking/kustomization.yaml) from the same revision. The policies permit cluster DNS and HTTPS to the two WireGuard gateways, the Kubernetes API, and Cloudflare. The monitor uses a projected service-account token to list EndpointSlices in `solace-mail`. Network policy blocks pod ingress.

Provision the `solace-jmap-failover-registry` image pull Secret in `solace-mail` with a Chainguard OCI pull credential for `cgr.dev`. Rotate the credential before it expires.

1. Verify the current DNS-only CNAME has TTL 60 and points to one of the two gateways. Prepare the Secrets before reconciling the Deployment.
2. On `roan-server`, run `systemctl --user disable --now solace-jmap-failover.service` to stop the previous host monitor. Confirm it is inactive before provisioning the container's credential.
3. Create the Secret `solace-jmap-failover-dns` in `solace-mail` with key `api-token`, using a Cloudflare token limited to Zone Read and DNS Edit for `solace.onl`. Pass a private file via `kubectl -n solace-mail create secret generic solace-jmap-failover-dns --from-file=api-token=/path/to/private/token`.
4. Reconcile the reviewed revision through Flux and verify the rollout and both origins. The readiness probe starts after a 15-second grace period for the initial DNS lookup. A Ready pod has successfully read the expected Cloudflare record.

```sh
kubectl -n solace-mail rollout status deploy/solace-jmap-failover
kubectl -n solace-mail logs deploy/solace-jmap-failover --tail=30
kubectl -n solace-mail exec deploy/solace-jmap-failover -- bun /app/failover.ts --check
kubectl -n solace-mail exec deploy/solace-jmap-failover -- bun /app/failover.ts --check-dns
dig +short mail.solace.onl CNAME
```

Verify authenticated mailbox reads on both gateways separately. SMTP uses the MX records separately. For shared failures, check the CloudNativePG primary and the `mail-pg` and `mail-database-rw` write Services, Redis and SeaweedFS. Prefer the synchronized PostgreSQL instance on `webdock-mail` for a planned promotion.

For a live drill, verify that both public gateways serve authenticated JMAP first. Temporarily block the preferred worker's HTTPS address in the monitor's NetworkPolicy. Confirm the standby target on authoritative DNS, restore the policy, and verify automatic failback and authenticated JMAP.

## Recovery

For a bad code rollout, restore the prior monitor code through Git. To pause steering, set the Deployment replica count to zero in Git and confirm the pod terminated before manually editing the CNAME or re-enabling the old host unit. For an urgent pause, suspend the shared `solace` Flux Kustomization, scale the monitor to zero, and resume reconciliation after the committed replica count reflects the pause. If restoring the old host monitor, ensure the CNAME still targets one of the two gateways and verify the systemd unit and both gateways before continuing.

Run the monitor tests with `bun test ./.zeabur/solace-mail/jmap-failover/failover.test.ts`. The PR workflow type-checks the monitor and runs the same tests. The tests simulate Cloudflare writes.
