#!/bin/bash
set -e

echo "Installing web app dependencies..."
cd apps/web
bun install --frozen-lockfile

echo "Building web app..."
bun run build

echo "Build complete!"
