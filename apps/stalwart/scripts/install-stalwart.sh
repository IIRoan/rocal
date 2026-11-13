#!/bin/sh
set -eu

upstream_version="$(/usr/local/bin/stalwart --version)"
stalwart_download="$(mktemp)"
trap 'rm -f "$stalwart_download"' EXIT

curl -fsSL --retry 3 --max-time 180 \
    -o "$stalwart_download" \
    https://github.com/IIRoan/rocal/releases/download/stalwart-v1.1.0-solace.1/stalwart-x86_64-linux-gnu
printf '28807a1b3caf08d1d6805d61dcc05fe5638747aa85782ccb9e57912b9fc91910  %s\n' "$stalwart_download" | sha256sum -c -
install -m755 "$stalwart_download" /usr/local/bin/stalwart
test "$(/usr/local/bin/stalwart --version)" = "$upstream_version"
setcap 'cap_net_bind_service=+ep' /usr/local/bin/stalwart
