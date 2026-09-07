# Solace error tracking — thin wrapper around the official errex image.
# Upstream already targets Railway (SQLite under /data/store, distroless runtime).
# Pin the digest in production if you want immutable deploys.
# https://github.com/TheHoltz/errex
FROM ghcr.io/theholtz/errex:latest

# Containers default to loopback; Railway's proxy needs all interfaces.
# See https://github.com/TheHoltz/errex/issues/14
ENV ERREX_HOST=0.0.0.0 \
    ERREX_DATA_DIR=/data/store \
    ERREX_LOG_LEVEL=info

EXPOSE 9090
