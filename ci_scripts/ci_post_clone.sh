#!/bin/sh
# Xcode Cloud: ios/Pods and node_modules are not in git — generate them before xcodebuild.
# See: https://developer.apple.com/documentation/xcode/writing-custom-build-scripts

set -e

ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "ci_post_clone: installing Node via Homebrew (not on PATH)"
  brew install node
fi

echo "ci_post_clone: node $(node --version)"

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

cd ios

export NODE_BINARY="${NODE_BINARY:-$(command -v node)}"
echo "ci_post_clone: NODE_BINARY=$NODE_BINARY"

if [ -f ../Gemfile ]; then
  cd ..
  bundle install
  cd ios
  bundle exec pod install
else
  pod install
fi

echo "ci_post_clone: done"
