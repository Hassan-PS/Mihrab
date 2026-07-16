#!/bin/bash
# Build the Mac Catalyst .app and zip it for GitHub-release / Homebrew
# distribution (Path B — docs/release/path-a-ipad-mac.md covers Path A).
#
# Usage:
#   ./scripts/build-catalyst.sh                       # ad-hoc signed
#   SIGN_IDENTITY="Developer ID Application: …" \
#     ./scripts/build-catalyst.sh                     # distributable
#
# Ad-hoc builds run locally (right-click → Open past Gatekeeper) but are
# NOT notarized; for the brew cask users' first-run UX, sign with a
# Developer ID identity and notarize:
#   xcrun notarytool submit <zip> --keychain-profile mihrab --wait
#   xcrun stapler staple <app>
# then re-zip. The cask works either way; notarization only affects
# Gatekeeper friction.
#
# Output: ios/build/catalyst-dist/Mihrab-macOS-<version>.zip (+ sha256).
set -euo pipefail
cd "$(dirname "$0")/.."

SIGN_IDENTITY="${SIGN_IDENTITY:--}"
VERSION=$(sed -n 's/.*MARKETING_VERSION = \([0-9.]*\);.*/\1/p' ios/PrayerApp.xcodeproj/project.pbxproj | head -1)
DIST=ios/build/catalyst-dist
APP="$DIST/Mihrab.app"
ZIP="$DIST/Mihrab-macOS-$VERSION.zip"

echo "▸ Preparing pods with Catalyst support (MIHRAB_CATALYST=1)…"
# Catalyst pod settings are opt-in: enabling them globally broke the
# plain iOS device archive on Xcode Cloud (hermes-engine framework
# layout). This regenerates the Pods project with Catalyst on; the next
# plain `pod install` (or Xcode Cloud's clean checkout) reverts it.
(cd ios && MIHRAB_CATALYST=1 pod install --silent)

echo "▸ Building Mihrab $VERSION for Mac Catalyst (Release)…"
# Build UNSIGNED (a global signing override would also apply to the
# iOS-only widget target and trip its provisioning check), then sign
# the copied bundle below. Entitlements are intentionally absent in
# this channel — App Groups / Keychain groups need a real certificate;
# the app degrades gracefully (no widgets on Mac anyway; secure
# storage falls back to AsyncStorage).
xcodebuild \
  -workspace ios/PrayerApp.xcworkspace \
  -scheme PrayerApp \
  -configuration Release \
  -destination 'platform=macOS,variant=Mac Catalyst,arch=arm64' \
  -derivedDataPath ios/build/catalyst-release \
  CODE_SIGNING_ALLOWED=NO \
  -quiet build

rm -rf "$DIST" && mkdir -p "$DIST"
# ditto (not cp -R): preserves framework symlink structure — cp mangles
# it and codesign then rejects the bundle as "ambiguous".
ditto ios/build/catalyst-release/Build/Products/Release-maccatalyst/PrayerApp.app "$APP"

echo "▸ Signing ($SIGN_IDENTITY)…"
# Hardened runtime ONLY with a real identity: its library validation
# requires all frameworks to share the app's Team ID, which ad-hoc
# signatures don't have — the app then dies at launch with a dyld
# "Library not loaded: hermesvm" (seen 2026-07-16). Notarization needs
# the hardened runtime, so Developer ID builds keep it.
RUNTIME_OPTS=()
if [ "$SIGN_IDENTITY" != "-" ]; then
  RUNTIME_OPTS=(--options runtime)
fi
# hermesvm.framework ships with a proper Versions/ tree PLUS a stray
# real binary at the framework root — codesign then can't classify the
# bundle ("ambiguous"). Replace the stray copy with the canonical
# symlink, then sign inside-out (frameworks → app).
HERMES="$APP/Contents/Frameworks/hermesvm.framework"
if [ -f "$HERMES/hermesvm" ] && [ ! -L "$HERMES/hermesvm" ] && [ -d "$HERMES/Versions" ]; then
  rm "$HERMES/hermesvm"
  ln -s Versions/Current/hermesvm "$HERMES/hermesvm"
fi
find "$APP/Contents/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.dylib' \) -print0 2>/dev/null |
  while IFS= read -r -d '' fw; do
    codesign --force "${RUNTIME_OPTS[@]+"${RUNTIME_OPTS[@]}"}" -s "$SIGN_IDENTITY" "$fw"
  done
codesign --force "${RUNTIME_OPTS[@]+"${RUNTIME_OPTS[@]}"}" -s "$SIGN_IDENTITY" "$APP"
codesign --verify --strict "$APP" && echo "▸ Signature verifies ($SIGN_IDENTITY)."

echo "▸ Zipping…"
ditto -c -k --keepParent "$APP" "$ZIP"
shasum -a 256 "$ZIP" | tee "$ZIP.sha256"
echo "▸ Done: $ZIP"
