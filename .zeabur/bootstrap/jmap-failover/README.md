# Solace JMAP DNS failover

| Role | Direct DNS target | Worker |
| --- | --- | --- |
| Preferred JMAP origin | mx.solace.onl | webdock-mail |
| Standby JMAP origin | mx2.solace.onl | webdock-1 |

The DNS-only CNAME for mail.solace.onl points to one of these origins with a 60-second TTL. The monitor connects directly to each origin and validates HTTPS using the mail.solace.onl hostname and certificate. Both origins forward JMAP through the public Traefik and Stalwart Services. SMTP clients use the MX records and SMTP health checks separately.

Mail PostgreSQL uses the existing CloudNativePG cluster. The preferred operating location of its writable primary is webdock-mail. During recovery, check the current primary and identify its standby by node and role. Use the CloudNativePG promotion command after verifying two Ready instances and a synchronized standby. Both existing write Service selectors follow the primary. The app PostgreSQL service has its own lifecycle.

## Monitor behavior

Run the user service on roan-server with linger enabled. The host service can probe the public gateways and reach Cloudflare during K3s scheduling or pod-network recovery. If roan-server is offline, the DNS record stays at the last selected origin.

The monitor probes both HTTPS origins every five seconds. Two consecutive failed probes on the active origin and two successful probes on the alternate trigger a DNS switch. It restores the preferred target after twelve consecutive successful probes there. It preserves the current target when both origins fail. DNS changes reach clients as their cached records expire. Clients with existing JMAP connections reconnect when their transport drops.

The probe requires HTTP 200, a canonical JMAP API URL and the JMAP core capability. Verify mailbox access with the separate authenticated check below.

The monitor reads the Cloudflare record every minute and before any switch. It edits only the target of the DNS-only `mail.solace.onl` CNAME with TTL 60. If a Cloudflare request fails, the monitor keeps probing JMAP and defers DNS requests for 30 seconds. It reads the actual record after a failed write before deciding whether to send another update. Run one instance of the monitor. Stop it before editing this record manually.

Use a Cloudflare API token limited to zone read and DNS edit for solace.onl. Store it in the user's private configuration directory with file mode 0600. The unit loads the credential through systemd. The DNS request code emits status and target names.

## Install or check the host service

On roan-server, provision the token at `~/.local/state/solace-jmap-failover/cloudflare-token`, with file mode 0600 and directory mode 0700. The existing DNS-only CNAME needs TTL 60 and must point to one of the origins. For a migration from `edge.solace.onl`, stop any existing monitor and use the reviewed script with `--select mx.solace.onl` and `--token-file`.

Run this from a Rocal checkout in Bash with `SOLACE_REVISION` set to the reviewed commit SHA.

```bash
(
  set -euo pipefail
  staging_path=$(mktemp -d)
  trap 'rm -rf -- "$staging_path"' EXIT
  source_dir=.zeabur/bootstrap/jmap-failover
  state_path="$HOME/.local/state/solace-jmap-failover"
  unit_dir="$HOME/.config/systemd/user"
  unit=solace-jmap-failover.service
  git archive "${SOLACE_REVISION:?Set SOLACE_REVISION to the reviewed commit SHA}" "$source_dir" \
    | tar -xf - -C "$staging_path"
  source_path="$staging_path/$source_dir"
  python3 -B -m unittest discover -s "$source_path" -v
  python3 "$source_path/failover.py" --check
  python3 "$source_path/failover.py" --check-dns --token-file "$state_path/cloudflare-token"
  systemd-analyze --user verify "$source_path/$unit"
  install -d "$unit_dir"
  install -m 700 "$source_path/failover.py" "$state_path/failover.py.next"
  install -m 644 "$source_path/$unit" "$unit_dir/$unit.next"
  mv -f "$state_path/failover.py.next" "$state_path/failover.py"
  mv -f "$unit_dir/$unit.next" "$unit_dir/$unit"
  systemctl --user daemon-reload
  systemctl --user enable "$unit"
  systemctl --user restart "$unit"
  systemctl --user is-active "$unit"
  journalctl --user -u "$unit" -n 30 --no-pager
  dig +short mail.solace.onl CNAME
)
```

To roll back, redeploy the prior reviewed revision. Revision `11deef12` predates `--check-dns`. When rolling back to that revision, run the DNS staging check with the currently installed script.

## Verify and recover

The PR workflow runs the same unit tests as the install procedure. Verify authenticated mailbox queries on both origins using the existing operational test credential. Verify both independent SMTP listeners with STARTTLS. Check the primary and ready endpoints for both `mail-pg` and `mail-database-rw`.

To route temporarily to the standby, stop the monitor, run the following command, and verify the authoritative DNS answer. Restarting the monitor re-enables automatic preference for the primary.

```bash
systemctl --user stop solace-jmap-failover.service
state_path="$HOME/.local/state/solace-jmap-failover"
python3 "$state_path/failover.py" --token-file "$state_path/cloudflare-token" --select mx2.solace.onl
```

To undo DNS steering, disable the monitor and restore the DNS-only mail.solace.onl CNAME to edge.solace.onl with a 60-second TTL through the Cloudflare DNS dashboard. Verify both direct origins and the canonical hostname. Keep the CloudNativePG roles under operator control while recovering. During failure of a shared dependency, check the CloudNativePG write Service and SeaweedFS readiness before changing the DNS target.

References [Cloudflare DNS TTL](https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/) and [CloudNativePG switchover](https://cloudnative-pg.io/docs/1.30/rolling_update/).
