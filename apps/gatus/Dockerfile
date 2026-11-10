# Build Gatus with 90-day period uptime support (upstream PR #1651; CarmJos fork).
FROM cgr.dev/chainguard/go:latest@sha256:135d3f59bd1ad5093d831f430bd29f31e753aac2fe9d88c08e849bb3f019aa03 AS gatus-builder

ENV GOTOOLCHAIN=auto
ARG GATUS_COMMIT=25e3e6fadba5a2fdbda99f24a6738025412defc2
WORKDIR /src
RUN git init \
    && git remote add origin https://github.com/CarmJos/gatus.git \
    && git fetch --depth 1 origin "$GATUS_COMMIT" \
    && git checkout FETCH_HEAD
COPY security-dependencies.patch /tmp/security-dependencies.patch
RUN git apply /tmp/security-dependencies.patch
COPY ssh-known-hosts.patch /tmp/ssh-known-hosts.patch
RUN git apply /tmp/ssh-known-hosts.patch
COPY ssh-known-hosts_test.go client/solace_ssh_test.go
RUN go test ./client -run '^TestSolaceSSH' -count=1
COPY discord-field-limit.patch /tmp/discord-field-limit.patch
RUN git apply /tmp/discord-field-limit.patch
COPY discord-field-limit_test.go alerting/provider/discord/solace_field_limit_test.go
RUN go test ./alerting/provider/discord -count=1
COPY uptime-hourly-retention.patch /tmp/uptime-hourly-retention.patch
RUN git apply /tmp/uptime-hourly-retention.patch
COPY uptime-hourly-retention_test.go storage/store/sql/solace_uptime_test.go
RUN go test ./storage/store/sql -run '^TestSolace' -count=1
COPY assets/solace-logo.png web/static/solace-logo.png
COPY assets/favicon.ico web/static/favicon.ico
COPY assets/favicon-32x32.png web/static/favicon-32x32.png
RUN CGO_ENABLED=0 GOOS=linux go build -mod=readonly -ldflags="-s -w" -o /gatus .

FROM cgr.dev/chainguard/wolfi-base:latest@sha256:d13acb327aa77acf2752acea8c08456511a5b8142455cc2fe0f966b960bf64c6

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates apache2-utils tzdata wget python3 su-exec \
    && addgroup -S -g 10001 gatus && adduser -S -D -H -u 10001 -G gatus gatus \
    && mkdir -p /etc/gatus /data \
    && rm -rf /var/cache/apk/*

COPY --from=gatus-builder /gatus /usr/local/bin/gatus
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY stalwart-discord-bridge.py status.html /usr/local/lib/solace/
COPY config.default.yaml /etc/gatus/config.default.yaml

RUN chmod 755 /usr/local/bin/entrypoint.sh /usr/local/bin/gatus \
    && chmod 644 /usr/local/lib/solace/* /etc/gatus/config.default.yaml

ENV GATUS_CONFIG_PATH=/data/config.yaml
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD wget -q -O - "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["/usr/local/bin/entrypoint.sh"]
