#!/bin/sh
# Last chance before xcodebuild: ensure RN + CocoaPods outputs exist on Xcode Cloud.

set -e

if [ -n "${CI_PRIMARY_REPOSITORY_PATH}" ]; then
  ROOT="${CI_PRIMARY_REPOSITORY_PATH}"
  IOS="${ROOT}/ios"
else
  IOS="$(cd "$(dirname "$0")/.." && pwd)"
  ROOT="$(cd "${IOS}/.." && pwd)"
fi

cd "${ROOT}"

echo "ci_pre_xcodebuild: ROOT=${ROOT} IOS=${IOS}"

if ! command -v node >/dev/null 2>&1; then
  echo "ci_pre_xcodebuild: installing Node via Homebrew"
  brew install node
fi

export NODE_BINARY="$(command -v node)"
echo "ci_pre_xcodebuild: node $($NODE_BINARY --version)"

# Xcode script phases often run with a reduced PATH; pin Node for the RN bundle step on Xcode Cloud.
if [ -n "${CI_PRIMARY_REPOSITORY_PATH}" ] && [ -n "${NODE_BINARY}" ]; then
  echo "export NODE_BINARY=${NODE_BINARY}" >"${IOS}/.xcode.env.local"
  echo "ci_pre_xcodebuild: wrote ${IOS}/.xcode.env.local"
fi

if [ ! -d node_modules ] || [ ! -f node_modules/react-native/package.json ]; then
  echo "ci_pre_xcodebuild: node_modules missing or incomplete, running npm ci"
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
fi

cd "${IOS}"
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
