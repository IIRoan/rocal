#!/bin/sh
set -eu

cp /opt/cloudflared/usr/local/bin/cloudflared /run/tunnel/cloudflared
connector=

drain() {
    if [ -n "$connector" ]; then
        kill -TERM "$connector" 2>/dev/null || :
        wait "$connector" || :
        connector=
    fi
}

trap 'drain; exit 0' INT TERM

while :; do
    if ! timeout 1 wget -q --spider http://127.0.0.1:3000/login; then
        drain
    elif [ -z "$connector" ] || ! kill -0 "$connector" 2>/dev/null; then
        drain
        /run/tunnel/cloudflared "$@" &
        connector=$!
    fi
    sleep 1
done
