#!/bin/sh
# Last chance before xcodebuild: ensure RN + CocoaPods outputs exist on Xcode Cloud.
# Logs showed archive failing when Pods-PrayerApp.release.xcconfig was still missing.

set -e

ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

echo "ci_pre_xcodebuild: REPO=$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "ci_pre_xcodebuild: installing Node via Homebrew"
  brew install node
fi

export NODE_BINARY="$(command -v node)"
echo "ci_pre_xcodebuild: node $($NODE_BINARY --version) NODE_BINARY=$NODE_BINARY"

if [ ! -d node_modules ] || [ ! -f node_modules/react-native/package.json ]; then
  echo "ci_pre_xcodebuild: node_modules missing or incomplete, running npm ci"
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
fi

cd ios
RELEASE_CFG="Pods/Target Support Files/Pods-PrayerApp/Pods-PrayerApp.release.xcconfig"
if [ ! -f "$RELEASE_CFG" ]; then
  echo "ci_pre_xcodebuild: $RELEASE_CFG missing, running pod install"
  pod install
fi

if [ ! -f "$RELEASE_CFG" ]; then
  echo "ci_pre_xcodebuild: ERROR: Pods still missing after pod install"
  ls -la Pods/Target\ Support\ Files/Pods-PrayerApp/ 2>&1 || true
  exit 1
fi

echo "ci_pre_xcodebuild: ok"
