#!/bin/sh
# Test-only Stalwart boot: store config, Stalwart, test plan, optional backend gate; refuses anything that is not a test secret.
set -eu

export HOME="${HOME:-/tmp}"
STALWART_HTTP_PORT="${STALWART_HTTP_PORT:-8080}"
STALWART_GATE_PORT="${STALWART_GATE_PORT:-8081}"

log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >&2; }
die() { log error "$1"; exit 1; }

require_test_secret() {
	eval "value=\${$1:-}"
	case "$value" in
		solace-test-*) ;;
		*) die "$1 must be set to a test secret (solace-test-...)." ;;
	esac
}

require_test_secret SOLACE_TEST_ADMIN_PASSWORD
require_test_secret SOLACE_TEST_PROVISIONER_PASSWORD
require_test_secret SOLACE_TEST_NOREPLY_PASSWORD
export STALWART_RECOVERY_ADMIN="admin:${SOLACE_TEST_ADMIN_PASSWORD}"

if [ -n "${PGHOST:-}" ]; then
	require_test_secret PGPASSWORD
	cat > /etc/stalwart/config.json <<EOF
{"@type":"PostgreSql","host":"${PGHOST}","port":${PGPORT:-5432},"database":"${PGDATABASE:-stalwart}","authUsername":"${PGUSER:-postgres}","authSecret":{"@type":"EnvironmentVariable","variableName":"PGPASSWORD"},"useTls":false,"allowInvalidCerts":false,"poolMaxConnections":8}
EOF
else
	echo '{"@type":"RocksDb","path":"/var/lib/stalwart/data"}' > /etc/stalwart/config.json
fi
chown -R stalwart:stalwart /etc/stalwart /var/lib/stalwart

start_stalwart() {
	runuser -u stalwart -- /usr/local/bin/stalwart --config /etc/stalwart/config.json &
	STALWART_PID=$!
	i=0
	until curl -fsS --max-time 2 -u "${STALWART_RECOVERY_ADMIN}" "${ADMIN_URL}/jmap/session" >/dev/null 2>&1; do
		i=$((i + 1))
		[ "$i" -lt 60 ] || die "Stalwart JMAP did not come up."
		sleep 1
	done
}
trap 'kill "${STALWART_PID:-}" ${GATE_PID:-} 2>/dev/null || true' EXIT
trap 'exit 0' TERM INT

# Admin calls use the container address: loopback needs PROXY v2 once the gate plan trusts it.
ADMIN_HOST="$(hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -v '^127\.' | head -n 1)"
[ -n "$ADMIN_HOST" ] || ADMIN_HOST="[$(hostname -I | tr ' ' '\n' | grep ':' | grep -v '^fe80' | head -n 1)]"
ADMIN_URL="http://${ADMIN_HOST}:${STALWART_HTTP_PORT}"
start_stalwart

# Mailbox provisioning also needs the User role (to grant it) and impersonate (keys, settings).
SOLACE_TEST_USER_ROLE_ID="$(curl -fsS -u "${STALWART_RECOVERY_ADMIN}" -H 'Content-Type: application/json' "${ADMIN_URL}/jmap/" \
	-d '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:Role/query",{},"q"],["x:Role/get",{"#ids":{"resultOf":"q","name":"x:Role/query","path":"/ids"},"properties":["id","description"]},"g"]]}' \
	| python3 -c 'import json,sys; print(next(r["id"] for r in json.load(sys.stdin)["methodResponses"][1][1]["list"] if r["description"] == "User"))')" \
	|| die "Built-in User role not found."
export SOLACE_TEST_USER_ROLE_ID

PLAN="$(mktemp)"
GATE_PLAN=""
# The gate reaches Stalwart over loopback with PROXY v2, as in production; without a gate loopback stays plain HTTP.
[ -z "${STALWART_GATE_KEY:-}" ] || GATE_PLAN='{"@type":"update","object":"SystemSettings","value":{"proxyTrustedNetworks":{"127.0.0.0/8":true}}}'
{ cat /usr/local/share/stalwart/16-provisioner-role.ndjson /usr/local/share/stalwart/test-plan.ndjson; [ -z "$GATE_PLAN" ] || echo "$GATE_PLAN"; } \
	| python3 -c 'import os,sys; sys.stdout.write(os.path.expandvars(sys.stdin.read()))' > "$PLAN"
stalwart-cli --url "$ADMIN_URL" --user admin --password "$SOLACE_TEST_ADMIN_PASSWORD" apply --file "$PLAN" --quiet \
	|| die "Test plan apply failed."
rm -f "$PLAN"
log info "Test plan applied."

# Listeners pick up PROXY trust on start, so restart after applying the plan.
kill "$STALWART_PID" && wait "$STALWART_PID" 2>/dev/null || true
start_stalwart

if [ -n "${STALWART_GATE_KEY:-}" ]; then
	require_test_secret STALWART_GATE_KEY
	STALWART_GATE_KEY_SHA256="$(printf '%s' "$STALWART_GATE_KEY" | sha256sum | cut -d' ' -f1)"
	unset STALWART_GATE_KEY
	export STALWART_GATE_KEY_SHA256 STALWART_GATE_PORT STALWART_HTTP_PORT
	runuser -u stalwart -- haproxy -db -f /usr/local/share/stalwart/backend-gate.cfg &
	GATE_PID=$!
	log info "Backend gate on :${STALWART_GATE_PORT}."
fi

wait "$STALWART_PID"
