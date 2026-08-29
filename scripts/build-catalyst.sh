#!/bin/bash
# Build the Mac Catalyst .app and zip it for GitHub-release / Homebrew
# distribution (Path B — docs/release/path-a-ipad-mac.md covers Path A).
#
# Usage:
#   ./scripts/build-catalyst.sh                       # finds your Developer ID
#   SIGN_IDENTITY="Developer ID Application: …" \
#     ./scripts/build-catalyst.sh                     # or name it yourself
#   SIGN_IDENTITY=- ./scripts/build-catalyst.sh       # ad-hoc, NOT shippable
#
# Notarization is part of this script, not a note at the top of it. See
# "NOTARIZE, STAPLE, AND PROVE IT" near the end for why. Credentials come
# from the `mihrab` notarytool keychain profile, or from
# ~/.config/mihrab/asc.json; `NOTARY_PROFILE=` names a different one.
#   SKIP_NOTARIZE=1 ./scripts/build-catalyst.sh   # local only, unshippable
#
# ── AD-HOC IS NOT "THE SAME BUILD WITHOUT NOTARIZATION" ───────────────
#
# This file used to default to ad-hoc and say the cask "works either way;
# notarization only affects Gatekeeper friction". Both halves were wrong,
# and 2.11.0 shipped to macOS because of it.
#
# An ad-hoc signature carries no team identifier, and codesign will not
# apply entitlements without one. So the app gets NO App Group — which is
# where the widget payload lives — and cannot host its WidgetKit extension
# at all. The shipped 2.11.0 had no widgets in the gallery, wrote no
# payload, and could not read the Keychain items its Developer ID-signed
# predecessor had created, so it silently generated a NEW sync identity and
# orphaned the old device's file in everyone's shared folder. One missing
# environment variable, three separate user-visible failures.
#
# The App Group gate below would have caught it. It did not run, because it
# was written as `if [ "$SIGN_IDENTITY" != "-" ]` — a check that switches
# itself off in exactly the case that needs it. So: the identity is now
# found automatically, an ad-hoc build has to be asked for by name, and the
# entitlements are asserted on the built bundle rather than inferred from
# what we intended to sign with.
#
# Output: ios/build/catalyst-dist/Mihrab-macOS-<version>.zip (+ sha256).
set -euo pipefail
cd "$(dirname "$0")/.."

# Default to whatever Developer ID this Mac holds, rather than to ad-hoc.
# Naming one explicitly still wins; `SIGN_IDENTITY=-` is the deliberate
# opt-out and says so out loud.
if [ -z "${SIGN_IDENTITY:-}" ]; then
  SIGN_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null |
    sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
  if [ -z "$SIGN_IDENTITY" ]; then
    echo "✗ No 'Developer ID Application' identity in the keychain." >&2
    echo "  A Catalyst build without one gets no team id, so codesign" >&2
    echo "  drops the entitlements: no App Group, no widgets, and a new" >&2
    echo "  sync identity every install. That is what shipped as 2.11.0." >&2
    echo "  Unlock the login keychain, or ask for it deliberately:" >&2
    echo "      SIGN_IDENTITY=- ./scripts/build-catalyst.sh   # local only" >&2
    exit 1
  fi
  echo "▸ Signing identity found: $SIGN_IDENTITY"
fi
if [ "$SIGN_IDENTITY" = "-" ]; then
  echo "⚠ AD-HOC BUILD. No entitlements, no App Group, no widgets." >&2
  echo "  Runs locally past Gatekeeper; MUST NOT be published." >&2
fi

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
  # A TEAM IDENTIFIER FIRST, because without one none of the rest can be
  # true. codesign cannot scope an App Group to a team it does not have, so
  # it drops every entitlement and still reports success — which is how
  # 2.11.0 shipped to macOS with no App Group, no widgets, and no access to
  # the Keychain items its predecessor had written. The signature verifies
  # perfectly; it just is not the app.
  if codesign -dv "$APP" 2>&1 | grep -q "TeamIdentifier=not set"; then
    echo "  ✗ no TeamIdentifier on the signed app." >&2
    echo "    Every entitlement below has been silently dropped: no App" >&2
    echo "    Group, no widgets, and a new sync identity on every install." >&2
    echo "    The identity did not take — check the login keychain." >&2
    exit 1
  fi
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

