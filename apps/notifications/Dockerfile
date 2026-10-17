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
COPY packages/calendar-core/src/redaction-policy.js packages/calendar-core/src/redaction-policy.js
COPY packages/calendar-ics/src/windows-zones.json packages/calendar-ics/src/windows-zones.json
ENV RUSTFLAGS="-C target-cpu=x86-64-v3"
RUN cargo build --release --locked -p solace-notifications \
 && cp target/release/solace-notifications /solace-notifications

FROM docker.io/library/debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libssl3 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home solace
COPY --from=build /solace-notifications /usr/local/bin/solace-notifications
USER solace
CMD ["solace-notifications"]
