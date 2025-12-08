#!/bin/bash
set -e

echo "Installing UI package dependencies..."
cd packages/ui
bun install --frozen-lockfile

echo "Installing web app dependencies..."
cd ../../apps/web
bun install --frozen-lockfile

echo "Building web app..."
bun run build

echo "Build complete!"
