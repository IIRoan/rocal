#!/bin/sh
# Railway-native entrypoint: Stalwart + health listener + frpc.
set -eu

# stalwart-cli needs a writable HOME; the image user has none.
export HOME="${HOME:-/tmp}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${HOME}/.cache}"

FRPC_LOG_FILE="${FRPC_LOG_FILE:-/tmp/frpc.log}"
FRPC_STANDBY_LOG_FILE="${FRPC_STANDBY_LOG_FILE:-/tmp/frpc-standby.log}"
FRPC_RELAY_LOG_FILE="${FRPC_RELAY_LOG_FILE:-/tmp/frpc-relay.log}"
FRPC_RELAY_STCP_KEY="${FRPC_RELAY_STCP_KEY:-relay-stcp-secret}"
FRPC_RELAY_LOCAL_PORT="${FRPC_RELAY_LOCAL_PORT:-2525}"
FRPC_STANDBY_ENABLED="${FRPC_STANDBY_ENABLED:-true}"
RELAY_ROUTE_ID="${RELAY_ROUTE_ID:-ivnbzc1aaba9}"
STALWART_HTTP_PORT="${STALWART_HTTP_PORT:-8080}"
HEALTH_PORT="${PORT:-8090}"
HEALTH_STATE_PATH="${HEALTH_STATE_PATH:-/tmp/railway-health.json}"
PG_POOL_MAX_CONNECTIONS="${PG_POOL_MAX_CONNECTIONS:-6}"
FRPC_STATE_PATH="${FRPC_STATE_PATH:-/tmp/frpc-state.json}"
FRPC_SUPERVISOR_PID=""
FRPC_OWNER="$(python3 -c 'import uuid; print(uuid.uuid4())')"
export FRPC_OWNER FRPC_STATE_PATH

log() {
	printf '%s [%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" "$2" >&2
}

die() {
	log error "$1"
	exit 1
}

parse_database_url() {
	url="$1"
	url="${url#postgresql://}"
	url="${url#postgres://}"
	url="${url%%\?*}"

	auth="${url%%@*}"
	rest="${url#*@}"

	PGUSER="${PGUSER:-${auth%%:*}}"
	if [ -z "${PGPASSWORD:-}" ]; then
		export PGPASSWORD="${auth#*:}"
	fi

	hostport="${rest%%/*}"
	PGDATABASE="${PGDATABASE:-${rest#*/}}"

	if [ "${hostport#*:}" != "$hostport" ]; then
		PGHOST="${PGHOST:-${hostport%%:*}}"
		PGPORT="${PGPORT:-${hostport##*:}}"
	else
		PGHOST="${PGHOST:-$hostport}"
		PGPORT="${PGPORT:-5432}"
	fi
}

if [ -z "${PGHOST:-}" ]; then
	if [ -n "${DATABASE_URL:-}" ]; then
		parse_database_url "$DATABASE_URL"
	elif [ -n "${DATABASE_PUBLIC_URL:-}" ]; then
		parse_database_url "$DATABASE_PUBLIC_URL"
	fi
fi

PGHOST="${PGHOST:-}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-railway}}"
PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

USE_TLS=false
ALLOW_INVALID=false
RECOVERY_MODE=false

case "$PGHOST" in
	*.proxy.rlwy.net|*.rlwy.net) USE_TLS=true; ALLOW_INVALID=true ;;
	*.railway.internal) USE_TLS=false; ALLOW_INVALID=false ;;
esac
case "${DATABASE_URL:-}${DATABASE_PUBLIC_URL:-}" in
	*sslmode=require*|*sslmode=verify*) USE_TLS=true; ALLOW_INVALID=true ;;
esac
case "${STALWART_RECOVERY_MODE:-}" in
	1|true|TRUE|yes|YES) RECOVERY_MODE=true ;;
esac

json_get() {
	printf '%s\n' "$2" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p"
}

resolve_slot() {
	FRPC_SLOT="${FRPC_SLOT:-auto}"

	if [ "$FRPC_SLOT" != "auto" ]; then
		log info "FRPC_SLOT=${FRPC_SLOT} (from environment)."
		return 0
	fi

	active="$(curl -fsS --connect-timeout 3 --max-time 5 \
		"${SLOT_MANAGER_URL:-https://mail.solace.onl/slot-manager}/active" \
		2>/dev/null || true)"
	current="$(json_get active "$active")"

	case "$current" in
		blue) FRPC_SLOT=green ;;
		green) FRPC_SLOT=blue ;;
		*)
			die "Could not read active slot; refusing to guess a slot."
			;;
	esac

	log info "FRPC_SLOT=${FRPC_SLOT} (inactive side of active=${current})."
}

