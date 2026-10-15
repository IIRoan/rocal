# The API suite as a one-off Railway service, so it reaches the backend over the private network instead of the edge that sets every client's address.
FROM docker.io/library/rust:1.98.1-slim-bookworm@sha256:ff521445a372125ed4f76e1453a1f8098f2d05332d1601d30db1c1f62757e730
RUN apt-get update \
 && apt-get install -y --no-install-recommends pkg-config libssl-dev make \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY xtask xtask
COPY packages/calendar-core/src/redaction-policy.js packages/calendar-core/src/redaction-policy.js
# Fixtures are read from the source tree at run time, so the suite runs where it was built.
RUN cargo test --locked -p solace-api-tests --test api --no-run
CMD ["cargo", "test", "--locked", "-p", "solace-api-tests", "--test", "api", "--", "--test-threads", "8"]
