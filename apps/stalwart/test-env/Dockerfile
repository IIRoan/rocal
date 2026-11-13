FROM rust:1.99.1-trixie@sha256:8a4e90c7946b74626488b1446f712c0fe0ed1a596cbd3d871684bc9c5433ae07 AS stalwart-builder

ARG CARGO_BUILD_JOBS=4

RUN apt-get update \
    && apt-get install -yq --no-install-recommends build-essential cmake libclang-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/build-stalwart.sh stalwart-subject-search.patch /build/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    sh /build/build-stalwart.sh

# Test-only Stalwart for the Rust rewrite test environment: no frp tunnels, no outbound delivery, test secrets only.
FROM stalwartlabs/stalwart:v1.1.0@sha256:f772aa6ef8cd8018969fa491640f1436b0270eb14e2c219b5f37f1a77020837e

ARG STALWART_CLI_VERSION=1.0.14

USER root

RUN /usr/local/bin/stalwart --version > /tmp/stalwart-upstream-version
COPY --from=stalwart-builder --chmod=755 /output/stalwart /usr/local/bin/stalwart
RUN test "$(/usr/local/bin/stalwart --version)" = "$(cat /tmp/stalwart-upstream-version)" \
    && rm /tmp/stalwart-upstream-version \
    && setcap 'cap_net_bind_service=+ep' /usr/local/bin/stalwart

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
