# Solace JMAP DNS failover

| Role | Direct DNS target | Worker |
| --- | --- | --- |
| Preferred JMAP origin | mx.solace.onl | webdock-mail |
| Standby JMAP origin | mx2.solace.onl | webdock-1 |

The DNS-only CNAME for mail.solace.onl points to one of these origins with a 60-second TTL. The monitor connects directly to each origin and validates HTTPS using the mail.solace.onl hostname and certificate. Both origins forward JMAP through the public Traefik and Stalwart Services. SMTP clients use the MX records and SMTP health checks separately.

Mail PostgreSQL uses the existing CloudNativePG cluster. The preferred operating location of its writable primary is webdock-mail. During recovery, check the current primary and identify its standby by node and role. Use the CloudNativePG promotion command after verifying two Ready instances and a synchronized standby. Both existing write Service selectors follow the primary. The app PostgreSQL service has its own lifecycle.

## Monitor behavior

Run the user service on roan-server with linger enabled. It probes both HTTPS origins every five seconds. Two consecutive failed probes on the active origin and two successful probes on the alternate trigger a DNS switch. It restores the preferred target after twelve consecutive successful probes there. It preserves the current target when both origins fail. DNS changes reach clients as their cached records expire. Clients with existing JMAP connections reconnect when their transport drops.

The monitor edits only the mail.solace.onl CNAME and accepts only the two documented targets during normal operation. It validates the current record before writing it. Administrators stop the monitor before manually editing this record.

Use a Cloudflare API token limited to zone read and DNS edit for solace.onl. Store it in the user's private configuration directory with file mode 0600. The unit loads the credential through systemd. The DNS request code emits status and target names.

## Install or check the host service

On roan-server, install failover.py into ~/.local/state/solace-jmap-failover/ and the user unit into ~/.config/systemd/user/. Provision the token at ~/.local/state/solace-jmap-failover/cloudflare-token. Set the directory to mode 0700, the token to mode 0600, and verify the unit.

```sh
python3 ~/.local/state/solace-jmap-failover/failover.py --check
systemctl --user daemon-reload
systemctl --user enable --now solace-jmap-failover.service
journalctl --user -u solace-jmap-failover.service -n 30 --no-pager
dig +short mail.solace.onl CNAME
```

The operating record must already point to an origin for the automatic service to start. When migrating from edge.solace.onl, use the manual selection command first.

## Verify and recover

Run the tests in this directory with python3 -m unittest. Test each HTTPS origin directly with the mail hostname preserved, then verify authenticated mailbox queries on both origins using the existing operational test credential. Verify both independent SMTP listeners with STARTTLS. Check the primary and ready endpoints for both mail-pg and mail-database-rw.

To route temporarily to the standby, stop the monitor, run the following command, and verify the authoritative DNS answer. Restarting the monitor re-enables automatic preference for the primary.

```bash
systemctl --user stop solace-jmap-failover.service
state_path="$HOME/.local/state/solace-jmap-failover"
python3 "$state_path/failover.py" --token-file "$state_path/cloudflare-token" --select mx2.solace.onl
```

To undo DNS steering, disable the monitor and restore the DNS-only mail.solace.onl CNAME to edge.solace.onl with a 60-second TTL through the Cloudflare DNS dashboard. Verify both direct origins and the canonical hostname. Keep the CloudNativePG roles under operator control while recovering. During failure of a shared dependency, check the CloudNativePG write Service and SeaweedFS readiness before changing the DNS target.

References [Cloudflare DNS TTL](https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/) and [CloudNativePG switchover](https://cloudnative-pg.io/docs/1.30/rolling_update/).
