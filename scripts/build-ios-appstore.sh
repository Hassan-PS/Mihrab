#!/bin/bash
# Archive Mihrab for iOS and send it to App Store Connect, from this Mac.
#
# Usage:
#   ./scripts/build-ios-appstore.sh              # archive, export, validate, upload
#   ./scripts/build-ios-appstore.sh --no-upload  # stop after validate
#   SKIP_PODS=1 ./scripts/build-ios-appstore.sh  # trust the Pods already there
#
# ── WHY THIS EXISTS, WHEN XCODE CLOUD ALREADY DOES IT ─────────────────
#
# Because Xcode Cloud is one service on one company's weather. On
# 2026-09-11 `POST /v1/ciBuildRuns` answered HTTP 500 three times running,
# including with an explicit branch reference — nothing to fix, nothing to
# retry against, and no way to ship. A release that can only go out
# through someone else's CI is a release you do not control.
#
# It is also the only way to find out that the signing assets on this Mac
# are real. Until today this account had NO distribution certificate at
# all: every App Store build Mihrab ever shipped was signed by a
# cloud-managed certificate held on Apple's side, which is a dependency
# nobody had noticed, because nothing here ever had to have one.
#
# ── WHAT THIS CANNOT DO, AND WILL NOT PRETEND TO ──────────────────────
#
# A local archive exports against provisioning profiles that already
# exist on this machine. A clean-checkout cloud build does not, which is
# precisely why builds 520-522 archived green here and died at the export
# step in the cloud on an entitlement the App ID had never been granted.
#
# So a green run of this script is NOT evidence that Xcode Cloud would be
# green. The entitlement gate below is the closest this can get: it reads
# what each embedded appex actually claims, in the built archive, and
# refuses to export when a claim is one the App ID cannot back. That is
# the specific failure that cost three builds; it is worth twenty seconds
# here rather than twenty minutes there.
set -euo pipefail
cd "$(dirname "$0")/.."

UPLOAD=1
[ "${1:-}" = "--no-upload" ] && UPLOAD=0

say()  { printf '▸ %s\n' "$*"; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }
warn() { printf '⚠ %s\n' "$*" >&2; }

# ── Preflight: every reason this run cannot work, before it costs time ──

TEAM=GAW23HT439
WORKSPACE=ios/PrayerApp.xcworkspace
SCHEME=PrayerApp

IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null |
  sed -n 's/.*"\(Apple Distribution: [^"]*\)".*/\1/p' | head -1)
if [ -z "$IDENTITY" ]; then
  die "No 'Apple Distribution' identity in the login keychain.

  App Store Connect will not take an archive signed with the Development
  or Developer ID certificate — those are for your own devices and for
  the Homebrew channel. Create the distribution certificate:

      Xcode → Settings → Accounts → <your Apple ID> → the team
            → Manage Certificates… → + → Apple Distribution

  or, the manual way, generate a CSR and upload it at
  developer.apple.com/account → Certificates → + → Apple Distribution,
  then import the issued .cer together with its private key.

  Note that a .cer downloaded from the portal is only the public half:
  without the matching private key in this keychain it is not an
  identity and this check will keep failing."
fi
say "Signing identity: $IDENTITY"

ASC=~/.config/mihrab/asc.json
[ -f "$ASC" ] || die "No App Store Connect API key config at $ASC.
  It needs {\"keyId\": …, \"issuerId\": …, \"keyPath\": …} — the same
  credentials scripts/xcode-cloud.py and the notarization step use."
KEY_ID=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["keyId"])' "$ASC")
ISSUER=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["issuerId"])' "$ASC")
KEY_PATH=$(python3 -c 'import json,os,sys;print(os.path.expanduser(json.load(open(sys.argv[1]))["keyPath"]))' "$ASC")
[ -f "$KEY_PATH" ] || die "The API key file $KEY_PATH named by $ASC is not there."

# altool does not take a path to the key. It looks for
# AuthKey_<id>.p8 in ./private_keys, ~/private_keys, ~/.private_keys and
# ~/.appstoreconnect/private_keys, and says only "could not find the API
# key" when it is anywhere else — including where ours actually lives.
# So put a link where it looks rather than copying the secret about.
KEY_DIR=~/.appstoreconnect/private_keys
KEY_LINK="$KEY_DIR/AuthKey_$KEY_ID.p8"
if [ ! -f "$KEY_LINK" ]; then
  mkdir -p "$KEY_DIR" && chmod 700 "$KEY_DIR"
  ln -sf "$KEY_PATH" "$KEY_LINK"
  say "Linked the API key where altool looks: $KEY_LINK"
fi

VERSION=$(sed -n 's/.*MARKETING_VERSION = \([0-9.]*\);.*/\1/p' ios/PrayerApp.xcodeproj/project.pbxproj | head -1)
BUILD=$(sed -n 's/.*CURRENT_PROJECT_VERSION = \([0-9]*\);.*/\1/p' ios/PrayerApp.xcodeproj/project.pbxproj | head -1)
[ -n "$VERSION" ] && [ -n "$BUILD" ] || die "Could not read MARKETING_VERSION / CURRENT_PROJECT_VERSION from the pbxproj."
say "Mihrab $VERSION ($BUILD)"

