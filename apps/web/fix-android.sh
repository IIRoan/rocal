#!/usr/bin/env bash

set -e

echo "[setup] Starting Android SDK fix..."

# Default SDK path (Windows)
SDK_PATH="/c/Users/$USERNAME/AppData/Local/Android/Sdk"

# Convert to Windows-style path for Gradle
WIN_SDK_PATH=$(cygpath -w "$SDK_PATH" 2>/dev/null || echo "C:\\Users\\$USERNAME\\AppData\\Local\\Android\\Sdk")

PROJECT_ANDROID_DIR="./android"
LOCAL_PROPERTIES_FILE="$PROJECT_ANDROID_DIR/local.properties"

echo "[setup] Using SDK path: $WIN_SDK_PATH"

# Ensure android folder exists
if [ ! -d "$PROJECT_ANDROID_DIR" ]; then
  echo "[error] ./android directory not found. Are you in the project root?"
  exit 1
fi

# Create local.properties
echo "[setup] Writing local.properties..."
echo "sdk.dir=$(echo "$WIN_SDK_PATH" | sed 's/\\/\\\\/g')" > "$LOCAL_PROPERTIES_FILE"

echo "[setup] local.properties created at $LOCAL_PROPERTIES_FILE"
cat "$LOCAL_PROPERTIES_FILE"

# Verify Java
echo "[setup] Checking Java..."
if ! command -v java >/dev/null 2>&1; then
  echo "[error] Java not found in PATH"
  exit 1
fi
java -version

# Verify adb
echo "[setup] Checking adb..."
if ! command -v adb >/dev/null 2>&1; then
  echo "[warn] adb not found in PATH (may still work if Android Studio manages it)"
else
  adb devices
fi

echo "[setup] Done. You can now run:"
echo "bun run mobile:dev:wifi"