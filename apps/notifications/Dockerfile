# The notifications worker; build with the repository root as the context.
FROM docker.io/library/rust:1.98.1-slim-bookworm@sha256:ff521445a372125ed4f76e1453a1f8098f2d05332d1601d30db1c1f62757e730 AS build
# The API crate it reuses links OpenSSL (webauthn-rs-core), and jemalloc builds with make.
RUN apt-get update \
 && apt-get install -y --no-install-recommends pkg-config libssl-dev make \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps/backend apps/backend
COPY apps/notifications apps/notifications
COPY crates crates
COPY xtask xtask
COPY packages/calendar-ics/src/windows-zones.json packages/calendar-ics/src/windows-zones.json
ENV RUSTFLAGS="-C target-cpu=x86-64-v3"
RUN OPENSSL_STATIC=1 \
    OPENSSL_LIB_DIR="$(pkg-config --variable=libdir openssl)" \
    OPENSSL_INCLUDE_DIR="$(pkg-config --variable=includedir openssl)" \
    cargo build --release --locked -p solace-notifications \
 && cp target/release/solace-notifications /solace-notifications
RUN readelf -d /solace-notifications > /tmp/runtime-libraries \
 && ! grep -E 'NEEDED.*lib(ssl|crypto)\.so' /tmp/runtime-libraries

FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:5bb932663cff4fb276186720e0357af55c5e47f12e4d9f44ea0060fa3e7bca88
COPY --from=build /solace-notifications /usr/local/bin/solace-notifications
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/solace-notifications"]
