#!/bin/sh
# Railway-native entrypoint: Stalwart + health listener + frpc.
set -eu

# stalwart-cli needs a writable HOME; the image user has none.
export HOME="${HOME:-/tmp}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${HOME}/.cache}"

FRPC_CONFIG="${FRPC_CONFIG:-/tmp/frpc.toml}"
FRPC_ADMIN_PORT="${FRPC_ADMIN_PORT:-7400}"
FRPC_TLS_DIR="${FRPC_TLS_DIR:-/tmp/frp-tls}"
FRPC_RELAY_LOCAL_PORT="${FRPC_RELAY_LOCAL_PORT:-2525}"
RELAY_ROUTE_ID="${RELAY_ROUTE_ID:-ivnbzc1aaba9}"
STALWART_HTTP_PORT="${STALWART_HTTP_PORT:-8080}"
STALWART_GATE_PORT="${STALWART_GATE_PORT:-8081}"
STALWART_PUBLIC_PORT="${STALWART_PUBLIC_PORT:-8082}"
HEALTH_PORT="${PORT:-8090}"
HEALTH_STATE_PATH="${HEALTH_STATE_PATH:-/tmp/railway-health.json}"
PG_POOL_MAX_CONNECTIONS="${PG_POOL_MAX_CONNECTIONS:-32}"
FRPC_PID=""
FRPC_OWNER="$(python3 -c 'import uuid; print(uuid.uuid4())')"

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
UPGRADE_PHASE="${STALWART_UPGRADE_PHASE:-ordinary}"
UPGRADE_HELPER="${STALWART_UPGRADE_HELPER:-/usr/local/bin/upgrade-1.1.0.py}"

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

write_frpc_group_proxy() {
	cat >> "$FRPC_CONFIG" <<EOF

[[proxies]]
name = "$1-${FRPC_OWNER}"
type = "tcp"
localIP = "127.0.0.1"
localPort = $2
remotePort = $3
loadBalancer.group = "$1"
# Only our own clients join; frps already demands the token, so it doubles as the group key.
loadBalancer.groupKey = "${FRPC_TOKEN}"
EOF
}

write_frpc_config() {
	cat > "$FRPC_CONFIG" <<EOF
serverAddr = "${FRPS_ADDR}"
serverPort = ${FRPS_PORT:-7000}
loginFailExit = false
webServer.addr = "127.0.0.1"
webServer.port = ${FRPC_ADMIN_PORT}

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

	# Rolled out in stages (README "Tunnel mutual TLS"): client cert first, then frps requires it, then frpc pins the CA.
	if [ -n "${FRPC_TLS_CERT:-}" ]; then
		cat >> "$FRPC_CONFIG" <<EOF
tls.certFile = "${FRPC_TLS_DIR}/client.crt"
tls.keyFile = "${FRPC_TLS_DIR}/client.key"
EOF
	fi
	if [ -n "${FRPC_TLS_CA:-}" ]; then
		cat >> "$FRPC_CONFIG" <<EOF
tls.trustedCaFile = "${FRPC_TLS_DIR}/ca.crt"
tls.serverName = "frps.solace"
EOF
	fi

	cat >> "$FRPC_CONFIG" <<EOF

[[visitors]]
name = "relay-postfix-visitor"
type = "stcp"
serverName = "relay-postfix"
secretKey = "${FRPC_RELAY_STCP_KEY}"
bindAddr = "0.0.0.0"
bindPort = ${FRPC_RELAY_LOCAL_PORT}
EOF

	# The frps groups keep the VPS routing stable while Redis coordinates overlapping mail instances.
	if [ "$RECOVERY_MODE" != "true" ]; then
		write_frpc_group_proxy smtp 25 10025
	fi
	write_frpc_group_proxy http "${STALWART_HTTP_PORT}" 18080
	# The VPS passes :443 through still encrypted, so Stalwart answers with its own ACME certificate.
	write_frpc_group_proxy https 8443 18443
}

port_listening() {
	ss -tln 2>/dev/null | grep -q ":$1 "
}

