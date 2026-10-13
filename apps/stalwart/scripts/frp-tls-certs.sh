#!/bin/sh
# Mints the private CA, frps server cert and frpc client cert for the mail tunnel's mutual TLS.
set -eu

out="${1:?usage: frp-tls-certs.sh <new output dir>}"
days="${FRP_TLS_DAYS:-1825}"
[ ! -e "$out" ] || { echo "refusing to reuse $out; pick a new directory" >&2; exit 1; }
mkdir -m 700 "$out"
cd "$out"
umask 077

new_key() {
	openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$1.key"
}

new_key ca
openssl req -x509 -new -key ca.key -sha256 -days "$days" -subj "/CN=Solace frp CA" \
	-addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign -out ca.crt

# frpc pins this name through transport.tls.serverName, so the VPS address never has to be in the cert.
for pair in server:serverAuth client:clientAuth; do
	name="${pair%%:*}"
	new_key "$name"
	openssl req -new -key "$name.key" -subj "/CN=frp-$name" -out "$name.csr"
	printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=%s\nsubjectAltName=DNS:frps.solace\n' \
		"${pair#*:}" >"$name.ext"
	openssl x509 -req -in "$name.csr" -CA ca.crt -CAkey ca.key -CAcreateserial -sha256 -days "$days" \
		-extfile "$name.ext" -out "$name.crt"
	rm -f "$name.csr" "$name.ext"
done
rm -f ca.srl

for file in ca.crt server.crt server.key client.crt client.key; do
	base64 <"$file" | tr -d '\n' >"$file.b64"
done

cat <<EOF
Wrote $(pwd). Store ca.key offline (only needed to mint new certs), then delete it here.

GitHub Environment mail-vps:
  gh secret set FRP_TLS_CA --env mail-vps < ca.crt.b64
  gh secret set FRP_TLS_SERVER_CERT --env mail-vps < server.crt.b64
  gh secret set FRP_TLS_SERVER_KEY --env mail-vps < server.key.b64
  gh secret set FRP_TLS_CLIENT_CERT --env mail-vps < client.crt.b64
  gh secret set FRP_TLS_CLIENT_KEY --env mail-vps < client.key.b64

Railway stalwart-mail (FRPC_TLS_CA only after frps has the new server cert; see apps/stalwart/README.md):
  FRPC_TLS_CERT = client.crt.b64
  FRPC_TLS_KEY  = client.key.b64
  FRPC_TLS_CA   = ca.crt.b64
EOF