write_store_config() {
	mkdir -p /etc/stalwart
	cat > /etc/stalwart/config.json <<EOF
{
  "@type": "PostgreSql",
  "host": "${PGHOST}",
  "port": ${PGPORT},
  "database": "${PGDATABASE}",
  "authUsername": "${PGUSER}",
  "authSecret": {
    "@type": "EnvironmentVariable",
    "variableName": "PGPASSWORD"
  },
  "useTls": ${USE_TLS},
  "allowInvalidCerts": ${ALLOW_INVALID},
  "poolMaxConnections": ${PG_POOL_MAX_CONNECTIONS},
  "poolRecyclingMethod": "fast"
}
EOF
}

other_slot() {
	case "$1" in
		blue) printf '%s\n' green ;;
		green) printf '%s\n' blue ;;
		*) return 1 ;;
	esac
}

frpc_slot_ports() {
	case "$1" in
		blue)
			smtp=10025
			subs=10465
			subm=10587
			imaps=10993
			https=10443
			admin=18080
			;;
		green)
			smtp=11025
			subs=11465
			subm=11587
			imaps=11993
			https=11443
			admin=19080
			;;
		*) return 1 ;;
	esac
}

write_frpc_config() {
	slot="$1"
	config_path="$2"
	suffix="$slot"
	frpc_slot_ports "$slot" || die "FRPC slot must be blue or green (got ${slot})."
	case "$slot" in blue) admin_port=7400 ;; green) admin_port=7401 ;; esac

	cat > "$config_path" <<EOF
serverAddr = "${FRPS_ADDR}"
serverPort = ${FRPS_PORT:-7000}
loginFailExit = false
webServer.addr = "127.0.0.1"
webServer.port = ${admin_port}

[auth]
method = "token"
token = "${FRPC_TOKEN}"

[transport]
poolCount = 2
tcpMux = true
tcpMuxKeepaliveInterval = 10
dialServerTimeout = 10
dialServerKeepAlive = 60
EOF

	# HAProxy already sends PROXY v2; do not add a second header here.
	if [ "$RECOVERY_MODE" != "true" ]; then
		cat >> "$config_path" <<EOF

[[proxies]]
name = "smtp-${suffix}"
type = "tcp"
localIP = "127.0.0.1"
localPort = 25
remotePort = ${smtp}

[[proxies]]
name = "submissions-${suffix}"
type = "tcp"
localIP = "127.0.0.1"
localPort = 465
remotePort = ${subs}

[[proxies]]
name = "imaps-${suffix}"
type = "tcp"
localIP = "127.0.0.1"
localPort = 993
remotePort = ${imaps}

[[proxies]]
name = "submission-${suffix}"
type = "tcp"
localIP = "127.0.0.1"
localPort = 587
remotePort = ${subm}
EOF
	fi

	cat >> "$config_path" <<EOF

[[proxies]]
name = "https-${suffix}"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${STALWART_HTTP_PORT}
remotePort = ${https}

[[proxies]]
name = "http-admin-${suffix}"
type = "tcp"
localIP = "127.0.0.1"
localPort = ${STALWART_HTTP_PORT}
remotePort = ${admin}
EOF
}

port_listening() {
	ss -tln 2>/dev/null | grep -q ":$1 "
}

wait_for_stalwart_ports() {
	i=0
	max_wait="${STALWART_READY_TIMEOUT_SECONDS:-180}"
	while [ "$i" -lt "$max_wait" ]; do
		if port_listening 25 && port_listening "${STALWART_HTTP_PORT}"; then
			log info "Stalwart listening on :25 and :${STALWART_HTTP_PORT}."
			return 0
		fi
		i=$((i + 1))
		sleep 1
	done
	die "Stalwart did not open mail/http ports within ${max_wait}s."
}

