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

render_frp_config() {
  sed -e "s|__FRP_TOKEN__|${FRP_TOKEN}|g" -e "s|__FRP_RELAY_STCP_KEY__|${FRP_RELAY_STCP_KEY}|g" "$1" >"$2"
  if grep -q '__FRP_' "$2"; then
    echo "unrendered frp placeholder in $1" >&2
    exit 1
  fi
}

if [[ "$APPLY_FRP" == "1" ]]; then
  echo "==> Installing frp configs (APPLY_FRP=1)"
  FRP_SECRETS="${APPLY_FRP_SECRETS:?APPLY_FRP=1 needs APPLY_FRP_SECRETS (file with FRP_TOKEN=, FRP_RELAY_STCP_KEY= and FRP_TLS_*=)}"
  FRP_TOKEN="$(sed -n 's/^FRP_TOKEN=//p' "$FRP_SECRETS")"
  FRP_RELAY_STCP_KEY="$(sed -n 's/^FRP_RELAY_STCP_KEY=//p' "$FRP_SECRETS")"
  for secret in "$FRP_TOKEN" "$FRP_RELAY_STCP_KEY"; do
    if [[ ! "$secret" =~ ^[A-Za-z0-9]{32,}$ ]]; then
      echo "FRP_TOKEN and FRP_RELAY_STCP_KEY must be 32+ alphanumeric characters" >&2
      exit 1
    fi
  done
  # A bad cert here would keep frps from starting and take mail down, so check the set before installing it.
  for pair in FRP_TLS_CA:ca.crt FRP_TLS_SERVER_CERT:server.crt FRP_TLS_SERVER_KEY:server.key \
              FRP_TLS_CLIENT_CERT:client.crt FRP_TLS_CLIENT_KEY:client.key; do
    value="$(sed -n "s/^${pair%%:*}=//p" "$FRP_SECRETS")"
    if [[ -z "$value" ]] || ! printf '%s' "$value" | base64 -d >"${STAGE}/${pair#*:}" 2>/dev/null; then
      echo "${pair%%:*} must be a base64-encoded PEM (scripts/frp-tls-certs.sh)" >&2
      exit 1
    fi
  done
  openssl verify -CAfile "${STAGE}/ca.crt" "${STAGE}/server.crt" "${STAGE}/client.crt" >/dev/null
  for name in server client; do
    if [[ "$(openssl x509 -noout -pubkey -in "${STAGE}/${name}.crt")" != "$(openssl pkey -pubout -in "${STAGE}/${name}.key")" ]]; then
      echo "FRP_TLS_${name^^}_KEY does not match FRP_TLS_${name^^}_CERT" >&2
      exit 1
    fi
  done
  install -d -m 700 /etc/frp/tls
  install -m 600 "${STAGE}/ca.crt" "${STAGE}/server.crt" "${STAGE}/server.key" \
    "${STAGE}/client.crt" "${STAGE}/client.key" /etc/frp/tls/
  if [[ -f "${SRC}/frps.toml" && ! -L "${SRC}/frps.toml" ]]; then
    install -d -m 755 /etc/frp
    render_frp_config "${SRC}/frps.toml" "${STAGE}/frps.toml"
    install -m 600 "${STAGE}/frps.toml" /etc/frp/frps.toml
    if systemctl is-active --quiet frps; then
      systemctl reload frps 2>/dev/null || systemctl restart frps
      echo "    frps refreshed"
    fi
  fi
  if [[ -f "${SRC}/frpc-relay.toml" && ! -L "${SRC}/frpc-relay.toml" ]]; then
    install -d -m 755 /etc/frp
    render_frp_config "${SRC}/frpc-relay.toml" "${STAGE}/frpc-relay.toml"
    install -m 600 "${STAGE}/frpc-relay.toml" /etc/frp/frpc-relay.toml
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
  if systemctl is-enabled --quiet stalwart-slot-manager 2>/dev/null || systemctl is-active --quiet stalwart-slot-manager; then
    systemctl restart stalwart-slot-manager
    echo "    restarted stalwart-slot-manager"
  fi
else
  echo "==> Skipping systemd unit install (set APPLY_SYSTEMD=1 to enable)"
  if systemctl is-active --quiet stalwart-slot-manager; then
    systemctl restart stalwart-slot-manager
    echo "    restarted stalwart-slot-manager (binary/script refresh)"
  fi
fi

# Group tunnels register per-container proxy names the watcher cannot see, so it would fail back to the old slot mid-cutover.
systemctl disable --now stalwart-slot-watcher 2>/dev/null || true

if [[ -x /usr/local/bin/haproxy-sync-active-slot.sh ]]; then
  /usr/local/bin/haproxy-sync-active-slot.sh || true
fi

echo "==> Done. Active slot: $(cat /etc/haproxy/stalwart-active-slot 2>/dev/null || echo unknown)"
