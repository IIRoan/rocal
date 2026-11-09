FROM golang:1.27.3-alpine3.24@sha256:fa3d596898d9f126af7c01d14ee7597bab3f39cccf392ef36b69fe77cd681f18 AS frpc-builder

ARG FRPC_COMMIT=bafec21abce5f91ae4a05b4bd19c55543c263128
RUN apk add --no-cache git
WORKDIR /src
RUN git init && git remote add origin https://github.com/fatedier/frp.git \
    && git fetch --depth 1 origin "$FRPC_COMMIT" && git checkout FETCH_HEAD
COPY frpc-security.patch /tmp/frpc-security.patch
RUN git apply /tmp/frpc-security.patch \
    && CGO_ENABLED=0 GOOS=linux go build -mod=readonly -trimpath -ldflags="-s -w" -o /frpc ./cmd/frpc

FROM stalwartlabs/stalwart:v1.0.0@sha256:baafeacd6cbde77acdd94af49972d41c6709e54a376df48e18a9fe3f445eb3d5

ARG STALWART_CLI_VERSION=1.0.14
ARG BUILD_TIMESTAMP=2026-10-26-v1.0.0

USER root

RUN apt-get update \
    && apt-get upgrade -yq \
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

ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]
