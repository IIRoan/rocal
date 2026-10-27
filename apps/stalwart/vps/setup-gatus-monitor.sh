#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---check}"
PUBKEY="${2:?usage: setup-gatus-monitor.sh [--check|--apply] <ed25519-public-key>}"
[[ "$MODE" == "--check" || "$MODE" == "--apply" ]] || exit 2
[[ "$(id -u)" == "0" ]] || { echo "Run as root" >&2; exit 1; }
ssh-keygen -lf "$PUBKEY" >/dev/null
read -r key_type key_data _ < "$PUBKEY"
[[ "$key_type" == "ssh-ed25519" && "$key_data" =~ ^[A-Za-z0-9+/=]+$ ]] || exit 1
[[ -x /usr/local/bin/gatus-monitor.sh ]] || exit 1
[[ "$(stat -c '%U:%a' /usr/local/bin/gatus-monitor.sh)" == "root:755" ]] || exit 1

if getent passwd gatus-monitor >/dev/null; then
  [[ "$(getent passwd gatus-monitor | cut -d: -f6)" == "/var/lib/gatus-monitor" ]] || exit 1
  [[ "$(id -nG gatus-monitor)" == "gatus-monitor" ]] || exit 1
fi
if [[ "$MODE" == "--check" ]]; then
  echo "Monitoring account prerequisites valid; no changes applied"
  exit 0
fi

if ! getent passwd gatus-monitor >/dev/null; then
  useradd --system --user-group --home-dir /var/lib/gatus-monitor --shell /bin/sh gatus-monitor
fi
passwd -l gatus-monitor >/dev/null
# Root ownership prevents the monitor from replacing its forced command or authorizing another key.
install -d -o root -g root -m 755 /var/lib/gatus-monitor /var/lib/gatus-monitor/.ssh
printf 'restrict,command="/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/bin /usr/bin/timeout 20s /usr/local/bin/gatus-monitor.sh" %s %s\n' \
  "$key_type" "$key_data" > /var/lib/gatus-monitor/.ssh/authorized_keys
chown root:root /var/lib/gatus-monitor/.ssh/authorized_keys
chmod 644 /var/lib/gatus-monitor/.ssh/authorized_keys
echo "Dedicated monitoring account installed without sudo or forwarding access"
