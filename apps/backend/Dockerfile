# The Rust API server; build with the repository root as the context.
FROM docker.io/library/rust:1.98.1-slim-bookworm@sha256:ff521445a372125ed4f76e1453a1f8098f2d05332d1601d30db1c1f62757e730 AS build
# webauthn-rs-core links OpenSSL, and jemalloc builds with make.
RUN apt-get update \
 && apt-get install -y --no-install-recommends pkg-config libssl-dev make \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps/backend apps/backend
# Every workspace member must be present for cargo to load the workspace.
COPY apps/notifications apps/notifications
COPY crates crates
COPY xtask xtask
# The ICS reader compiles in the Windows zone table shared with the on-device import.
COPY packages/calendar-ics/src/windows-zones.json packages/calendar-ics/src/windows-zones.json
ENV RUSTFLAGS="-C target-cpu=x86-64-v3"
RUN OPENSSL_STATIC=1 \
    OPENSSL_LIB_DIR="$(pkg-config --variable=libdir openssl)" \
    OPENSSL_INCLUDE_DIR="$(pkg-config --variable=includedir openssl)" \
    cargo build --release --locked -p solace-server \
 && cp target/release/solace-server /solace-server
RUN readelf -d /solace-server > /tmp/runtime-libraries \
 && ! grep -E 'NEEDED.*lib(ssl|crypto)\.so' /tmp/runtime-libraries

FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:5bb932663cff4fb276186720e0357af55c5e47f12e4d9f44ea0060fa3e7bca88
COPY --from=build /solace-server /usr/local/bin/solace-server
# jemalloc purges freed pages only on allocation unless a background thread does it, so an idle server would keep its last peak.
ENV _RJEM_MALLOC_CONF=background_thread:true
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/solace-server"]
