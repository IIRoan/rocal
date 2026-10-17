#!/usr/bin/env bash
# Smoke-test reminder email (Stalwart JMAP) and lock-screen APNs for one account.
# Usage: ./scripts/send-test-notify.sh [email]
set -euo pipefail
cd "$(dirname "$0")/.."
recipient="${1:-testingproduction15@solace.onl}"
exec cargo run -q -p solace-notifications -- --test --test-push --test-to "$recipient"