wait_for_stalwart_ready() {
	i=0
	max_wait="${STALWART_READY_TIMEOUT_SECONDS:-180}"
	while [ "$i" -lt "$max_wait" ]; do
		# Stalwart's own readiness covers its data store; loopback would need a PROXY header.
		if port_listening 25 && curl -fsS --max-time 2 "$(stalwart_management_url)/healthz/ready" >/dev/null 2>&1; then
			log info "Stalwart ready on :25 and :${STALWART_HTTP_PORT}."
			return 0
		fi
		i=$((i + 1))
		sleep 1
	done
	die "Stalwart was not ready within ${max_wait}s."
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
    "phase": os.environ.get("UPGRADE_PHASE", "ordinary"),
    "management_url": os.environ.get("MANAGEMENT_URL", "http://127.0.0.1:8080"),
    "recovery_mode": os.environ.get("UPGRADE_PHASE") == "prepare",
    "stalwart_pid": int(os.environ.get("STALWART_PID", "0") or 0),
    "frpc_pid": int(os.environ.get("FRPC_PID", "0") or 0),
    "http_port": int(os.environ.get("STALWART_HTTP_PORT", "8080")),
    "gate_port": int(os.environ.get("STALWART_GATE_PORT", "8081")),
    "public_port": int(os.environ.get("STALWART_PUBLIC_PORT", "8082")),
}
with open(path + ".tmp", "w", encoding="utf-8") as handle:
    json.dump(state, handle)
# The unprivileged listener reads only non-secret process and port state.
os.chmod(path + ".tmp", 0o644)
os.replace(path + ".tmp", path)
PY
}

