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

# Is the identity we are signing with actually inside this profile?
# Walks the profile's DeveloperCertificates and compares common names.
openssl_has_signer() {
  local profile="$1" identity="$2" tmp count i subject
  tmp=$(mktemp -d)
  security cms -D -i "$profile" > "$tmp/p.plist" 2>/dev/null || { rm -rf "$tmp"; return 1; }
  count=$(plutil -extract DeveloperCertificates raw -o - "$tmp/p.plist" 2>/dev/null || echo 0)
  for ((i = 0; i < count; i++)); do
    plutil -extract "DeveloperCertificates.$i" raw -o - "$tmp/p.plist" 2>/dev/null |
      base64 --decode > "$tmp/c.der" 2>/dev/null || continue
    subject=$(openssl x509 -inform DER -in "$tmp/c.der" -noout -subject 2>/dev/null)
    if [[ "$subject" == *"$identity"* ]]; then rm -rf "$tmp"; return 0; fi
  done
  rm -rf "$tmp"
  return 1
}
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
# widget target and trip its provisioning check), then sign the copied
# bundle below — with entitlements when there is a real identity to
# carry them, without when there isn't. An ad-hoc build still runs; it
# just gets no App Group container (so no widget data) and no Keychain
# group (so secure storage falls back to AsyncStorage).
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
#
# A Developer ID PROVISIONING PROFILE, if one has been put here, is what
# lets this build have a Keychain at all. keychain-access-groups is a
# restricted entitlement: macOS validates it against a profile embedded in
# the bundle and SIGKILLs an app that claims it without one. So the
# entitlements file is chosen by whether the profile is present, and the
# profile is copied in BEFORE codesign runs — codesign seals it, and a
# profile added afterwards invalidates the signature.
#
# To get one: developer.apple.com → Certificates, Identifiers & Profiles.
# Register the App ID `maccatalyst.com.hassan.prayerapp` with Keychain
# Sharing and App Groups enabled, then Profiles → + → macOS → Developer ID
# → that App ID → your Developer ID Application certificate. Download it
# and save it as the path below. It is account-specific rather than
# secret, but it is not source, so it is gitignored.
PROFILE=ios/PrayerApp/embedded.provisionprofile

