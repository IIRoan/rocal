# Solace mail VPSs

| Kubernetes worker | Public MX | Priority | Outbound relay units |
| --- | --- | --- | --- |
| `webdock-mail` | `mx.solace.onl` | 10 | `postfix`, `solace-primary-relay` |
| `webdock-1` | `mx2.solace.onl` | 20 | `solace-exim-relay`, `solace-standby-relay` |

Each host runs `k3s-agent`, a Stalwart replica and the host SMTP listener. Internet MTAs connect to HAProxy on TCP port 25. HAProxy forwards the original client address in one PROXY v2 header and passes the SMTP session through to Stalwart, which presents the STARTTLS certificate. The MX listener prefers its local replica and can use the peer. The secondary HAProxy config is `/etc/haproxy/solace-mx2.cfg`; discover the active config from the host's systemd unit before editing. Backend pod addresses can change on rescheduling. Any stable replacement targets must preserve the local-first order and the PROXY v2 contract.

The outbound relay units deliver from the Webdock hosts. Keep relay listeners private. HTTPS for API, JMAP, admin and discovery follows the [Cloudflare and Zeabur ingress](../README.md#request-paths).

## Verify

On the respective VPS, inspect `haproxy`, `k3s-agent` and the relay units in the table. Run `/usr/local/bin/solace-vps-health` to inspect the same check used by Gatus. It checks this node's kubelet, relay units and SMTP STARTTLS. Independently verify public SMTP from outside the VPSs:

```sh
for mx in mx.solace.onl mx2.solace.onl; do
  openssl s_client -brief -starttls smtp -connect "$mx:25" \
    -servername "$mx" -verify_hostname "$mx" -verify_return_error </dev/null
done
```

Confirm both MX records and priorities, then check the [public status page](https://status.solace.onl). A successful handshake verifies the public listener and certificate. Test local-backend recovery and failover separately when making routing changes.

## Provision the monitoring account

For a replacement host, install [`vps-health.py`](../../gatus/vps-health.py) as `/usr/local/bin/solace-vps-health`, owned by root with mode 755. Run [`setup-gatus-monitor.sh`](setup-gatus-monitor.sh) with `--check /path/to/monitor.pub` and then `--apply /path/to/monitor.pub` as root. It installs the restricted `gatus-monitor` SSH account and a forced command. Pin the verified host key in the existing [Railway Monitoring settings](../../gatus/README.md#railway-variables).
