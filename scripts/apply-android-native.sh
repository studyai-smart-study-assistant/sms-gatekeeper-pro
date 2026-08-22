#!/usr/bin/env bash
# Copies the hand-written native SMS layer into the generated Capacitor project.
# Run after `npx cap add android` and before `npx cap sync android`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/android-native"
PKG_DIR="$ROOT/android/app/src/main/java/app/gatekeeper/smsgateway"

if [ ! -d "$ROOT/android" ]; then
  echo "android/ platform not found. Run: npx cap add android" >&2
  exit 1
fi

mkdir -p "$PKG_DIR"
cp "$SRC/SmsGatewayPlugin.java" "$SRC/SmsSender.java" "$SRC/GatewayService.java" \
   "$SRC/MainActivity.java" "$SRC/BootReceiver.java" "$PKG_DIR/"
cp "$SRC/AndroidManifest.xml" "$ROOT/android/app/src/main/AndroidManifest.xml"

# Remove any MainActivity Capacitor generated in another package path.
find "$ROOT/android/app/src/main/java" -name MainActivity.java \
  ! -path "$PKG_DIR/MainActivity.java" -delete

echo "Native SMS layer applied to android/."
