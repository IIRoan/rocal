# The Rust API server; build with the repository root as the context.
FROM docker.io/library/rust:1.98.1-slim-bookworm@sha256:ff521445a372125ed4f76e1453a1f8098f2d05332d1601d30db1c1f62757e730 AS build
# webauthn-rs-core links OpenSSL, and jemalloc builds with make.
RUN apt-get update \
 && apt-get install -y --no-install-recommends pkg-config libssl-dev make \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY xtask xtask
# Telemetry compiles in the redaction keys shared with the TypeScript apps.
COPY packages/calendar-core/src/redaction-policy.js packages/calendar-core/src/redaction-policy.js
ENV RUSTFLAGS="-C target-cpu=x86-64-v3"
RUN cargo build --release --locked -p solace-server \
 && cp target/release/solace-server /solace-server

FROM docker.io/library/debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libssl3 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home solace
COPY --from=build /solace-server /usr/local/bin/solace-server
USER solace
CMD ["solace-server"]
