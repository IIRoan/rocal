FROM cgr.dev/chainguard/go:latest@sha256:135d3f59bd1ad5093d831f430bd29f31e753aac2fe9d88c08e849bb3f019aa03 AS frpc-builder

ARG FRPC_COMMIT=bafec21abce5f91ae4a05b4bd19c55543c263128
WORKDIR /src
RUN git init && git remote add origin https://github.com/fatedier/frp.git \
    && git fetch --depth 1 origin "$FRPC_COMMIT" && git checkout FETCH_HEAD
COPY frpc-security.patch /tmp/frpc-security.patch
RUN git apply /tmp/frpc-security.patch \
    && CGO_ENABLED=0 GOOS=linux go build -mod=readonly -trimpath -tags=frpc,noweb -ldflags="-s -w" -o /frpc ./cmd/frpc

FROM stalwartlabs/stalwart:v1.1.0@sha256:f772aa6ef8cd8018969fa491640f1436b0270eb14e2c219b5f37f1a77020837e

ARG STALWART_CLI_VERSION=1.0.14
ARG BUILD_TIMESTAMP=2026-11-10-v1.1.0

USER root

COPY scripts/install-stalwart.sh /tmp/install-stalwart.sh
RUN sh /tmp/install-stalwart.sh && rm /tmp/install-stalwart.sh

RUN apt-get -o Acquire::Retries=0 update \
    && apt-get -o Acquire::Retries=0 upgrade -yq \
    && apt-get install -yq --no-install-recommends curl haproxy iproute2 postgresql-client python3 util-linux xz-utils \
    && curl -fsSL "https://github.com/stalwartlabs/cli/releases/download/v${STALWART_CLI_VERSION}/stalwart-cli-x86_64-unknown-linux-gnu.tar.xz" \
        | tar xJ -C /tmp \
    && mv /tmp/stalwart-cli-x86_64-unknown-linux-gnu/stalwart-cli /usr/local/bin/stalwart-cli \
    && rm -rf /tmp/stalwart-cli-x86_64-unknown-linux-gnu \
    && chmod 755 /usr/local/bin/stalwart-cli \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/log/stalwart /etc/stalwart /usr/local/share/stalwart \
    && chown -R stalwart:stalwart /var/log/stalwart /etc/stalwart /usr/local/share/stalwart

COPY --from=frpc-builder --chmod=755 /frpc /usr/local/bin/frpc

COPY scripts/upgrade-1.1.0.py /usr/local/bin/upgrade-1.1.0.py
COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
COPY backend-gate.cfg /usr/local/share/stalwart/backend-gate.cfg
COPY admin-gate.lua /usr/local/share/stalwart/admin-gate.lua
ENV STALWART_GATE_LUA_PATH=/usr/local/share/stalwart/admin-gate.lua
COPY stalwart/plan /usr/local/share/stalwart/plan
COPY stalwart/cli-schema.json /usr/local/share/stalwart/cli-schema.json
COPY stalwart/cli-schema.latest /usr/local/share/stalwart/cli-schema.latest
RUN sed -i 's/\r$//' /usr/local/bin/railway-entrypoint.sh \
    && chmod 755 /usr/local/bin/railway-entrypoint.sh \
    && chown stalwart:stalwart /usr/local/bin/railway-entrypoint.sh \
    && chown -R stalwart:stalwart /usr/local/share/stalwart \
    && STALWART_GATE_PORT=8081 STALWART_PUBLIC_PORT=8082 STALWART_HTTP_PORT=8080 STALWART_GATE_KEY_SHA256=0 \
        haproxy -c -q -f /usr/local/share/stalwart/backend-gate.cfg

USER root

# The binary's network capability disables jemalloc environment configuration; eight arenas match the CPU quota, not the 48 host CPUs.
RUN ln -sfn 'background_thread:true,narenas:8' /etc/malloc.conf

EXPOSE 25 8080 8081 8082 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
    CMD case "${STALWART_UPGRADE_PHASE:-ordinary}" in prepare) health_target=maintenance ;; held) health_target=held ;; *) health_target=ready ;; esac; \
        curl -fsS --max-time 3 "http://127.0.0.1:${PORT:-8090}/healthz/${health_target}" > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]