# A version that has already gone live cannot take another build, and the
# refusal arrives at the END — after the archive, the export and the
# upload have all succeeded. §9 of CLAUDE.md has the full account; this
# turns twenty-five wasted minutes into one question asked up front.
if ./scripts/xcode-cloud.py shipped "$VERSION" >/dev/null 2>&1; then
  warn "$VERSION has already reached App Store Connect."
  warn "App Store Connect refuses further builds for a version that is live:"
  warn "the archive and export will both succeed and the upload will fail."
  warn "Bump the version first (CLAUDE.md §9) unless this is a TestFlight-only build."
  printf '   Continue anyway? [y/N] '
  read -r answer
  [ "$answer" = "y" ] || exit 1
fi

ARCHIVE=ios/build/appstore/Mihrab-$VERSION.xcarchive
EXPORT=ios/build/appstore/export-$VERSION
mkdir -p ios/build/appstore
rm -rf "$EXPORT"
[ "${SKIP_ARCHIVE:-}" = "1" ] || rm -rf "$ARCHIVE"

# Xcode signs in with an Apple ID; xcodebuild on its own does not have one.
# Without this, `-allowProvisioningUpdates` has no credentials to create
# App Store profiles with and the export dies on
#
#     error: exportArchive No Accounts
#     error: exportArchive No profiles for 'com.hassan.prayerapp' were found
#
# which reads as a project misconfiguration and is an authentication
# problem. The same API key that uploads the build can also mint the
# profiles, so hand it to both xcodebuild invocations. (Seen 2026-09-11 on
# the first local archive this account ever made: the ARCHIVE succeeds
# without credentials, because automatic signing falls back to the
# development certificate already in the keychain, and only the export
# needs distribution profiles that do not exist yet.)
AUTH=(
  -authenticationKeyPath "$KEY_PATH"
  -authenticationKeyID "$KEY_ID"
  -authenticationKeyIssuerID "$ISSUER"
)

# ── Pods, in plain iOS shape ──────────────────────────────────────────
# build-catalyst.sh regenerates the Pods project with MIHRAB_CATALYST=1,
# and says in its own comments that those settings break the plain iOS
# device archive (hermes-engine framework layout). Whoever built the Mac
# artifact last leaves this tree in that state, so the iOS archive has to
# put it back rather than assume.
if [ "${SKIP_PODS:-}" != "1" ]; then
  say "pod install (plain iOS — undoing any Catalyst pod state)…"
  (cd ios && pod install --silent)
fi

# ── Archive ───────────────────────────────────────────────────────────
# -allowProvisioningUpdates is what lets automatic signing create the
# App Store profiles for all three bundle ids. Until today there was no
# distribution certificate to create them against, so this is the first
# run that can: expect it to register profiles the first time and be
# silent afterwards.
if [ "${SKIP_ARCHIVE:-}" = "1" ] && [ -d "$ARCHIVE" ]; then
  say "SKIP_ARCHIVE=1 — reusing $ARCHIVE"
else
  say "Archiving for generic/platform=iOS (Release)…"
  xcodebuild archive \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE" \
    -allowProvisioningUpdates \
    "${AUTH[@]}" \
    DEVELOPMENT_TEAM="$TEAM" \
    -quiet
fi

[ -d "$ARCHIVE" ] || die "No archive at $ARCHIVE — xcodebuild reported success and produced nothing."

# ── The gate that builds 520-522 needed ───────────────────────────────
#
# Every entitlement an appex claims has to be authorised by a profile,
# the profile is generated from the App ID's capabilities, and automatic
# signing will neither create an App ID nor add a capability to one. A
# copied entitlements file therefore ARCHIVES FINE and fails at export,
# which reads like a signing flake and is not.
#
# `Widgets phase 0` copied PrayerWidgetExtension.entitlements onto the
# new Live Activity target, App Group and all. A Live Activity reads no
# shared storage — ActivityKit hands the extension its attributes — so
# the fix was to claim nothing. This asserts that it still claims
# nothing, by reading the signed bundle rather than the source file.
APP_BUNDLE=$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -name '*.app' | head -1)
[ -n "$APP_BUNDLE" ] || die "No .app inside the archive."

# claims <bundle> <entitlement key> -> prints the value as JSON, or nothing.
#
# NOT `plutil -extract`: it reads its argument as a KEY PATH and splits it
# on dots, so `com.apple.security.application-groups` is looked up as
# com → apple → security → … and comes back empty. Every entitlement key
# Apple defines is dotted, so a gate built on -extract reports "claims
# nothing" for everything — including a widget that is carrying its App
# Group perfectly well. Caught on the first real run, 2026-09-11: the
# check failed the build and the bundle was correct.
claims() {
  codesign -d --entitlements :- "$1" 2>/dev/null |
    plutil -convert json -o - - 2>/dev/null |
    python3 -c 'import json,sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(0)
v = d.get(sys.argv[1])
print("" if v in (None, [], False, "") else json.dumps(v))' "$2" 2>/dev/null || true
}

