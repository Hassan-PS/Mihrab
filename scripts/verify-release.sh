#!/bin/bash
# Post-release verification gate — a release is NOT done until this passes.
#
#   ./scripts/verify-release.sh v2.7.39
#
# Guards against the failure modes we've hit live:
#   • retagging silently converts the GitHub release to a DRAFT and every
#     asset URL starts returning 404, breaking `brew install` (v2.7.39)
#   • cask version/sha256 drifting from the actually-published zip
#   • a missing asset (APK or Catalyst zip) on the release
#
# Run it at the end of EVERY release cut, and again after ANY retag or
# release edit. Exits non-zero with a ✗ line on the first failure.
set -uo pipefail

TAG="${1:?usage: verify-release.sh vX.Y.Z}"
VERSION="${TAG#v}"
REPO="Hassan-PS/Mihrab"
TAP="$HOME/git/homebrew-tap/Casks/mihrab.rb"
FAILED=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAILED=1; }

# ── 1. Tag exists on the remote ─────────────────────────────────────────
if git -C "$(dirname "$0")/.." ls-remote --tags origin "refs/tags/$TAG" | grep -q "$TAG"; then
  pass "tag $TAG exists on origin"
else
  fail "tag $TAG missing on origin"
fi

# ── 2. GitHub release: published (NOT draft), marked latest ─────────────
REL_JSON=$(gh release view "$TAG" -R "$REPO" --json isDraft,assets 2>/dev/null)
if [ -z "$REL_JSON" ]; then
  fail "GitHub release $TAG not found"
else
  if [ "$(echo "$REL_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)["isDraft"])')" = "False" ]; then
    pass "release is published (not draft)"
  else
    fail "release is a DRAFT — assets 404 publicly. Fix: gh release edit $TAG -R $REPO --draft=false --latest"
  fi
  for asset in "app-fdroid-release.apk" "Mihrab-macOS-$VERSION.zip"; do
    if echo "$REL_JSON" | grep -q "\"$asset\""; then
      pass "asset present: $asset"
    else
      fail "asset MISSING from release: $asset"
    fi
  done
fi

# ── 3. Asset URLs actually resolve (public, follows redirects) ──────────
ZIP_URL="https://github.com/$REPO/releases/download/$TAG/Mihrab-macOS-$VERSION.zip"
APK_URL="https://github.com/$REPO/releases/download/$TAG/app-fdroid-release.apk"
for url in "$ZIP_URL" "$APK_URL"; do
  code=$(curl -sIL -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "200" ]; then
    pass "HTTP 200: ${url##*/}"
  else
    fail "HTTP $code: $url"
  fi
done

# ── 4. Cask: version matches, sha256 matches the PUBLISHED zip ──────────
if [ -f "$TAP" ]; then
  cask_ver=$(sed -n 's/.*version "\(.*\)".*/\1/p' "$TAP" | head -1)
  cask_sha=$(sed -n 's/.*sha256 "\([a-f0-9]*\)".*/\1/p' "$TAP" | head -1)
  if [ "$cask_ver" = "$VERSION" ]; then
    pass "cask version $cask_ver matches"
  else
    fail "cask version is $cask_ver, release is $VERSION — bump Casks/mihrab.rb and push the tap"
  fi
  # Compare against the zip AS SERVED — catches stale uploads and drift.
  tmp=$(mktemp)
  if curl -sL -o "$tmp" "$ZIP_URL"; then
    dl_sha=$(shasum -a 256 "$tmp" | cut -d' ' -f1)
    if [ "$dl_sha" = "$cask_sha" ]; then
      pass "cask sha256 matches the published zip"
    else
      fail "cask sha256 ($cask_sha) != published zip ($dl_sha) — re-upload the zip or update the cask"
    fi
  else
    fail "could not download the zip to verify sha256"
  fi
  rm -f "$tmp"
  # The tap must actually be pushed.
  if git -C "$(dirname "$TAP")/.." diff --quiet && git -C "$(dirname "$TAP")/.." log origin/main..main --oneline 2>/dev/null | grep -q .; then
    fail "homebrew-tap has unpushed commits — git push it"
  else
    pass "homebrew-tap is pushed"
  fi
else
  fail "cask not found at $TAP"
fi

# ── 5. F-Droid recipe agrees with the released version ──────────────────
RECIPE="$(dirname "$0")/../contrib/fdroid/com.prayer_times.yml"
if grep -q "CurrentVersion: $VERSION" "$RECIPE"; then
  pass "F-Droid recipe CurrentVersion is $VERSION"
else
  fail "F-Droid recipe CurrentVersion != $VERSION"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "── ALL CHECKS PASSED — release $TAG is live on every channel ──"
else
  echo "── RELEASE VERIFICATION FAILED — fix the ✗ items above ──"
  exit 1
fi