# THE EXTENSION THE LAUNCH SPAWNED, TOO. Killing the app is not killing the
# widget: registering this copy is enough for chronod to ask it for a
# timeline, and the .appex it starts is a separate process with a separate
# lifetime. It survives the app, and then it survives the `rm -rf "$APP"`
# below — leaving a widget extension running out of a bundle that no longer
# exists. Found 2026-08-29, hours after a release build had finished:
#
#   $ pgrep -alf PrayerWidgetExtension
#   57114 …/ios/build/catalyst-dist/Mihrab.app/…/PrayerWidgetExtension
#
# That is the same shape as the stale LaunchServices record the block below
# exists to prevent, in process form: a live extension for this bundle
# identifier, answering from a path nothing else agrees with, while the
# installed copy is the one that is supposed to be serving the widgets.
pkill -f "$APP/Contents/PlugIns/" 2>/dev/null || true

# ── Hand the machine back ─────────────────────────────────────────────
#
# Launching the app registered THIS copy — the one in ios/build — with
# LaunchServices, widget extension and all. That registration outlives the
# build: the bundle gets zipped, deleted, replaced next build, and
# LaunchServices keeps pointing at a path that no longer holds the bundle it
# remembers.
#
# What that does to the widgets is not obvious and cost an afternoon to find
# (2026-08-26). chronod launches the extension from the STALE path, the
# extension answers with a perfectly good timeline, and then the archive is
# rejected:
#
#   WidgetArchiver.ValidationError.bundleStubNotSupported
#     ("Bundle version did not match; LaunchServices DB may need to be rebuilt")
#
# Every widget, every size, gallery previews included, on the copy in
# /Applications that was never the problem. Nothing in the app is wrong and
# nothing in the app can fix it.
#
# So unregister what we registered. `-u` is scoped to one path: it does not
# touch /Applications, and it is not the `-kill -r` sledgehammer that
# rebuilds the whole database.
#
# THREE PATHS, NOT ONE, AND AFTER THE ZIP RATHER THAN BEFORE IT. The first
# version of this unregistered only the copy it launched, and only that, and
# it did not work — checked on 2026-08-26, straight after a clean build:
#
#   ios/build/catalyst-dist/Mihrab.app                          ← re-appeared
#   …/catalyst-release/…/PrayerApp.app                          ← never touched
#   …/catalyst-release/…/PrayerApp.app/…/PrayerWidgetExtension.appex
#
# Two things were wrong. Xcode registers its OWN build product, so the
# derived-data bundle and its widget extension are registered by the compile
# whether or not anything is ever launched — and that .appex is precisely
# the competing widget host. And a bundle that still exists on disk gets
# rediscovered, so unregistering the dist copy while leaving it sitting
# there buys minutes.
#
# Hence: unregister all four paths, then DELETE the bundle. The zip is the
# artifact; the .app beside it was only ever the thing we zipped, and it is
# one `unzip` away for anyone who wants to run it.
#
# Then check, and fail if a ghost survived. A build that says it cleaned up
# and did not is worse than one that says nothing — that is the whole reason
# this section had to be written twice.
#
# Users reach the same state without any of this — unzip the release, run it
# once from Downloads, drag it to Applications, empty the Trash — so the
# repair is written down in docs/release/catalyst-widgets.md rather than
# living only here.
echo "▸ Zipping…"
ditto -c -k --keepParent "$APP" "$ZIP"

