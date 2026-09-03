# Build Gatus with 90-day period uptime support (upstream PR #1651; CarmJos fork).
FROM golang:1.25-alpine AS gatus-builder

ENV GOTOOLCHAIN=auto
ARG GATUS_COMMIT=25e3e6fadba5a2fdbda99f24a6738025412defc2
RUN apk add --no-cache ca-certificates git
WORKDIR /src
RUN git init \
    && git remote add origin https://github.com/CarmJos/gatus.git \
    && git fetch --depth 1 origin "$GATUS_COMMIT" \
    && git checkout FETCH_HEAD
COPY assets/solace-logo.png web/static/solace-logo.png
COPY assets/favicon.ico web/static/favicon.ico
COPY assets/favicon-16x16.png web/static/favicon-16x16.png
COPY assets/favicon-32x32.png web/static/favicon-32x32.png
COPY assets/expand-groups.js web/static/js/expand-groups.js
# Expand Application / Mail / Stalwart Metrics / VPS by default (before Vue boots).
RUN sed -i 's|<script defer="defer" src="/js/app.js"></script>|<script defer="defer" src="/js/expand-groups.js"></script><script defer="defer" src="/js/app.js"></script>|' web/static/index.html
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /gatus .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates apache2-utils tzdata wget python3 \
    && mkdir -p /etc/gatus /data \
    && rm -rf /var/cache/apk/*

COPY --from=gatus-builder /gatus /usr/local/bin/gatus
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY stalwart-discord-bridge.py /usr/local/bin/stalwart-discord-bridge.py
COPY config.default.yaml /etc/gatus/config.default.yaml
COPY theme.css /etc/gatus/theme.css

RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/gatus \
    && chmod 644 /usr/local/bin/stalwart-discord-bridge.py

ENV GATUS_CONFIG_PATH=/data/config.yaml
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD wget -q -O - "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["/usr/local/bin/entrypoint.sh"]