RUNTIME_OPTS=()
ENTITLEMENT_OPTS=()
EXT_ENTITLEMENT_OPTS=()
if [ "$SIGN_IDENTITY" != "-" ]; then
  RUNTIME_OPTS=(--options runtime)
  # The extension gets its OWN entitlements, not the app's: macOS will not
  # host an unsandboxed app extension, and the app must not be sandboxed.
  # See the comments in either file.
  EXT_ENTITLEMENT_OPTS=(--entitlements ios/PrayerWidgetExtension/CatalystExtension.entitlements)
  # Entitlements ONLY with a real identity. An ad-hoc signature carries no
  # Team ID, so the App Group container is never created — claiming it would
  # produce an app that looks entitled and silently is not.
  if [ -f "$PROFILE" ]; then
    # THE PROFILE HAS TO NAME THE CERTIFICATE WE ARE ABOUT TO SIGN WITH.
    #
    # AMFI checks that the signing certificate is one of the profile's
    # DeveloperCertificates, and kills the app when it is not: SIGKILL
    # before main(), exit 137, an empty stderr and nothing in the log to
    # say why. codesign verifies the bundle happily, and so does the
    # notary service. It is the same silent death as claiming a restricted
    # entitlement with no profile at all, from a completely different
    # cause, which is what makes it worth its own check.
    #
    # It is an easy mistake because Xcode leaves a perfectly good Mac
    # Catalyst profile lying in ~/Library/Developer/Xcode/UserData — and
    # that one is a DEVELOPMENT profile, carrying the Apple Development
    # certificate. Reaching for it and signing with Developer ID looks
    # exactly right and cannot work. A Developer ID build needs a
    # Developer ID profile, made in the portal against the same identity.
    PROFILE_CERTS=$(security cms -D -i "$PROFILE" 2>/dev/null |
      plutil -extract DeveloperCertificates xml1 -o - - 2>/dev/null |
      grep -c '<data>' || echo 0)
    SIGNER_CN=${SIGN_IDENTITY%% (*}
    if ! security cms -D -i "$PROFILE" 2>/dev/null |
        plutil -p - 2>/dev/null | grep -q .; then
      echo "  ✗ $PROFILE is not a readable provisioning profile." >&2
      exit 1
    fi
    if ! openssl_has_signer "$PROFILE" "$SIGN_IDENTITY"; then
      echo "  ✗ the profile does not carry the certificate being signed with." >&2
      echo "      signing as: $SIGN_IDENTITY" >&2
      echo "      profile holds $PROFILE_CERTS certificate(s), none of them that one." >&2
      echo "    AMFI will SIGKILL the app before main() and say nothing." >&2
      echo "    A Developer ID build needs a Developer ID profile: portal →" >&2
      echo "    Profiles → + → Developer ID → maccatalyst.com.hassan.prayerapp." >&2
      echo "    Xcode's own Mac Catalyst profile is a DEVELOPMENT one and only" >&2
      echo "    works with the Apple Development identity." >&2
      exit 1
    fi
    echo "▸ Embedding $PROFILE — this build gets a Keychain."
    cp "$PROFILE" "$APP/Contents/embedded.provisionprofile"
    ENTITLEMENT_OPTS=(--entitlements ios/PrayerApp/Catalyst-keychain.entitlements)
  else
    echo "▸ No $PROFILE — signing without a Keychain group."
    echo "  The journal, the fasting log and the sync identity will use the"
    echo "  plaintext fallback in src/storage/durableWrite.ts. See the"
    echo "  comment above PROFILE for how to fix that properly."
    ENTITLEMENT_OPTS=(--entitlements ios/PrayerApp/Catalyst.entitlements)
  fi
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
# Nested extensions, before the app that contains them. Signing the app first
# fails outright — "code object is not signed at all, in subcomponent
# …/PlugIns/PrayerWidgetExtension.appex" — because the outer signature has to
# cover an already-sealed inner one. Inside-out, always.
find "$APP/Contents/PlugIns" -maxdepth 1 -name '*.appex' -print0 2>/dev/null |
  while IFS= read -r -d '' ext; do
    # `|| true`, because an extension with no Frameworks directory makes
    # `find` exit non-zero — and under `set -e` + `pipefail` that killed the
    # script silently, after the frameworks and before the extension, with
    # nothing in the log to say why.
    if [ -d "$ext/Contents/Frameworks" ]; then
      find "$ext/Contents/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.dylib' \) -print0 2>/dev/null |
        while IFS= read -r -d '' efw; do
          codesign --force "${RUNTIME_OPTS[@]+"${RUNTIME_OPTS[@]}"}" -s "$SIGN_IDENTITY" "$efw"
        done
    fi
    echo "  ▸ signing extension: $(basename "$ext")"
    # The extension needs the App Group too — it is the side that READS the
    # payload. Entitle only the extension and the app can't write; entitle
    # only the app and the widget renders an empty card. It also needs the
    # sandbox the app must not have, which is why this is EXT_ENTITLEMENT_OPTS
    # and not the app's file.
    codesign --force "${RUNTIME_OPTS[@]+"${RUNTIME_OPTS[@]}"}" \
      "${EXT_ENTITLEMENT_OPTS[@]+"${EXT_ENTITLEMENT_OPTS[@]}"}" -s "$SIGN_IDENTITY" "$ext"
  done
codesign --force "${RUNTIME_OPTS[@]+"${RUNTIME_OPTS[@]}"}" \
  "${ENTITLEMENT_OPTS[@]+"${ENTITLEMENT_OPTS[@]}"}" -s "$SIGN_IDENTITY" "$APP"
codesign --verify --strict "$APP" && echo "▸ Signature verifies ($SIGN_IDENTITY)."

if [ "$SIGN_IDENTITY" != "-" ]; then
  echo "▸ Checking the entitlements that actually got sealed in…"
  # Both of these are things that produce a widget which installs, registers,
  # renders — and is blank or absent. Neither shows up in signature
  # verification or notarization, and both have happened here, so they are
  # asserted against the SIGNED bundles rather than the source files.
  EXT_ENTS=$(codesign -d --entitlements - --xml \
    "$APP/Contents/PlugIns/PrayerWidgetExtension.appex" 2>/dev/null | plutil -p -)
  APP_ENTS=$(codesign -d --entitlements - --xml "$APP" 2>/dev/null | plutil -p -)
  # `plutil -p` renders booleans as `true`, older versions as `1`; accept both.
  if ! grep -qE '"com\.apple\.security\.app-sandbox" => (true|1)' <<< "$EXT_ENTS"; then
    echo "  ✗ the widget extension is not sandboxed." >&2
    echo "    macOS will refuse to host it: chronod fails every timeline query" >&2
    echo "    with \"Extension must have com.apple.security.app-sandbox\"." >&2
    exit 1
  fi
  # The Keychain group, when a profile said it was allowed. Worth asserting
  # for the same reason as the other two: the failure is invisible until the
  # app is running, and here it is a silent downgrade to plaintext rather
  # than a visible break.
  if [ -f "$PROFILE" ]; then
    if ! grep -q 'keychain-access-groups' <<< "$APP_ENTS"; then
      echo "  ✗ a profile was embedded but no Keychain group was sealed in." >&2
      exit 1
    fi
    if [ ! -f "$APP/Contents/embedded.provisionprofile" ]; then
      echo "  ✗ the embedded profile is missing from the signed bundle." >&2
      exit 1
    fi
    echo "  ✓ Keychain group sealed in, profile embedded."
  fi
  APP_GROUP=$(grep -A2 'application-groups' <<< "$APP_ENTS" | grep '=> "' | head -1)
  EXT_GROUP=$(grep -A2 'application-groups' <<< "$EXT_ENTS" | grep '=> "' | head -1)
  if [ -z "$APP_GROUP" ] || [ "$APP_GROUP" != "$EXT_GROUP" ]; then
    echo "  ✗ app and extension disagree about the App Group:" >&2
    echo "      app: ${APP_GROUP:-<none>}" >&2
    echo "      ext: ${EXT_GROUP:-<none>}" >&2
    echo "    The writer and the reader must name the same group or the" >&2
    echo "    widget renders an empty card." >&2
    exit 1
  fi
  echo "  ▸ extension sandboxed; both sides share${APP_GROUP#*=>}"
fi

echo "▸ Smoke-launching the signed app…"
# A signature that verifies is not a bundle that runs. Restricted entitlements
# (keychain-access-groups, and friends) need a provisioning profile to back
# them; without one AMFI SIGKILLs the process before main() — while both
# `codesign --verify` and Apple's notary service happily pass the same
# bundle. Seen 2026-08-07, and nothing else in this script would have caught
# it, so the gate has to be an actual launch.
LAUNCH_LOG=$(mktemp -t mihrab-catalyst-launch)
# Address the group container BY PATH, never as a bare domain name. An
# unsandboxed shell asking `defaults` for `GAW23HT439.group.com.prayerapp`
# does not get the group container: it gets (and, on write, CREATES) a shadow
# ~/Library/Preferences/<name>.plist, which then masks the real container for
# every later read. That shadow is what made this gate report an empty
# container on 2026-08-07 while the app had in fact written correctly.
GROUP_NAME=$(sed -n 's/.*<string>\(.*group.*\)<\/string>.*/\1/p' \
  ios/PrayerApp/Catalyst.entitlements | head -1)
GROUP_DOMAIN="$HOME/Library/Group Containers/$GROUP_NAME/Library/Preferences/$GROUP_NAME"
# Quit any copy that is already running first. It has the same bundle
# identifier, so `open` below hands the launch straight to IT and the binary
# this build just signed never runs at all — and since the running instance
# has no reason to rewrite the payload key we are about to delete, the check
# fails on an app that is perfectly healthy. Three builds in a row failed
# that way on 2026-08-24, every one of them with a window left open from
# testing; a properly cold launch writes the payload in about five seconds.
#
# Match on the executable PATH, not the app's name: the process is called
# PrayerApp, not Mihrab, so `pkill -x Mihrab` quietly matches nothing (which
# is how the first attempt at this changed nothing at all). The pattern also
# catches a copy running from /Applications, which is the same bundle
# identifier and would hijack the launch just as effectively.
pkill -f "Mihrab.app/Contents/MacOS/PrayerApp" 2>/dev/null || true
sleep 3
# Clear the payload so the check below cannot be satisfied by a value some
# earlier build left behind. The app rewrites it within a few seconds of
# launch, so this costs the local widget a blink and nothing else.
if [ "$SIGN_IDENTITY" != "-" ]; then
  defaults delete "$GROUP_DOMAIN" prayer_widget_payload_v1 2>/dev/null || true
fi
# `open -g -j`: launch in the background and hidden. Running the executable
# directly works too, but it throws a window onto whatever the person is doing,
# once per build — which is rude when the launch is only a self-check.
open -g -j "$APP" 2>>"$LAUNCH_LOG" || true
sleep 15
LAUNCH_PID=$(pgrep -f "$APP/Contents/MacOS/PrayerApp" | head -1)
if ! kill -0 "$LAUNCH_PID" 2>/dev/null; then
  echo "  ✗ the app died on launch — see $LAUNCH_LOG" >&2
  tail -20 "$LAUNCH_LOG" >&2
  echo "  ✗ if it left nothing, AMFI killed it. Ask why:" >&2
  echo "    /usr/bin/log show --last 5m --predicate 'senderImagePath CONTAINS \"AppleMobileFileIntegrity\"' --style compact | tail -30" >&2
  exit 1
fi
echo "  ▸ alive after 15s."
# The whole point of the App Group is the widget payload, so prove the app
# really reached the container rather than trusting the entitlement.
#
# Read the value, don't watch the file's mtime: NSUserDefaults writes nothing
# when the payload is byte-identical to what is already stored, so a second
# build on the same day looks like a failure to any timestamp check (which is
# exactly how the first version of this gate cried wolf). Reading back the key
# that was just deleted proves both halves at once: the app is entitled, and
# it got far enough to compute times. Today's date has to be in it too, since
# a rewrite of yesterday's data would mean the pipeline is stuck.
#
# Only with a real identity: an ad-hoc signature carries no Team ID, so no
# container is ever created and there is nothing to check.
#
# POLL, don't take one reading. The 15 s above is enough for the app to be
# alive, and on a warm launch it is enough for the payload too — but a cold
# launch straight off a full rebuild has to page in the whole binary, start
# Hermes, hydrate the encrypted store and resolve a location before it can
# compute anything, and that has been measured past 30 s on this Mac. A
# single read at 15 s failed a build whose app turned out to be perfectly
# healthy; waiting the worst case every time would tax every build for the
# sake of the slowest. So ask repeatedly and stop as soon as it lands.
if [ "$SIGN_IDENTITY" != "-" ]; then
  PAYLOAD_OK=0
  for _ in $(seq 1 12); do
    if defaults read "$GROUP_DOMAIN" prayer_widget_payload_v1 2>/dev/null |
        grep -q "$(date +%Y-%m-%d)"; then
      PAYLOAD_OK=1
      break
    fi
    sleep 5
  done
  if [ "$PAYLOAD_OK" = "1" ]; then
    echo "  ▸ App Group holds today's payload — the widget will have data."
  else
    echo "  ✗ $GROUP_NAME has no payload for today." >&2
    echo "    The widget would render an empty card. Check that the app group" >&2
    echo "    entitlement is on BOTH the app and the .appex, and that the app" >&2
    echo "    got far enough to compute prayer times (needs a location)." >&2
    kill "$LAUNCH_PID" 2>/dev/null || true
    exit 1
  fi
fi
kill "$LAUNCH_PID" 2>/dev/null || true
wait "$LAUNCH_PID" 2>/dev/null || true
rm -f "$LAUNCH_LOG"

echo "▸ Zipping…"
ditto -c -k --keepParent "$APP" "$ZIP"
shasum -a 256 "$ZIP" | tee "$ZIP.sha256"
echo "▸ Done: $ZIP"