write_health_state() {
	ready="${1:-false}"
	python3 - "$HEALTH_STATE_PATH" "$ready" <<'PY'
import json
import os
import sys

path, ready = sys.argv[1], sys.argv[2] == "true"
state = {
    "ready": ready,
    "recovery_mode": os.environ.get("RECOVERY_MODE") == "true",
    "stalwart_pid": int(os.environ.get("STALWART_PID", "0") or 0),
    "frpc_state_path": os.environ.get("FRPC_STATE_PATH", "/tmp/frpc-state.json"),
    "http_port": int(os.environ.get("STALWART_HTTP_PORT", "8080")),
    "relay_port": int(os.environ.get("FRPC_RELAY_LOCAL_PORT", "2525")),
}
with open(path + ".tmp", "w", encoding="utf-8") as handle:
    json.dump(state, handle)
os.replace(path + ".tmp", path)
PY
}

start_health_server() {
	log info "Starting Railway health listener on 0.0.0.0:${HEALTH_PORT}/healthz/ready."
	write_health_state false
	HEALTH_PORT="$HEALTH_PORT" HEALTH_STATE_PATH="$HEALTH_STATE_PATH" python3 -u <<'PY' &
import json
import os
import socket
import threading
import time

port = int(os.environ["HEALTH_PORT"])
state_path = os.environ["HEALTH_STATE_PATH"]

OK = (
    b'HTTP/1.1 200 OK\r\n'
    b'Content-Type: application/json\r\n'
    b'Connection: close\r\n'
    b'Content-Length: 62\r\n\r\n'
    b'{"type":"about:blank","title":"OK","status":200,"detail":"OK"}'
)
UNAVAILABLE = (
    b'HTTP/1.1 503 Service Unavailable\r\n'
    b'Content-Type: application/json\r\n'
    b'Connection: close\r\n'
    b'Content-Length: 78\r\n\r\n'
    b'{"type":"about:blank","title":"Unavailable","status":503,"detail":"Not ready"}'
)


def load_state():
    try:
        with open(state_path, encoding="utf-8") as handle:
            return json.load(handle)
    except OSError:
        return {}
    except json.JSONDecodeError:
        return {}


def pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
    except OSError:
        return False
    return True


def port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", int(port))) == 0


def ready():
    state = load_state()
    if not state.get("ready"):
        return False
    if not pid_alive(state.get("stalwart_pid")):
        return False
    try:
        with open(state["frpc_state_path"], encoding="utf-8") as handle:
            tunnels = json.load(handle)
    except (OSError, ValueError, KeyError):
        return False
    if time.monotonic() - tunnels.get("updated", 0) > 15:
        return False
    if not pid_alive(tunnels.get("supervisor_pid")):
        return False
    relay = tunnels.get("relay", {})
    if not relay.get("ready") or not pid_alive(relay.get("pid")):
        return False
    if not any(tunnel.get("ready") and pid_alive(tunnel.get("pid"))
               for tunnel in tunnels.get("slots", {}).values()):
        return False
    for port in (25, state.get("http_port", 8080), state.get("relay_port", 2525)):
        if not port_open(port):
            return False
    return True


def handle(conn):
    try:
        conn.recv(4096)
        conn.sendall(OK if ready() else UNAVAILABLE)
    finally:
        conn.close()


sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(("0.0.0.0", port))
sock.listen(32)
while True:
    client, _addr = sock.accept()
    threading.Thread(target=handle, args=(client,), daemon=True).start()
PY
	HEALTH_PID=$!

	i=0
	while [ "$i" -lt 20 ]; do
		if curl -fsS --max-time 1 "http://127.0.0.1:${HEALTH_PORT}/healthz/ready" >/dev/null 2>&1; then
			log warn "Health listener responded before readiness gate; expected 503."
		else
			log info "Health listener ready on :${HEALTH_PORT} (returns 503 until stack is up)."
			return 0
		fi
		i=$((i + 1))
		sleep 0.5
	done
	die "Health listener failed to respond on :${HEALTH_PORT}."
}

prepare_blob_volume() {
	BLOB_FS_PATH="${BLOB_FS_PATH:-/var/stalwart/blobs}"
	if [ -d "$BLOB_FS_PATH" ] || mkdir -p "$BLOB_FS_PATH" 2>/dev/null; then
		chown -R stalwart:stalwart "$BLOB_FS_PATH" \
			|| die "Could not chown ${BLOB_FS_PATH} for stalwart user (volume permissions)."
	fi
}

