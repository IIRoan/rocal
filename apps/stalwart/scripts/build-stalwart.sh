#!/bin/sh
set -eu

STALWART_COMMIT=e7cde9b3fac32d2a254ef782efec56f2373ec5d4

git init /src
cd /src
git remote add origin https://github.com/stalwartlabs/stalwart.git
git fetch --depth 1 origin "$STALWART_COMMIT"
git checkout --detach FETCH_HEAD
git apply --check /build/stalwart-subject-search.patch
git apply /build/stalwart-subject-search.patch
cargo build --locked --release -p stalwart --no-default-features \
    --features 'sqlite postgres mysql rocks s3 redis keep azure nats enterprise'
install -Dm755 target/release/stalwart /output/stalwart