start_health_server() {
	log info "Starting Railway health listener on 0.0.0.0:${HEALTH_PORT}/healthz/ready."
	write_health_state false
	HEALTH_PORT="$HEALTH_PORT" HEALTH_STATE_PATH="$HEALTH_STATE_PATH" run_as_stalwart python3 -u <<'PY' &
import json
import os
import socket
import threading
import base64
import urllib.request

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
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", int(port))) == 0


def ready():
    state = load_state()
    if not state.get("ready") or state.get("phase", "ordinary") != "ordinary":
        return False
    # Tunnel reachability is checked once at boot; probing the VPS here would also take down the VPS-independent gate.
    if not pid_alive(state.get("stalwart_pid")) or not pid_alive(state.get("frpc_pid")):
        return False
    for port in (25, state.get("http_port", 8080), state.get("gate_port", 8081), state.get("public_port", 8082)):
        if not port_open(port):
            return False
    return management_ready(state, authenticated=False)


def management_ready(state, authenticated=True):
    try:
        request = urllib.request.Request(state.get("management_url", "http://127.0.0.1:8080") + ("/jmap/session" if authenticated else "/healthz/ready"))
        if authenticated:
            temporary = os.environ.get("STALWART_RECOVERY_ADMIN")
            authorization = "Basic " + base64.b64encode(temporary.encode()).decode() if temporary else "Bearer " + os.environ["STALWART_ADMIN_TOKEN"]
            request.add_header("Authorization", authorization)
        with urllib.request.urlopen(request, timeout=2) as response:
            return response.status == 200
    except (OSError, KeyError):
        return False


def phase_ready(phase):
    state = load_state()
    if state.get("phase") != phase or not state.get("ready") or not pid_alive(state.get("stalwart_pid")):
        return False
    if phase == "held" and not port_open(state.get("gate_port", 8081)):
        return False
    return management_ready(state, authenticated=phase == "prepare")


def handle(conn):
    try:
        request = conn.recv(4096).split(b" ", 2)
        path = request[1] if len(request) > 1 else b""
        available = ready() if path == b"/healthz/ready" else (phase_ready("prepare") if path == b"/healthz/maintenance" else (phase_ready("held") if path == b"/healthz/held" else False))
        conn.sendall(OK if available else UNAVAILABLE)
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

run_as_stalwart() {
	runuser -u stalwart -- "$@"
}

start_stalwart() {
	log info "Starting Stalwart (db=${PGHOST}:${PGPORT}/${PGDATABASE})."
	setpriv --reuid=stalwart --regid=stalwart --init-groups -- /usr/local/bin/stalwart --config /etc/stalwart/config.json 2>&1 &
	STALWART_PID=$!
	log info "Stalwart pid=${STALWART_PID}."
	wait_for_stalwart_ready
}

start_gate() {
	run_as_stalwart haproxy -db -f /usr/local/share/stalwart/backend-gate.cfg &
	GATE_PID=$!
	log info "JMAP gateway pid=${GATE_PID} (private :${STALWART_GATE_PORT}, public :${STALWART_PUBLIC_PORT})."
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

update_relay_route() {
	[ -n "${STALWART_ADMIN_TOKEN:-}" ] || {
		log warn "STALWART_ADMIN_TOKEN unset; skipping relay route update."
		return 0
	}

	relay_addr="$(detect_container_ip)"
	stalwart_url="$(stalwart_management_url)"

	i=0
	max_attempts="${RELAY_ROUTE_UPDATE_ATTEMPTS:-90}"
	while [ "$i" -lt "$max_attempts" ]; do
		if stalwart-cli --url "$stalwart_url" --api-key "$STALWART_ADMIN_TOKEN" \
			update MtaRoute "$RELAY_ROUTE_ID" \
			--field "host=${relay_addr}" \
			--field "port=${FRPC_RELAY_LOCAL_PORT}" \
			2>/dev/null; then
			reload_stalwart_settings || return 1
			log info "Relay route -> ${relay_addr}:${FRPC_RELAY_LOCAL_PORT} (id=${RELAY_ROUTE_ID}; via ${stalwart_url})."
			return 0
		fi
		i=$((i + 1))
		sleep 2
	done

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
	# The coordinator fans a reload out to every node; stalwart-cli 1.0 refuses an action without a body.
	stalwart-cli --url "${1:-$(stalwart_management_url)}" --api-key "$STALWART_ADMIN_TOKEN" \
		create Action/ReloadSettings --json '{}' >/dev/null 2>&1 \
		|| { log warn "Stalwart settings reload failed."; return 1; }
}

verify_stalwart_cluster() {
	python3 - "${1:-$(stalwart_management_url)}" <<'PY'
import json, os, sys, urllib.request
try:
    methods = ["x:InMemoryStore/get", "x:Coordinator/get"]
    body = {"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
            "methodCalls": [[method, {"ids": ["singleton"]}, str(i)] for i, method in enumerate(methods)]}
    request = urllib.request.Request(sys.argv[1] + "/jmap/", json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + os.environ["STALWART_ADMIN_TOKEN"], "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=10) as response:
        rows = json.load(response)["methodResponses"]
    values = {row[0]: row[1]["list"][0] for row in rows}
    memory = values[methods[0]]
    if memory["@type"] != "Redis" or memory["url"] != os.environ["STALWART_REDIS_URL"] or values[methods[1]]["@type"] != "Default":
        raise ValueError("Cluster store mismatch")
except Exception:
    sys.exit("Redis and Coordinator must be configured before startup; storage changes require a restart.")
PY
}

render_stalwart_plan() {
	python3 - "$1" <<'PY'
import json, os, pathlib, sys
for path in sorted(pathlib.Path(sys.argv[1]).glob("*.ndjson")):
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("object") == "InMemoryStore":
            entry["value"]["url"] = os.environ["STALWART_REDIS_URL"]
        if entry.get("object") == "BlobStore" and entry["value"].get("@type") == "S3":
            entry["value"]["bucket"] = os.environ["BUCKET"]
            entry["value"]["region"] = {"@type": "Custom", "url": os.environ["BUCKET_ENDPOINT"], "region": os.environ["BUCKET_REGION"]}
            entry["value"]["keyPrefix"] = os.environ.get("STALWART_BLOB_KEY_PREFIX", "stalwart/")
        print(json.dumps(entry))
PY
}

verify_stalwart_plan() {
	python3 - "$UPGRADE_HELPER" "$1" "$2" <<'PY_PLAN'
import importlib.util, json, os, pathlib, sys
spec = importlib.util.spec_from_file_location("upgrade", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    client = module.Client(sys.argv[3], "Bearer " + os.environ["STALWART_ADMIN_TOKEN"])
    entries = [module.decode(line) for line in pathlib.Path(sys.argv[2]).read_text().splitlines() if line.strip()]
    count = module.verify_managed_plan(client, entries)
    print(json.dumps({"managedObjectsVerified": count}))
except (module.Refusal, OSError, KeyError, TypeError):
    sys.exit("Managed plan readback failed; ordinary workers remain stopped.")
PY_PLAN
}

apply_stalwart_plan() {
	[ "${1:-}" = "recovery" ] || die "Managed plan apply requires recovery isolation."
	[ -n "${STALWART_ADMIN_TOKEN:-}" ] || die "STALWART_ADMIN_TOKEN required to apply config plan."
	plan_dir="${STALWART_PLAN_DIR:-/usr/local/share/stalwart/plan}"
	[ -d "$plan_dir" ] || die "Config plan missing at ${plan_dir}."
	plan="$(mktemp)"
	render_stalwart_plan "$plan_dir" >"$plan"
	[ -s "$plan" ] || {
		rm -f "$plan"
		die "Config plan is empty at ${plan_dir}."
	}

	# Pin validation to the schema shipped with this server image.
	ipv4_loopback_url="http://127.0.0.1:${STALWART_HTTP_PORT}"
	private_url="$ipv4_loopback_url"
	for seed_url in "$ipv4_loopback_url" "$private_url"; do
		seed_stalwart_cli_schema "$seed_url"
	done
	log info "Seeded stalwart-cli schema cache for plan apply."
	i=0
	max_attempts="${PLAN_APPLY_ATTEMPTS:-15}"
	while [ "$i" -lt "$max_attempts" ]; do
		applied=""
		# Apply only to this container, including when the public edge still serves the previous store.
		for try_url in "$private_url" "$ipv4_loopback_url"; do
			if ! curl -fsSL --max-time 2 \
				-H "Authorization: Bearer ${STALWART_ADMIN_TOKEN}" \
				"${try_url}/jmap/session" >/dev/null 2>&1; then
				continue
			fi
			if stalwart-cli --url "$try_url" --api-key "$STALWART_ADMIN_TOKEN" \
				apply --file "$plan" 2>/dev/null; then
				applied="$try_url"
				break
			fi
		done
		if [ -n "$applied" ]; then
			reload_stalwart_settings "$applied" || die "Managed settings reload failed; startup remains closed."
			verify_stalwart_plan "$plan" "$applied" || die "Managed plan readback failed; startup remains closed."
			rm -f "$plan"
			log info "Applied Stalwart config plan from ${plan_dir} via ${applied}."
			return 0
		fi
		if [ "$i" -eq 0 ]; then
			log warn "Plan apply has not succeeded; retrying local management."
		fi
		i=$((i + 1))
		sleep 2
	done
	rm -f "$plan"
	die "Could not apply Stalwart config plan via ${private_url} or ${ipv4_loopback_url}."
}

mark_health_ready() {
	export STALWART_PID STALWART_HTTP_PORT FRPC_RELAY_LOCAL_PORT RECOVERY_MODE FRPC_PID UPGRADE_PHASE MANAGEMENT_URL
	write_health_state true
	log info "Phase ${UPGRADE_PHASE} health check enabled."
}

write_frpc_tls() {
	mkdir -p "$FRPC_TLS_DIR" && chmod 700 "$FRPC_TLS_DIR" || return 1
	[ -z "${FRPC_TLS_CERT:-}" ] || printf '%s' "$FRPC_TLS_CERT" | base64 -d >"${FRPC_TLS_DIR}/client.crt" || return 1
	[ -z "${FRPC_TLS_KEY:-}" ] || (umask 077 && printf '%s' "$FRPC_TLS_KEY" | base64 -d >"${FRPC_TLS_DIR}/client.key") || return 1
	[ -z "${FRPC_TLS_CA:-}" ] || printf '%s' "$FRPC_TLS_CA" | base64 -d >"${FRPC_TLS_DIR}/ca.crt" || return 1
}

frpc_proxies_running() {
	curl -fsS --max-time 1 "http://127.0.0.1:${FRPC_ADMIN_PORT}/api/status" 2>/dev/null | python3 -c '
import json, sys
proxies = json.load(sys.stdin).get("tcp", [])
sys.exit(0 if proxies and all(proxy.get("status") == "running" for proxy in proxies) else 1)
' 2>/dev/null
}

start_frpc() {
	write_frpc_tls || die "FRPC_TLS_* must be base64-encoded PEM."
	write_frpc_config
	chown -R stalwart:stalwart "$FRPC_TLS_DIR" "$FRPC_CONFIG"
	chmod 600 "$FRPC_CONFIG"
	run_as_stalwart /usr/local/bin/frpc verify -c "$FRPC_CONFIG" >/dev/null || die "Invalid frpc configuration."
	run_as_stalwart /usr/local/bin/frpc -c "$FRPC_CONFIG" >&2 &
	FRPC_PID=$!

	i=0
	max_wait="${FRPC_READY_TIMEOUT_SECONDS:-10}"
	while [ "$i" -lt "$max_wait" ]; do
		kill -0 "$FRPC_PID" 2>/dev/null || die "frpc exited before its proxies were running."
		if frpc_proxies_running && port_listening "$FRPC_RELAY_LOCAL_PORT"; then
			log info "frpc pid=${FRPC_PID} joined the tunnel groups; relay visitor on :${FRPC_RELAY_LOCAL_PORT}."
			return 0
		fi
		i=$((i + 1))
		sleep 1
	done
	log warn "SMTP tunnel is unavailable; JMAP remains ready while frpc reconnects in the background."
}

cleanup() {
	trap - EXIT TERM INT
	write_health_state false || true
	# Leave the tunnel groups first so frps sends new connections to the other container, then drain.
	if [ -n "$FRPC_PID" ] && kill "$FRPC_PID" 2>/dev/null; then
		wait "$FRPC_PID" 2>/dev/null || true
		if [ -n "${STALWART_PID:-}" ] && kill -0 "$STALWART_PID" 2>/dev/null; then
			sleep "${FRPC_DRAIN_SECONDS:-10}"
		fi
	fi
	for child in "${GATE_PID:-}" "${STALWART_PID:-}" "${HEALTH_PID:-}"; do
		[ -z "$child" ] || kill "$child" 2>/dev/null || true
	done
	for child in "${GATE_PID:-}" "${STALWART_PID:-}" "${HEALTH_PID:-}"; do
		[ -z "$child" ] || wait "$child" 2>/dev/null || true
	done
}

validate_upgrade_configuration() {
	case "$UPGRADE_PHASE" in ordinary|prepare|held) ;; *) die "STALWART_UPGRADE_PHASE must be ordinary, prepare or held." ;; esac
	[ "$STALWART_HTTP_PORT" = "8080" ] || die "Recovery and ordinary HTTP must use the validated port 8080."
	[ "${STALWART_RECOVERY_MODE_PORT:-8080}" = "8080" ] || die "Unexpected recovery listener port."
	[ "$RECOVERY_MODE" = "false" ] || die "Select prepare through STALWART_UPGRADE_PHASE; direct recovery flags are forbidden."
	[ -n "${STALWART_APPROVED_STORE_ID:-}" ] || die "STALWART_APPROVED_STORE_ID is required."
	[ "${STALWART_APPROVED_VERSION:-}" = "1.1.0" ] || die "Explicit Stalwart 1.1.0 approval is required."
	[ "${STALWART_RECOVERY_ISOLATION:-}" = "unrouted-8080" ] || die "Recovery port isolation must be explicitly verified."
	if [ "$UPGRADE_PHASE" != "prepare" ]; then
		[ -z "${STALWART_RECOVERY_ADMIN:-}" ] || die "Temporary recovery administrators are forbidden outside prepare."
		[ -n "${STALWART_ADMIN_TOKEN:-}" ] || die "Ordinary administrative API key required for recovery preflight."
	fi
	if [ "$UPGRADE_PHASE" != "held" ]; then
		case "${STALWART_UPDATE_ROLE_PERMISSIONS:-false}" in false|0|"") ;; *) die "Role permission updates are restricted to held startup." ;; esac
	fi
	python3 - "$UPGRADE_HELPER" <<'PY_CHECK'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("upgrade", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    module.require(module.local_version("/usr/local/bin/stalwart") == "1.1.0", "wrong-server-binary")
    module.require(module.store_identity("/etc/stalwart/config.json") == os.environ["STALWART_APPROVED_STORE_ID"], "wrong-approved-store")
except (module.Refusal, OSError, KeyError):
    sys.exit("Image/store identity approval failed; refusing startup.")
PY_CHECK
}

start_recovery() {
	port_listening "$STALWART_HTTP_PORT" && die "Recovery port is already occupied; refusing ambiguous management."
	log info "Starting isolated recovery management before ordinary workers."
	STALWART_RECOVERY_MODE=true STALWART_RECOVERY_MODE_PORT=8080 STALWART_UPDATE_ROLE_PERMISSIONS=false \
		setpriv --reuid=stalwart --regid=stalwart --init-groups -- /usr/local/bin/stalwart --config /etc/stalwart/config.json >/dev/null 2>&1 &
	STALWART_PID=$!
	i=0
	while [ "$i" -lt "${STALWART_RECOVERY_TIMEOUT_SECONDS:-60}" ]; do
		kill -0 "$STALWART_PID" 2>/dev/null || die "Recovery process exited before authenticated management."
		if STALWART_UPGRADE_PHASE="$UPGRADE_PHASE" python3 - "$UPGRADE_HELPER" <<'PY_PROBE'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("upgrade", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    module.Client("http://127.0.0.1:8080", module.authorization(), timeout=2, deadline=3).call("x:Account/query", {"limit": 1})
except (module.Refusal, OSError):
    sys.exit(1)
PY_PROBE
		then
			kill -0 "$STALWART_PID" 2>/dev/null || die "Recovery child exited during authentication."
			return 0
		fi
		i=$((i + 1))
		sleep 1
	done
	die "Authenticated recovery management timed out."
}

stop_recovery() {
	kill "$STALWART_PID" 2>/dev/null || die "Recovery child was lost."
	i=0
	while kill -0 "$STALWART_PID" 2>/dev/null; do
		[ "$i" -lt 20 ] || die "Recovery child did not exit; normal startup forbidden."
		i=$((i + 1))
		sleep 1
	done
	wait "$STALWART_PID" 2>/dev/null || true
	STALWART_PID=""
	port_listening "$STALWART_HTTP_PORT" && die "Recovery port is still occupied; normal startup forbidden."
	return 0
}

render_service_allowlist() {
	[ -n "${STALWART_SERVICE_ALLOWLIST_JSON:-}" ] || die "Store-bound service account allowlist is required."
	python3 - "$UPGRADE_HELPER" <<'PY_ALLOWLIST'
import importlib.util, json, os, sys
spec = importlib.util.spec_from_file_location("upgrade", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    value = module.decode(os.environ["STALWART_SERVICE_ALLOWLIST_JSON"])
    module.validate_allowlist(value, os.environ["STALWART_APPROVED_STORE_ID"])
    path = os.environ.get("STALWART_SERVICE_ALLOWLIST", "/etc/stalwart/service-allowlist.json")
    with open(path + ".tmp", "w", encoding="utf-8", opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
        json.dump(value, output)
    os.replace(path + ".tmp", path)
except (module.Refusal, OSError, KeyError):
    sys.exit("Invalid store-bound service account allowlist.")
PY_ALLOWLIST
}

verify_current_policy() {
	python3 "$UPGRADE_HELPER" verify-current --url "http://127.0.0.1:${STALWART_HTTP_PORT}" \
		--service-allowlist "${STALWART_SERVICE_ALLOWLIST:-/etc/stalwart/service-allowlist.json}" \
		|| die "Current encryption policy verification failed; ordinary workers remain stopped."
}

supervise_prepare() {
	MANAGEMENT_URL="http://127.0.0.1:${STALWART_HTTP_PORT}"
	mark_health_ready
	log info "Prepare remains isolated; explicitly stop this deployment before held startup."
	while kill -0 "$STALWART_PID" 2>/dev/null && kill -0 "$HEALTH_PID" 2>/dev/null; do sleep 2; done
	die "Prepare supervisor lost a child."
}

# --- main ---

[ -n "$PGHOST" ] && [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] || die "Missing PostgreSQL credentials."

[ -n "${FRPS_ADDR:-}" ] && [ -n "${FRPC_TOKEN:-}" ] || die "FRPS_ADDR and FRPC_TOKEN are required."
[ -n "${FRPC_RELAY_STCP_KEY:-}" ] || die "FRPC_RELAY_STCP_KEY is required for the outbound relay tunnel."
STALWART_GATE_KEY="${STALWART_GATE_KEY:-}"
[ "${#STALWART_GATE_KEY}" -ge 32 ] || die "STALWART_GATE_KEY (32+ characters) is required for the backend gate."
[ -n "${STALWART_REDIS_URL:-}" ] || die "STALWART_REDIS_URL is required for coordinated deployment overlap."
[ -n "${STALWART_WEBHOOK_SECRET:-}" ] || die "STALWART_WEBHOOK_SECRET is required to sign the mail-ingest webhook."
STALWART_GATE_KEY_SHA256="$(printf '%s' "$STALWART_GATE_KEY" | sha256sum | cut -d' ' -f1)"
unset STALWART_GATE_KEY
STALWART_HELD_MODE=false
[ "$UPGRADE_PHASE" != "held" ] || STALWART_HELD_MODE=true
export STALWART_HELD_MODE STALWART_GATE_KEY_SHA256 STALWART_GATE_PORT STALWART_HTTP_PORT STALWART_PUBLIC_PORT
trap cleanup EXIT
trap 'exit 0' TERM INT

write_store_config
validate_upgrade_configuration
export UPGRADE_PHASE
MANAGEMENT_URL="http://127.0.0.1:${STALWART_HTTP_PORT}"
export MANAGEMENT_URL
start_health_server
start_recovery
if [ "$UPGRADE_PHASE" = "prepare" ]; then
	supervise_prepare
fi
render_service_allowlist
apply_stalwart_plan recovery
verify_stalwart_cluster "http://127.0.0.1:${STALWART_HTTP_PORT}"
verify_current_policy
stop_recovery
unset STALWART_RECOVERY_ADMIN STALWART_RECOVERY_MODE STALWART_RECOVERY_MODE_PORT
start_stalwart
MANAGEMENT_URL="$(stalwart_management_url)"
start_gate
if [ "$UPGRADE_PHASE" = "ordinary" ]; then
	update_relay_route || die "Relay route update failed; refusing to open health gate."
	start_frpc
fi
mark_health_ready

HEALTH_TARGET=ready
[ "$UPGRADE_PHASE" != "held" ] || HEALTH_TARGET=held
i=0
while [ "$i" -lt 30 ]; do
	if curl -fsS --max-time 1 "http://127.0.0.1:${HEALTH_PORT}/healthz/${HEALTH_TARGET}" >/dev/null 2>&1; then
		break
	fi
	i=$((i + 1))
	sleep 1
done
[ "$i" -lt 30 ] || die "Health gate did not return 200 after readiness."

log info "Running (phase ${UPGRADE_PHASE}; health :${HEALTH_PORT}/healthz/${HEALTH_TARGET}; Stalwart :${STALWART_HTTP_PORT})."

while :; do
	if ! kill -0 "$STALWART_PID" 2>/dev/null; then
		write_health_state false
		wait "$STALWART_PID" 2>/dev/null || true
		die "Stalwart exited."
	fi
	if ! kill -0 "$HEALTH_PID" 2>/dev/null; then
		die "Health listener exited."
	fi
	if [ "$UPGRADE_PHASE" = "ordinary" ] && ! kill -0 "$FRPC_PID" 2>/dev/null; then
		die "frpc exited."
	fi
	if ! kill -0 "$GATE_PID" 2>/dev/null; then
		die "Backend gate exited."
	fi
	sleep 5
done
