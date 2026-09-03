#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (or via sudo -n)" >&2
  exit 1
fi

SRC="${1:?usage: apply-vps-repo.sh <staged-vps-dir>}"
SRC="$(cd "$SRC" && pwd)"

APPLY_FRP="${APPLY_FRP:-0}"
APPLY_SYSTEMD="${APPLY_SYSTEMD:-0}"

HAPROXY_CFG_DST=/etc/haproxy/haproxy.cfg
ALLOW_DST=/etc/haproxy/admin-allow.lst
ALLOW_SRC="${APPLY_ALLOWLIST:-}"

ALLOWED_FILES=(
  apply-vps-repo.sh
  haproxy.cfg
  haproxy-sync-active-slot.sh
  stalwart-switch-slot.sh
  stalwart-slot-manager.py
  stalwart-slot-watcher.py
  gatus-monitor.sh
  frps.toml
  frpc-relay.toml
  stalwart-slot-manager.service
  stalwart-slot-watcher.service
  frps.service
  frpc-relay.service
)

require_file() {
  local f="$1"
  if [[ ! -f "${SRC}/${f}" ]]; then
    echo "missing required: ${SRC}/${f}" >&2
    exit 1
  fi
  if [[ -L "${SRC}/${f}" ]]; then
    echo "refusing symlink: ${SRC}/${f}" >&2
    exit 1
  fi
}

echo "==> Validating staged tree at ${SRC}"
shopt -s nullglob
for path in "${SRC}"/*; do
  [[ -f "$path" || -L "$path" ]] || continue
  base="$(basename "$path")"
  ok=0
  for allowed in "${ALLOWED_FILES[@]}"; do
    if [[ "$base" == "$allowed" ]]; then ok=1; break; fi
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "unexpected staged file (refusing): $base" >&2
    exit 1
  fi
done
shopt -u nullglob

require_file haproxy.cfg
require_file stalwart-switch-slot.sh
require_file stalwart-slot-manager.py
require_file stalwart-slot-watcher.py
require_file haproxy-sync-active-slot.sh

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

install -m 644 "${SRC}/haproxy.cfg" "${STAGE}/haproxy.cfg"
if [[ -n "$ALLOW_SRC" ]]; then
  test -f "$ALLOW_SRC"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    [[ -z "$line" ]] && continue
    if ! printf '%s' "$line" | grep -Eq '^[0-9a-fA-F.:/]+$'; then
      echo "invalid allowlist entry: $line" >&2
      exit 1
    fi
  done <"$ALLOW_SRC"
  install -m 644 "$ALLOW_SRC" "${STAGE}/admin-allow.lst"
fi

echo "==> Checking HAProxy config"
haproxy -c -f "${STAGE}/haproxy.cfg"

echo "==> Installing HAProxy config"
install -m 644 "${STAGE}/haproxy.cfg" "$HAPROXY_CFG_DST"
if [[ -f "${STAGE}/admin-allow.lst" ]]; then
  install -m 644 "${STAGE}/admin-allow.lst" "$ALLOW_DST"
fi
systemctl reload haproxy
echo "    haproxy reloaded"

echo "==> Installing slot / ops scripts"
install -m 755 "${SRC}/stalwart-switch-slot.sh" /usr/local/bin/stalwart-switch-slot
install -m 755 "${SRC}/haproxy-sync-active-slot.sh" /usr/local/bin/haproxy-sync-active-slot.sh
install -m 644 "${SRC}/stalwart-slot-manager.py" /usr/local/bin/stalwart-slot-manager.py
install -m 644 "${SRC}/stalwart-slot-watcher.py" /usr/local/bin/stalwart-slot-watcher.py
if [[ -f "${SRC}/gatus-monitor.sh" && ! -L "${SRC}/gatus-monitor.sh" ]]; then
  install -m 755 "${SRC}/gatus-monitor.sh" /usr/local/bin/gatus-monitor.sh
fi

if [[ "$APPLY_FRP" == "1" ]]; then
  echo "==> Installing frp configs (APPLY_FRP=1)"
  if [[ -f "${SRC}/frps.toml" && ! -L "${SRC}/frps.toml" ]]; then
    install -d -m 755 /etc/frp
    install -m 644 "${SRC}/frps.toml" /etc/frp/frps.toml
    if systemctl is-active --quiet frps; then
      systemctl reload frps 2>/dev/null || systemctl restart frps
      echo "    frps refreshed"
    fi
  fi
  if [[ -f "${SRC}/frpc-relay.toml" && ! -L "${SRC}/frpc-relay.toml" ]]; then
    install -d -m 755 /etc/frp
    install -m 644 "${SRC}/frpc-relay.toml" /etc/frp/frpc-relay.toml
    if systemctl is-active --quiet frpc-relay; then
      systemctl reload frpc-relay 2>/dev/null || systemctl restart frpc-relay
      echo "    frpc-relay refreshed"
    fi
  fi
else
  echo "==> Skipping frp configs (set APPLY_FRP=1 to enable)"
fi

if [[ "$APPLY_SYSTEMD" == "1" ]]; then
  echo "==> Installing systemd units (APPLY_SYSTEMD=1)"
  for unit in stalwart-slot-manager stalwart-slot-watcher; do
    src_unit="${SRC}/${unit}.service"
    if [[ -f "$src_unit" && ! -L "$src_unit" ]]; then
      install -m 644 "$src_unit" "/etc/systemd/system/${unit}.service"
    fi
  done
  systemctl daemon-reload
  for unit in stalwart-slot-manager stalwart-slot-watcher; do
    if systemctl is-enabled --quiet "$unit" 2>/dev/null || systemctl is-active --quiet "$unit"; then
      systemctl restart "$unit"
      echo "    restarted $unit"
    fi
  done
else
  echo "==> Skipping systemd unit install (set APPLY_SYSTEMD=1 to enable)"
  for unit in stalwart-slot-manager stalwart-slot-watcher; do
    if systemctl is-active --quiet "$unit"; then
      systemctl restart "$unit"
      echo "    restarted $unit (binary/script refresh)"
    fi
  done
fi

if [[ -x /usr/local/bin/haproxy-sync-active-slot.sh ]]; then
  /usr/local/bin/haproxy-sync-active-slot.sh || true
fi

echo "==> Done. Active slot: $(cat /etc/haproxy/stalwart-active-slot 2>/dev/null || echo unknown)"
