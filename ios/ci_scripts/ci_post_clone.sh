#!/bin/sh
# Xcode Cloud: ios/Pods and node_modules are not in git — generate them before xcodebuild.
#
# Apple requires ci_scripts next to the .xcodeproj/.xcworkspace (see "Writing custom build scripts").
# This repo keeps the workspace under ios/, so ci_scripts lives at ios/ci_scripts/.

set -e

if [ -n "${CI_PRIMARY_REPOSITORY_PATH}" ]; then
  ROOT="${CI_PRIMARY_REPOSITORY_PATH}"
  IOS="${ROOT}/ios"
else
  IOS="$(cd "$(dirname "$0")/.." && pwd)"
  ROOT="$(cd "${IOS}/.." && pwd)"
fi

cd "${ROOT}"

if ! command -v node >/dev/null 2>&1; then
  echo "ci_post_clone: installing Node via Homebrew (not on PATH)"
  brew install node
fi

echo "ci_post_clone: ROOT=${ROOT} IOS=${IOS}"
echo "ci_post_clone: node $(node --version)"

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

cd "${IOS}"
export NODE_BINARY="${NODE_BINARY:-$(command -v node)}"
echo "ci_post_clone: NODE_BINARY=$NODE_BINARY"

if command -v pod >/dev/null 2>&1; then
  echo "ci_post_clone: running pod install (system pod)"
  pod install
else
  echo "ci_post_clone: pod not on PATH, using bundle exec"
  cd "${ROOT}"
  bundle install
  cd "${IOS}"
  bundle exec pod install
fi

echo "ci_post_clone: done"
