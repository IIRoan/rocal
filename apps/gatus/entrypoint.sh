#!/bin/sh
# Railway entrypoint: Gatus on :8081; public PORT serves status.html and /hooks/stalwart, and proxies the rest to Gatus.
set -eu
umask 077

mkdir -p /data

if [ "$(id -u)" -eq 0 ]; then
	chown -R gatus:gatus /data
	exec su-exec gatus "$0" "$@"
fi

GATUS_INTERNAL_PORT="${GATUS_INTERNAL_PORT:-8081}"
PUBLIC_PORT="${PORT}"

write_base_config() {
	if [ -n "${GATUS_CONFIG_YAML:-}" ]; then
		printf '%s\n' "$GATUS_CONFIG_YAML" > /data/config.yaml
		return 0
	fi

	cp /etc/gatus/config.default.yaml /data/config.yaml
}

inject_basic_auth() {
	if [ -z "${GATUS_ADMIN_USERNAME:-}" ] || [ -z "${GATUS_ADMIN_PASSWORD:-}" ]; then
		return 0
	fi

	if grep -q '^security:' /data/config.yaml; then
		return 0
	fi

	BCRYPT_HASH=$(htpasswd -B -n -b "$GATUS_ADMIN_USERNAME" "$GATUS_ADMIN_PASSWORD" | cut -d: -f2)
	BCRYPT_B64=$(printf '%s' "$BCRYPT_HASH" | base64 -w0 2>/dev/null || printf '%s' "$BCRYPT_HASH" | base64)
	{
		echo "security:"
		echo "  basic:"
		echo "    username: \"$GATUS_ADMIN_USERNAME\""
		echo "    password-bcrypt-base64: \"$BCRYPT_B64\""
		echo ""
		cat /data/config.yaml
	} > /data/config.yaml.tmp
	mv /data/config.yaml.tmp /data/config.yaml
}

inject_prometheus_auth() {
	if [ -z "${prometheus_user:-}" ] || [ -z "${prometheus_password:-}" ]; then
		echo "prometheus_user/prometheus_password are not set; Stalwart metrics monitors will fail auth." >&2
		return 0
	fi

	python3 - <<'PY'
import base64
import os
import pathlib

config_path = pathlib.Path("/data/config.yaml")
marker = "__PROMETHEUS_BASIC_AUTH__"
config = config_path.read_text()
if marker not in config:
    raise SystemExit("Prometheus auth placeholder missing from Gatus config")
token = base64.b64encode(f"{os.environ['prometheus_user']}:{os.environ['prometheus_password']}".encode()).decode()
config_path.write_text(config.replace(marker, token))
PY
}

append_vps_ssh_endpoints() {
	if [ -z "${VPS_MONITOR_SSH_USERNAME:-}" ]; then
		return 0
	fi

	if [ -z "${VPS_MONITOR_SSH_PRIVATE_KEY:-}" ] && [ -z "${VPS_MONITOR_SSH_PRIVATE_KEY_B64:-}" ]; then
		echo "VPS SSH monitoring requires a private key." >&2
		exit 1
	fi
	: "${VPS_MONITOR_SSH_KNOWN_HOSTS:?VPS SSH monitoring requires pinned host keys}"
	printf '%s\n' "$VPS_MONITOR_SSH_KNOWN_HOSTS" > /data/vps_monitor_known_hosts
	export GATUS_SSH_KNOWN_HOSTS=/data/vps_monitor_known_hosts

	if [ -n "${VPS_MONITOR_SSH_PRIVATE_KEY_B64:-}" ]; then
		printf '%s' "$VPS_MONITOR_SSH_PRIVATE_KEY_B64" | base64 -d > /data/vps_monitor_key
	else
		printf '%s\n' "$VPS_MONITOR_SSH_PRIVATE_KEY" > /data/vps_monitor_key
	fi
	chmod 600 /data/vps_monitor_key
	python3 /usr/local/lib/solace/configure-vps-monitor.py /data/config.yaml /data/vps_monitor_key
}

write_base_config
chmod 600 /data/config.yaml
inject_basic_auth
inject_prometheus_auth

if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
	echo "DISCORD_WEBHOOK_URL is not set; Discord downtime alerts are disabled." >&2
fi

if [ -z "${STALWART_WEBHOOK_BEARER:-}" ]; then
	echo "STALWART_WEBHOOK_BEARER is not set; /hooks/stalwart will reject Stalwart alerts." >&2
fi

append_vps_ssh_endpoints

export GATUS_CONFIG_PATH="${GATUS_CONFIG_PATH:-/data/config.yaml}"
export GATUS_INTERNAL_PORT

PORT="$GATUS_INTERNAL_PORT" /usr/local/bin/gatus &
GATUS_PID=$!
PORT="$PUBLIC_PORT" python3 /usr/local/lib/solace/stalwart-discord-bridge.py &
BRIDGE_PID=$!

stop_children() {
	kill -TERM "$GATUS_PID" "$BRIDGE_PID" 2>/dev/null || true
	wait "$GATUS_PID" "$BRIDGE_PID" 2>/dev/null || true
}

trap 'stop_children; exit 0' TERM INT
while kill -0 "$GATUS_PID" 2>/dev/null && kill -0 "$BRIDGE_PID" 2>/dev/null; do
	sleep 1
done

echo "The Gatus process or its proxy exited." >&2
stop_children
exit 1
