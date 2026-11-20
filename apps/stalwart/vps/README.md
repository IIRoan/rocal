# Solace mail VPSs

| Kubernetes worker | Public MX | Priority | Outbound relay units |
| --- | --- | --- | --- |
| `webdock-mail` | `mx.solace.onl` | 10 | `postfix`, `solace-primary-relay` |
| `webdock-1` | `mx2.solace.onl` | 20 | `solace-exim-relay`, `solace-standby-relay` |

Each host runs `k3s-agent`, a Stalwart replica and the host SMTP listener. Internet MTAs connect to HAProxy on TCP port 25. HAProxy forwards the original client address in one PROXY v2 header and passes the SMTP session through to Stalwart, which presents the STARTTLS certificate. The MX listener prefers its local replica and can use the peer. The secondary HAProxy config is `/etc/haproxy/solace-mx2.cfg`; discover the active config from the host's systemd unit before editing. Backend pod addresses can change on rescheduling. Any stable replacement targets must preserve the local-first order and the PROXY v2 contract.

Both MXs check JMAP discovery on each gateway's PROXY v2 health listener at port 18080. The [Stalwart rollout hook](../../../.zeabur/solace-mail/gateway/rollout/kustomization.yaml) closes that listener 18 seconds before shutdown so each MX can move new sessions to the peer. Keep the host health-check interval and failure threshold short enough to mark the draining gateway down within that window.

The outbound relay units deliver from the Webdock hosts. Keep relay listeners private. HTTPS for API, JMAP, admin and discovery follows the [public Traefik ingress](../README.md#request-paths).

## Verify

On the respective VPS, inspect `haproxy`, `k3s-agent` and the relay units in the table. Independently verify public SMTP from outside the VPSs:

```sh
for mx in mx.solace.onl mx2.solace.onl; do
  openssl s_client -brief -starttls smtp -connect "$mx:25" \
    -servername "$mx" -verify_hostname "$mx" -verify_return_error </dev/null
done
```

Confirm both MX records and priorities. A successful handshake verifies the public listener and certificate. Test local-backend recovery and failover separately when making routing changes.