run_as_stalwart() {
	runuser -u stalwart -- "$@"
}

start_stalwart() {
	log info "Starting Stalwart (db=${PGHOST}:${PGPORT}/${PGDATABASE})."
	prepare_blob_volume
	run_as_stalwart /usr/local/bin/stalwart --config /etc/stalwart/config.json 2>&1 &
	STALWART_PID=$!
	log info "Stalwart pid=${STALWART_PID}."
	wait_for_stalwart_ports
}

write_frpc_relay_config() {
	FRPC_RELAY_CONFIG="${FRPC_RELAY_CONFIG:-/tmp/frpc-relay.toml}"
	cat > "$FRPC_RELAY_CONFIG" <<EOF
serverAddr = "${FRPS_ADDR}"
serverPort = ${FRPS_PORT:-7000}

[auth]
method = "token"
token = "${FRPC_TOKEN}"

[[visitors]]
name = "relay-postfix-visitor"
type = "stcp"
serverName = "relay-postfix"
secretKey = "${FRPC_RELAY_STCP_KEY}"
bindAddr = "0.0.0.0"
bindPort = ${FRPC_RELAY_LOCAL_PORT}
EOF
}

detect_container_ip() {
	if [ -n "${RELAY_BIND_ADDR:-}" ]; then
		printf '%s\n' "$RELAY_BIND_ADDR"
		return 0
	fi

	for ip in $(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1); do
		case "$ip" in
			10.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|192.168.*)
				printf '%s\n' "$ip"
				return 0
				;;
		esac
	done

	die "Could not detect container private IP for relay route."
}


stalwart_management_url() {
	# Stalwart HTTP is on the container private IP, not loopback.
	printf 'http://%s:%s\n' "$(detect_container_ip)" "${STALWART_HTTP_PORT}"
}

stalwart_api_ready() {
	stalwart_url="$(stalwart_management_url)"

	if curl -fsSL --max-time 2 \
		-H "Authorization: Bearer ${STALWART_ADMIN_TOKEN}" \
		"${stalwart_url}/jmap/session" >/dev/null 2>&1; then
		return 0
	fi

	stalwart-cli --url "$stalwart_url" --api-key "$STALWART_ADMIN_TOKEN" \
		get MtaRoute "$RELAY_ROUTE_ID" >/dev/null 2>&1
}

update_relay_route() {
	[ -n "${STALWART_ADMIN_TOKEN:-}" ] || {
		log warn "STALWART_ADMIN_TOKEN unset; skipping relay route update."
		return 0
	}

	relay_addr="$(detect_container_ip)"
	stalwart_url="$(stalwart_management_url)"

	i=0
	max_attempts="${RELAY_ROUTE_UPDATE_ATTEMPTS:-90}"
	err_log="/tmp/relay-route-update.err"
	while [ "$i" -lt "$max_attempts" ]; do
		if stalwart_api_ready \
			&& stalwart-cli --url "$stalwart_url" --api-key "$STALWART_ADMIN_TOKEN" \
				update MtaRoute "$RELAY_ROUTE_ID" \
				--field "address=${relay_addr}" \
				--field "port=${FRPC_RELAY_LOCAL_PORT}" \
				2>"$err_log"; then
			stalwart-cli --url "$stalwart_url" --api-key "$STALWART_ADMIN_TOKEN" \
				create Action/ReloadSettings >/dev/null 2>&1 || true
			log info "Relay route -> ${relay_addr}:${FRPC_RELAY_LOCAL_PORT} (id=${RELAY_ROUTE_ID}; via ${stalwart_url})."
			return 0
		fi
		i=$((i + 1))
		sleep 2
	done

	tail -n 3 "$err_log" >&2 || true
	log error "Could not update relay route to ${relay_addr}:${FRPC_RELAY_LOCAL_PORT} via ${stalwart_url}."
	return 1
}

