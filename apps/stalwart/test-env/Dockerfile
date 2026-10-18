# Test-only Stalwart for the Rust rewrite test environment: no frp tunnels, no outbound delivery, test secrets only.
FROM stalwartlabs/stalwart:v0.16.21

ARG STALWART_CLI_VERSION=1.0.12

USER root

RUN apt-get update \
    && apt-get install -yq --no-install-recommends curl haproxy python3 xz-utils \
    && curl -fsSL "https://github.com/stalwartlabs/cli/releases/download/v${STALWART_CLI_VERSION}/stalwart-cli-x86_64-unknown-linux-gnu.tar.xz" \
        | tar xJ -C /tmp \
    && mv /tmp/stalwart-cli-x86_64-unknown-linux-gnu/stalwart-cli /usr/local/bin/stalwart-cli \
    && rm -rf /tmp/stalwart-cli-x86_64-unknown-linux-gnu /var/lib/apt/lists/* \
    && mkdir -p /etc/stalwart /var/lib/stalwart /usr/local/share/stalwart \
    && chown -R stalwart:stalwart /etc/stalwart /var/lib/stalwart /usr/local/share/stalwart

COPY backend-gate.cfg /usr/local/share/stalwart/backend-gate.cfg
COPY stalwart/plan/16-provisioner-role.ndjson /usr/local/share/stalwart/16-provisioner-role.ndjson
COPY test-env/plan.ndjson /usr/local/share/stalwart/test-plan.ndjson
COPY test-env/entrypoint.sh /usr/local/bin/test-entrypoint.sh
RUN chmod 755 /usr/local/bin/test-entrypoint.sh

EXPOSE 8080 8081

ENTRYPOINT ["/usr/local/bin/test-entrypoint.sh"]
