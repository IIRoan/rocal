#!/bin/bash
set -e

# Install all workspace dependencies
cd "$(git rev-parse --show-toplevel)"
bun install
