# Test-only Stalwart for the Rust rewrite test environment: no frp tunnels, no outbound delivery, test secrets only.
FROM stalwartlabs/stalwart:v1.1.0@sha256:f772aa6ef8cd8018969fa491640f1436b0270eb14e2c219b5f37f1a77020837e

ARG STALWART_CLI_VERSION=1.0.14

USER root

COPY scripts/install-stalwart.sh /tmp/install-stalwart.sh
RUN sh /tmp/install-stalwart.sh && rm /tmp/install-stalwart.sh

RUN apt-get update \
    && apt-get install -yq --no-install-recommends curl haproxy python3 xz-utils \
    && curl -fsSL "https://github.com/stalwartlabs/cli/releases/download/v${STALWART_CLI_VERSION}/stalwart-cli-x86_64-unknown-linux-gnu.tar.xz" \
        | tar xJ -C /tmp \
    && mv /tmp/stalwart-cli-x86_64-unknown-linux-gnu/stalwart-cli /usr/local/bin/stalwart-cli \
    && rm -rf /tmp/stalwart-cli-x86_64-unknown-linux-gnu /var/lib/apt/lists/* \
    && mkdir -p /etc/stalwart /var/lib/stalwart /usr/local/share/stalwart \
    && chown -R stalwart:stalwart /etc/stalwart /var/lib/stalwart /usr/local/share/stalwart

COPY --chown=stalwart:stalwart backend-gate.cfg /usr/local/share/stalwart/backend-gate.cfg
COPY --chown=stalwart:stalwart admin-gate.lua /usr/local/share/stalwart/admin-gate.lua
ENV STALWART_GATE_LUA_PATH=/usr/local/share/stalwart/admin-gate.lua
COPY stalwart/plan/16-provisioner-role.ndjson /usr/local/share/stalwart/16-provisioner-role.ndjson
COPY test-env/plan.ndjson /usr/local/share/stalwart/test-plan.ndjson
COPY test-env/entrypoint.sh /usr/local/bin/test-entrypoint.sh
RUN chmod 755 /usr/local/bin/test-entrypoint.sh

EXPOSE 8080 8081 8082

ENTRYPOINT ["/usr/local/bin/test-entrypoint.sh"]