# ── NOTARIZE, STAPLE, AND PROVE IT ────────────────────────────────────
#
# EVERY RELEASE FROM 2.11.0 TO 2.13.3 SHIPPED UNNOTARIZED. Eight of them.
# The step was four commented-out lines at the top of this file telling a
# human to run notarytool afterwards, and the notary service's own history
# shows the last accepted submission was 2.10.1 on 2026-08-24. Measured on
# the published 2.13.3:
#
#   spctl -a -vvv -t exec /Applications/Mihrab.app
#     → rejected
#       source=Unnotarized Developer ID
#   stapler validate /Applications/Mihrab.app
#     → does not have a ticket stapled to it
#
# That is Gatekeeper refusing the first launch of every Mac install, which
# is why the cask has a caveat apologising for it. A step that lives in a
# comment is a step that does not happen — the same shape as the ad-hoc
# failure above, and as the release checklist this project replaced with a
# script.
#
# STAPLING IS THE HALF PEOPLE SKIP. Notarization alone records the verdict
# on Apple's servers; the stapled ticket is the copy inside the bundle, and
# it is what a Mac uses when it cannot reach Apple — a plane, a locked-down
# network, an outage. Notarized-but-unstapled looks fine on the machine
# that built it and blocks a user who is offline.
#
# THE ASSERTIONS ARE ON THE ARTIFACT, not on the fact that the commands
# ran. Stapling mutates the .app after it was zipped, so the zip has to be
# rebuilt afterwards — get that order wrong and everything here still
# "succeeds" while publishing a zip with no ticket in it. So the finished
# zip is unpacked again and asked what it is.
if [ "$SIGN_IDENTITY" = "-" ]; then
  echo "⚠ Ad-hoc build: nothing to notarize. This zip cannot be published." >&2
elif [ "${SKIP_NOTARIZE:-}" = "1" ]; then
  echo "⚠ SKIP_NOTARIZE=1 — this zip is NOT notarized and MUST NOT be" >&2
  echo "  published. release.sh checks the artifact, not this flag, and" >&2
  echo "  will refuse it." >&2
