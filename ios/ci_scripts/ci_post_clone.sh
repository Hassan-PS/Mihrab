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

# Keep Homebrew quiet/fast in CI (no slow auto-update churn before `brew install`).
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

# Retry a command a few times. Xcode Cloud intermittently hits transient
# DNS/TCP failures on network steps — most notably the React Native
# `hermes-engine` podspec, which resolves the prebuilt Hermes artifact from
# Maven Central (central.sonatype.com) while `pod install` evaluates it. A
# short retry rides out those blips instead of failing the whole build.
retry() {
  attempt=1
  max=4
  while true; do
    if "$@"; then
      return 0
    fi
    if [ "${attempt}" -ge "${max}" ]; then
      echo "ci_post_clone: '$*' failed after ${max} attempts" >&2
      return 1
    fi
    echo "ci_post_clone: '$*' failed (attempt ${attempt}/${max}); retrying in 15s…" >&2
    attempt=$((attempt + 1))
    sleep 15
  done
}

if ! command -v node >/dev/null 2>&1; then
  echo "ci_post_clone: installing Node via Homebrew (not on PATH)"
  retry brew install node
fi

echo "ci_post_clone: ROOT=${ROOT} IOS=${IOS}"
echo "ci_post_clone: node $(node --version)"

if [ -f package-lock.json ]; then
  retry npm ci
else
  retry npm install
fi

cd "${IOS}"
export NODE_BINARY="${NODE_BINARY:-$(command -v node)}"
echo "ci_post_clone: NODE_BINARY=$NODE_BINARY"

pod_install() {
  if command -v pod >/dev/null 2>&1; then
    echo "ci_post_clone: running pod install (system pod)"
    pod install
  else
    echo "ci_post_clone: pod not on PATH, using bundle exec"
    ( cd "${ROOT}" && bundle install ) && bundle exec pod install
  fi
}
retry pod_install

echo "ci_post_clone: done"