seed_stalwart_cli_schema() {
	url="$1"
	schema_src="${STALWART_CLI_SCHEMA:-/usr/local/share/stalwart/cli-schema.json}"
	latest_src="${STALWART_CLI_SCHEMA_LATEST:-/usr/local/share/stalwart/cli-schema.latest}"
	[ -f "$schema_src" ] && [ -f "$latest_src" ] || return 0
	hash="$(python3 -c 'import hashlib,base64,sys; print(base64.urlsafe_b64encode(hashlib.sha256(sys.argv[1].encode()).digest()).decode().rstrip("="))' "$url")"
	latest_name="$(tr -d '\n' <"$latest_src")"
	# dirs crate uses XDG_CACHE_HOME or ~/.cache; seed both so apply never needs /api/schema.
	for cache_root in "${XDG_CACHE_HOME}/stalwart-cli" "${HOME}/.cache/stalwart-cli"; do
		dest="${cache_root}/${hash}"
		mkdir -p "$dest"
		cp -f "$schema_src" "${dest}/schema-${latest_name}.json"
		printf '%s\n' "$latest_name" >"${dest}/latest"
	done
}

reload_stalwart_settings() {
	for reload_url in "$@"; do
		[ -n "$reload_url" ] || continue
		stalwart-cli --url "$reload_url" --api-key "$STALWART_ADMIN_TOKEN" \
			create Action/ReloadSettings >/dev/null 2>&1 || true
	done
}