else
  NOTARY_PROFILE=${NOTARY_PROFILE:-mihrab}
  ASC_JSON="$HOME/.config/mihrab/asc.json"
  NOTARY_ARGS=()
  if xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then
    NOTARY_ARGS=(--keychain-profile "$NOTARY_PROFILE")
    echo "▸ Notarizing (keychain profile: $NOTARY_PROFILE)…"
  elif [ -f "$ASC_JSON" ]; then
    # The same App Store Connect key scripts/xcode-cloud.py uses. Reading it
    # here means one credential for both, rather than a second thing to set
    # up that is only noticed when it is missing.
    ASC_KEY=$(plutil -extract keyPath raw -o - "$ASC_JSON" 2>/dev/null || true)
    ASC_KEY_ID=$(plutil -extract keyId raw -o - "$ASC_JSON" 2>/dev/null || true)
    ASC_ISSUER=$(plutil -extract issuerId raw -o - "$ASC_JSON" 2>/dev/null || true)
    if [ -z "$ASC_KEY" ] || [ -z "$ASC_KEY_ID" ] || [ -z "$ASC_ISSUER" ]; then
      echo "  ✗ $ASC_JSON is missing keyPath, keyId or issuerId." >&2
      exit 1
    fi
    NOTARY_ARGS=(--key "$ASC_KEY" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER")
    echo "▸ Notarizing (App Store Connect key from $ASC_JSON)…"
  else
    echo "  ✗ No notarization credentials." >&2
    echo "    Gatekeeper blocks the first launch of an unnotarized build," >&2
    echo "    which is what 2.11.0 through 2.13.3 shipped as. Set one up:" >&2
    echo "      xcrun notarytool store-credentials mihrab \\" >&2
    echo "        --key <AuthKey.p8> --key-id <id> --issuer <uuid>" >&2
    echo "    or put keyPath/keyId/issuerId in $ASC_JSON." >&2
    echo "    SKIP_NOTARIZE=1 builds a zip that cannot be released." >&2
    exit 1
  fi

  NOTARY_LOG=$(mktemp -t mihrab-notarize)
  if ! xcrun notarytool submit "$ZIP" "${NOTARY_ARGS[@]}" --wait --timeout 30m \
      2>&1 | tee "$NOTARY_LOG"; then
    echo "  ✗ notarytool submit failed — see above." >&2
    exit 1
  fi
  # `--wait` exits 0 on Invalid as well as Accepted, so read the verdict.
  if ! grep -q "status: Accepted" "$NOTARY_LOG"; then
    SUB_ID=$(sed -n 's/^ *id: \([0-9a-f-]*\) *$/\1/p' "$NOTARY_LOG" | head -1)
    echo "  ✗ notarization was not accepted." >&2
    [ -n "$SUB_ID" ] && xcrun notarytool log "$SUB_ID" "${NOTARY_ARGS[@]}" >&2 || true
    exit 1
  fi
  rm -f "$NOTARY_LOG"

  echo "▸ Stapling the ticket into the bundle…"
  xcrun stapler staple "$APP" || { echo "  ✗ stapler failed." >&2; exit 1; }
  # The ticket goes in a part of the bundle the seal excludes, so the
  # signature must still verify. Asserted, because "must" is a claim.
  codesign --verify --strict "$APP" \
    || { echo "  ✗ stapling broke the signature." >&2; exit 1; }

  echo "▸ Re-zipping with the ticket…"
  rm -f "$ZIP"
  ditto -c -k --keepParent "$APP" "$ZIP"

  # ── AND NOW ASK THE ZIP ──
  #
  # Two checks on two copies, deliberately, and NEITHER of them runs
  # Gatekeeper against the unpacked one.
  #
  # `spctl -a` on a bundle sitting in a temp directory hands it to App
  # Translocation, and the translocated path gets REGISTERED: measured
  # 2026-08-29, an spctl call on an extracted copy left
  #
  #   /private/var/folders/…/T/AppTranslocation/…/d/Mihrab.app
  #   /private/var/folders/…/T/AppTranslocation/…/d/…/PrayerWidgetExtension.appex
  #
  # in the LaunchServices database, and the .appex record took the
  # INSTALLED app's plugin registration with it — records are keyed by
  # bundle identifier. Every widget on the machine went blank, from a
  # verification step whose whole job was to make the build safer.
  #
  # So: `stapler validate` on the unpacked copy, which is what proves the
  # ticket survived into the zip and does not invoke Gatekeeper; and
  # `spctl` on $APP, which is the bundle the zip was made from and is a
  # path this script already registers and cleans up below.
  echo "▸ Checking the notarization that actually got shipped…"
  NCHECK=$(mktemp -d)
  ditto -x -k "$ZIP" "$NCHECK" || { echo "  ✗ cannot unpack $ZIP" >&2; exit 1; }
  if ! xcrun stapler validate "$NCHECK/Mihrab.app" >/dev/null 2>&1; then
    echo "  ✗ the zip carries no stapled ticket." >&2
    echo "    An offline Mac will refuse to launch it. The re-zip above" >&2
    echo "    must happen AFTER the staple." >&2
    exit 1
  fi
  rm -rf "$NCHECK"
  # Both halves matter. "accepted" alone can come from a Developer ID that
  # is merely trusted locally; the source line is what says a notarized
  # ticket was the reason.
  ASSESS=$(spctl -a -t exec -vv "$APP" 2>&1 || true)
  if ! grep -q "accepted" <<< "$ASSESS" ||
     ! grep -q "source=Notarized Developer ID" <<< "$ASSESS"; then
    echo "  ✗ Gatekeeper does not accept the bundle this zip was made from:" >&2
    printf '      %s\n' "$ASSESS" >&2
    exit 1
  fi
  echo "  ✓ Gatekeeper accepts it: notarized Developer ID, ticket stapled."
fi

shasum -a 256 "$ZIP" | tee "$ZIP.sha256"

LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
BUILT=ios/build/catalyst-release/Build/Products/Release-maccatalyst/PrayerApp.app
if [ -x "$LSREGISTER" ]; then
  # THE .appex PATHS ARE DELIBERATELY NOT LISTED HERE.
  #
  # `-u` takes a path but the record it drops is keyed by BUNDLE IDENTIFIER,
  # and every copy of the widget extension — build product, dist copy, the
  # one inside /Applications — carries the same one. Unregistering the build
  # tree's `.appex` took the INSTALLED app's plugin registration with it on
  # 2026-08-27: `pluginkit` stopped listing the extension at all, which is
  # the same blank-widgets outcome this cleanup exists to prevent, arrived at
  # from the opposite direction. Unregistering the `.app` is enough; the
  # plugin inside it goes with it.
  # The two known paths, plus WHATEVER ELSE IS REGISTERED. The fixed list
  # was not enough: notarization brought App Translocation with it, and a
  # translocated copy lives at a path nobody can predict. Sweeping `.app`
  # records outside /Applications catches those; `.appex` records are still
  # never named here, for the reason above, and the assertion below is what
  # says whether one survived.
  for stale in "$APP" "$BUILT"; do
    "$LSREGISTER" -u "$stale" 2>/dev/null || true
  done
  # NO `$` ANCHOR ON THE PATH. `lsregister -dump` writes
  # `path:  /Applications/Mihrab.app (0x42c4)` — a trailing record id — so a
  # pattern ending in `\.app$` matches nothing at all and the sweep silently
  # does nothing. It was written that way first and found two ghosts still
  # sitting in the database after it claimed to have cleaned them.
  #
  # Without the anchor, an `.appex` line matches up to its parent `.app`,
  # which is the path we want to unregister anyway. `sort -u` collapses the
  # duplicate, and the `-v` below keeps the installed copy — anchored there,
  # where the anchor is correct.
  "$LSREGISTER" -dump 2>/dev/null |
    grep -oE '^path: +/[^ ]*(PrayerApp|Mihrab)\.app' | sed 's/^path: *//' |
    sort -u | grep -v '^/Applications/Mihrab\.app$' |
    while read -r stale; do "$LSREGISTER" -u "$stale" 2>/dev/null || true; done
  rm -rf "$APP"
  # AND PUT THE REAL ONE BACK. Cheap insurance either way: if the installed
  # copy survived the above it is re-registered identically, and if it did
  # not, this is the repair from docs/release/catalyst-widgets.md.
  #
  # The widget extension needs saying separately. Unregistering any copy of
  # this app drops the plugin record for ALL of them — same bundle
  # identifier — so a build can leave the machine with an app that
  # registers fine and no widget provider at all, which is the 2026-08-29
  # failure seen from the developer's side rather than the user's.
  # `lsregister -f` does not restore it and launching the app is the only
  # other thing that does, so ask PlugInKit directly, and check that it
  # stayed: a late LaunchServices event can drop it a second later.
  if [ -d /Applications/Mihrab.app ]; then
    "$LSREGISTER" -f /Applications/Mihrab.app 2>/dev/null || true
    INSTALLED_EXT=/Applications/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex
    INSTALLED_ID=maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension
    # CAPTURED, NOT PIPED INTO `grep -q`. grep exits on the first line,
    # pluginkit takes SIGPIPE, and `pipefail` turns that into 141 — so a
    # registered extension reads as missing, the loop can never break, and
    # the warning below fires on a machine that is perfectly healthy. It
    # only worked here by accident: pluginkit's output is small enough to
    # fit the pipe buffer and finish writing before grep leaves.
    SEEN=""
    for _ in 1 2 3 4 5 6 7 8; do
      pluginkit -a "$INSTALLED_EXT" >/dev/null 2>&1 || true
      sleep 3
      SEEN="$(pluginkit -m -i "$INSTALLED_ID" 2>/dev/null || true)"
      if [ -n "$SEEN" ]; then break; fi
    done
    if [ -n "$SEEN" ]; then
      echo "  ▸ the installed app's widget extension is still registered."
    else
      echo "  ⚠ /Applications/Mihrab.app's widget extension is NOT registered." >&2
      echo "    Its widgets will be blank until it is. See" >&2
      echo "    docs/release/catalyst-widgets.md; the zip is fine." >&2
    fi
  fi
  sleep 2
  GHOSTS=$("$LSREGISTER" -dump 2>/dev/null |
    grep -oE '^path: +/[^ ]*(PrayerApp\.app|Mihrab\.app|PrayerWidgetExtension\.appex)[^ ]*' |
    sed 's/^path: *//' | sort -u | grep -v '^/Applications/Mihrab\.app' || true)
  if [ -n "$GHOSTS" ]; then
    echo "  ✗ LaunchServices still points at a build copy:" >&2
    printf '      %s\n' $GHOSTS >&2
    echo "    Every widget on this Mac will go blank — see" >&2
    echo "    docs/release/catalyst-widgets.md. Clear them with:" >&2
    echo "      for p in $GHOSTS; do \"$LSREGISTER\" -u \"\$p\"; done" >&2
    echo "    The zip is built and fine: $ZIP" >&2
    exit 1
  fi
  echo "  ▸ LaunchServices knows only /Applications/Mihrab.app."
fi

echo "▸ Done: $ZIP"