fail=0
for appex in "$APP_BUNDLE"/PlugIns/*.appex; do
  [ -d "$appex" ] || continue
  name=$(basename "$appex" .appex)
  groups=$(claims "$appex" com.apple.security.application-groups)
  keychain=$(claims "$appex" keychain-access-groups)
  case "$name" in
    MihrabLiveActivity)
      if [ -n "$groups" ] || [ -n "$keychain" ]; then
        warn "$name claims entitlements it must not:"
        [ -n "$groups" ]   && warn "    app groups: $groups"
        [ -n "$keychain" ] && warn "    keychain:   $keychain"
        warn "  This is the builds 520-522 failure, caught before export."
        warn "  A Live Activity reads no shared storage. Empty its"
        warn "  entitlements file (ios/MihrabLiveActivity/) rather than"
        warn "  granting the App ID a capability it does not need —"
        warn "  App Groups cannot be attached through the API at all."
        fail=1
      else
        say "  $name claims nothing — correct."
      fi
      ;;
    PrayerWidgetExtension)
      [ -n "$groups" ] || { warn "$name has LOST its App Group; its widgets will draw empty."; fail=1; }
      [ -n "$groups" ] && say "  $name carries its App Group — correct."
      ;;
    *)
      say "  $name: unrecognised extension, entitlements not asserted."
      ;;
  esac
done
[ "$fail" = 0 ] || die "Entitlement check failed — not exporting. See above."

# The app itself is checked last, because its two entitlements are what
# the sync identity and every widget payload depend on. A build that
# quietly lost them installs and runs and is wrong: new Keychain
# identity, empty widgets. That is what shipped as macOS 2.11.0.
app_groups=$(claims "$APP_BUNDLE" com.apple.security.application-groups)
app_keychain=$(claims "$APP_BUNDLE" keychain-access-groups)
[ -n "$app_groups" ]   || die "The app has no App Group: widgets would draw empty."
[ -n "$app_keychain" ] || die "The app has no keychain access group: it would generate a new sync identity on install."
say "  Mihrab.app carries its App Group and keychain group — correct."

# ── Export ────────────────────────────────────────────────────────────
cat > ios/build/appstore/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

say "Exporting a signed .ipa…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT" \
  -exportOptionsPlist ios/build/appstore/ExportOptions.plist \
  -allowProvisioningUpdates \
  "${AUTH[@]}" \
  -quiet || die "Export failed.

  The one-line summary above is rarely the real message. The export
  log is the file to read:
      $EXPORT/../DistributionSummary.plist
      ~/Library/Logs/gym  (if present)
  and for the profile/entitlement class of failure, the text to look
  for is 'Automatic signing cannot register bundle identifier' or
  'provisioning profile … doesn't include the entitlement'."

IPA=$(find "$EXPORT" -maxdepth 1 -name '*.ipa' | head -1)
[ -n "$IPA" ] || die "Export reported success but produced no .ipa in $EXPORT."
say "Exported $(basename "$IPA") ($(du -h "$IPA" | cut -f1))"

# ── Validate, then upload ─────────────────────────────────────────────
#
# Validation asks App Store Connect the same questions the upload will,
# and answers in seconds rather than after the bytes have gone. Almost
# every rejection worth knowing about — a duplicate build number, a
# closed version train, a missing icon, an appex with no matching App ID
# — comes back here.
say "Validating with App Store Connect…"
if ! xcrun altool --validate-app -f "$IPA" -t ios \
      --apiKey "$KEY_ID" --apiIssuer "$ISSUER" 2>&1 | tee /tmp/mihrab-validate.log; then
  warn "Validation failed. The full response is in /tmp/mihrab-validate.log."
  grep -iE "error|message" /tmp/mihrab-validate.log | head -10 >&2 || true
  die "Not uploading a build App Store Connect has already refused."
fi
say "Validation passed."

if [ "$UPLOAD" = 0 ]; then
  say "--no-upload: stopping here. The signed build is at $IPA"
  exit 0
fi

say "Uploading… (this is the slow part; the .ipa is $(du -h "$IPA" | cut -f1))"
if ! xcrun altool --upload-app -f "$IPA" -t ios \
      --apiKey "$KEY_ID" --apiIssuer "$ISSUER" 2>&1 | tee /tmp/mihrab-upload.log; then
  warn "Upload failed. The full response is in /tmp/mihrab-upload.log."
  grep -iE "error|message" /tmp/mihrab-upload.log | head -10 >&2 || true
  die "The archive is fine and is still at $IPA — retry the upload alone:
      xcrun altool --upload-app -f '$IPA' -t ios --apiKey $KEY_ID --apiIssuer $ISSUER"
fi

cat <<DONE

✓ Mihrab $VERSION ($BUILD) uploaded to App Store Connect.

  Processing takes a few minutes before the build appears in TestFlight.
  Nothing is submitted for review by this script — that stays a decision
  a person makes in App Store Connect.

  Worth remembering: this was signed against profiles already on this
  Mac. It is a real build and a real upload, and it is still not proof
  that a clean-checkout Xcode Cloud run would be green.
DONE