apply_stalwart_plan() {
	[ -n "${STALWART_ADMIN_TOKEN:-}" ] || die "STALWART_ADMIN_TOKEN required to apply config plan."
	plan_dir="${STALWART_PLAN_DIR:-/usr/local/share/stalwart/plan}"
	[ -d "$plan_dir" ] || die "Config plan missing at ${plan_dir}."
	plan="$(mktemp)"
	cat "$plan_dir"/*.ndjson >"$plan"
	[ -s "$plan" ] || {
		rm -f "$plan"
		die "Config plan is empty at ${plan_dir}."
	}

	# /api/schema 404s on this Stalwart build; seed the CLI cache so apply can run.
	ipv4_loopback_url="http://127.0.0.1:${STALWART_HTTP_PORT}"
	private_url="$(stalwart_management_url)"
	public_url="${STALWART_PUBLIC_URL:-https://mail.solace.onl}"
	for seed_url in "$ipv4_loopback_url" "$private_url" "$public_url"; do
		seed_stalwart_cli_schema "$seed_url"
	done
	log info "Seeded stalwart-cli schema cache for plan apply."
	i=0
	max_attempts="${PLAN_APPLY_ATTEMPTS:-15}"
	err_log="/tmp/stalwart-plan-apply.err"
	: >"$err_log"
	while [ "$i" -lt "$max_attempts" ]; do
		applied=""
		# Public URL is the proven CLI path (cached schema + JMAP). Local URLs reload this slot.
		for try_url in "$public_url" "$private_url" "$ipv4_loopback_url"; do
			if ! curl -fsSL --max-time 2 \
				-H "Authorization: Bearer ${STALWART_ADMIN_TOKEN}" \
				"${try_url}/jmap/session" >/dev/null 2>&1; then
				continue
			fi
			if stalwart-cli --url "$try_url" --api-key "$STALWART_ADMIN_TOKEN" \
				apply --file "$plan" 2>"$err_log"; then
				applied="$try_url"
				break
			fi
		done
		if [ -n "$applied" ]; then
			reload_stalwart_settings "$private_url" "$ipv4_loopback_url" "$public_url"
			rm -f "$plan"
			log info "Applied Stalwart config plan from ${plan_dir} via ${applied}."
			return 0
		fi
		if [ "$i" -eq 0 ]; then
			log warn "plan apply not ready yet: $(tr '\n' ' ' <"$err_log" 2>/dev/null || true)"
		fi
		i=$((i + 1))
		sleep 2
	done
	tail -n 20 "$err_log" >&2 || true
	rm -f "$plan"
	die "Could not apply Stalwart config plan via ${public_url}, ${private_url}, or ${ipv4_loopback_url}."
}

mark_health_ready() {
	export STALWART_PID STALWART_HTTP_PORT FRPC_RELAY_LOCAL_PORT RECOVERY_MODE
	write_health_state true
	log info "Railway health gate open (Stalwart + frpc + relay ready)."
}

activate_slot() {
	log info "Requesting VPS promotion for slot=${FRPC_SLOT}."
	if curl -fsS --connect-timeout 5 --max-time 90 \
		-X POST "${SLOT_MANAGER_URL:-https://mail.solace.onl/slot-manager}/activate" \
		-H "Authorization: Bearer ${SLOT_MANAGER_TOKEN}" \
		-H "Content-Type: application/json" \
		-d "{\"slot\":\"${FRPC_SLOT}\",\"owner\":\"${FRPC_OWNER}\"}" >/dev/null; then
		log info "VPS promoted slot=${FRPC_SLOT}."
		return 0
	fi

	die "VPS slot promotion failed; refusing to open Railway health gate."
}

start_frpc() {
	FRPC_CONFIG="${FRPC_CONFIG:-/tmp/frpc.toml}"
	FRPC_STANDBY_CONFIG="${FRPC_STANDBY_CONFIG:-/tmp/frpc-standby.toml}"
	write_frpc_config "$FRPC_SLOT" "$FRPC_CONFIG"
	write_frpc_config "$(other_slot "$FRPC_SLOT")" "$FRPC_STANDBY_CONFIG"
	write_frpc_relay_config
	export FRPC_SLOT RECOVERY_MODE FRPC_LOG_FILE FRPC_STANDBY_LOG_FILE FRPC_RELAY_LOG_FILE
	export FRPC_CONFIG FRPC_STANDBY_CONFIG
	export FRPC_RELAY_CONFIG FRPC_RELAY_LOCAL_PORT FRPC_STANDBY_ENABLED HEALTH_STATE_PATH
	python3 /usr/local/bin/frpc-supervisor.py &
	FRPC_SUPERVISOR_PID=$!

	# Leases and children remain supervised during plan apply and promotion.
	while kill -0 "$FRPC_SUPERVISOR_PID" 2>/dev/null; do
		if python3 - "$FRPC_STATE_PATH" "$FRPC_OWNER" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        state = json.load(handle)
    sys.exit(0 if state.get("boot_ready") and state.get("owner") == sys.argv[2] else 1)
except (OSError, ValueError):
    sys.exit(1)
PY
		then
			apply_stalwart_plan
			update_relay_route || die "Relay route update failed; refusing to open health gate."
			return 0
		fi
		sleep 1
	done
	die "frpc supervisor exited before boot readiness."
}

cleanup() {
	trap - EXIT TERM INT
	for child in "${FRPC_SUPERVISOR_PID:-}" "${STALWART_PID:-}" "${HEALTH_PID:-}"; do
		[ -z "$child" ] || kill "$child" 2>/dev/null || true
	done
	[ -z "${FRPC_SUPERVISOR_PID:-}" ] || wait "$FRPC_SUPERVISOR_PID" 2>/dev/null || true
}

# --- main ---

[ -n "$PGHOST" ] && [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] || die "Missing PostgreSQL credentials."

[ -n "${FRPS_ADDR:-}" ] && [ -n "${FRPC_TOKEN:-}" ] || die "FRPS_ADDR and FRPC_TOKEN are required."
[ -n "${SLOT_MANAGER_TOKEN:-}" ] || die "SLOT_MANAGER_TOKEN is required for safe slot coordination."
trap cleanup EXIT
trap 'exit 0' TERM INT

write_store_config
prepare_blob_volume
resolve_slot
start_health_server
start_stalwart
sleep "${STALWART_BOOT_DELAY_SECONDS:-3}"
start_frpc
activate_slot
mark_health_ready

i=0
while [ "$i" -lt 30 ]; do
	if curl -fsS --max-time 1 "http://127.0.0.1:${HEALTH_PORT}/healthz/ready" >/dev/null 2>&1; then
		break
	fi
	i=$((i + 1))
	sleep 1
done
[ "$i" -lt 30 ] || die "Health gate did not return 200 after readiness."

log info "Running (Railway health :${HEALTH_PORT}/healthz/ready; slot=${FRPC_SLOT}; Stalwart :${STALWART_HTTP_PORT})."

while :; do
	if ! kill -0 "$STALWART_PID" 2>/dev/null; then
		write_health_state false
		wait "$STALWART_PID" 2>/dev/null || true
		die "Stalwart exited."
	fi
	if ! kill -0 "$HEALTH_PID" 2>/dev/null; then
		die "Health listener exited."
	fi
	if ! kill -0 "$FRPC_SUPERVISOR_PID" 2>/dev/null; then
		die "frpc supervisor exited."
	fi
	sleep 5
done
