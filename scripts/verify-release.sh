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
PENDING=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAILED=1; }
# Neither. A check that has not finished has not passed, and printing a ✓
# next to "still building" is exactly how 2.13.0 was called done.
pend() { echo "⧗ $1"; PENDING=1; }

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
  for asset in "Mihrab-v$VERSION-fdroid.apk" "Mihrab-macOS-$VERSION.zip"; do
    if echo "$REL_JSON" | grep -q "\"$asset\""; then
      pass "asset present: $asset"
    else
      fail "asset MISSING from release: $asset"
    fi
  done
fi

# ── 3. Asset URLs actually resolve (public, follows redirects) ──────────
ZIP_URL="https://github.com/$REPO/releases/download/$TAG/Mihrab-macOS-$VERSION.zip"
APK_URL="https://github.com/$REPO/releases/download/$TAG/Mihrab-v$VERSION-fdroid.apk"
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

    # ── 4a. THE CASK RESTARTS THE WIDGET DAEMON ────────────────────────
    #
    # Replacing the app in place freezes every widget AND every gallery
    # preview: chronod validates its archived timelines against the bundle
    # that produced them, and after an upgrade every reload fails with
    # `bundleStubNotSupported ("Bundle version did not match")`. It does not
    # recover — measured 2026-08-28, retries pushed out an hour and then a
    # full day while the cards kept drawing pre-upgrade data.
    #
    # Nothing in the app can prevent it: two consecutive builds with no
    # localized-string keys left in any archived view froze exactly the
    # same. `lsregister -f -R` does not clear it either. Restarting chronod
    # does, every time, and the cask's postflight is the only code that runs
    # at the moment the app is replaced.
    #
    # So this is a release gate, not a nicety. Without it every Mac user's
    # widgets stop at the version they upgraded FROM.
    if grep -q "postflight" "$TAP" && grep -q "chronod" "$TAP"; then
      pass "cask restarts chronod after install"
    else
      fail "cask has no chronod postflight — every Mac upgrading to $TAG freezes its widgets"
    fi

    # ── AND IT MUST RE-REGISTER THE WIDGET EXTENSION ──────────────────
    #
    # A second failure at the same moment, with a worse outcome. Replacing
    # the app deletes the bundle the extension lived in, and PlugInKit's
    # record — keyed by bundle identifier — goes with it. Nothing brings it
    # back: measured 2026-08-29 after a `brew upgrade` to 2.13.3,
    # `pluginkit -mAvvv` listed no Mihrab extension and `lsregister -f
    # /Applications/Mihrab.app` did not change that. With no registered
    # provider WidgetKit does not draw a stale card, it drops the widget —
    # so every placed widget was REMOVED from Notification Center and the
    # app left the gallery, on every single upgrade, until the user
    # happened to launch the app.
    #
    # `pluginkit -a` is the registration a launch would have done. It is a
    # release gate for the same reason the chronod line is: the cask is the
    # only code that runs at the moment the app is replaced.
    if grep -q "pluginkit" "$TAP"; then
      pass "cask re-registers the widget extension"
    else
      fail "cask does not re-register the widget extension — every Mac upgrading to $TAG loses its placed widgets"
    fi

    # ── 4b. THE PUBLISHED APP IS ACTUALLY SIGNED WITH THE DEVELOPER ID ──
    #
    # Checked on what is SERVED, not on what is sitting in ios/build, because
    # the two came apart once and nothing noticed. 2.11.0 went out ad-hoc:
    # `codesign --verify --strict` passed, notarization was never reached,
    # and the app had no team identifier — so codesign had silently dropped
    # every entitlement. No App Group, so no widget payload; no widget host,
    # so nothing in the gallery; no Keychain access, so a brand new sync
    # identity that orphaned the old device's file in every user's shared
    # folder. All of it invisible from the release process, which reported
    # success on every channel.
    #
    # A signature is the one property of a macOS build that cannot be
    # inspected from the repo, so it is checked here, against the artifact
    # a user would actually download.
    unz=$(mktemp -d)
    if ditto -xk "$tmp" "$unz" 2>/dev/null && [ -d "$unz/Mihrab.app" ]; then
      sig=$(codesign -dv "$unz/Mihrab.app" 2>&1)
      team=$(printf '%s' "$sig" | sed -n 's/^TeamIdentifier=//p')
      if printf '%s' "$sig" | grep -q "adhoc"; then
        fail "the published app is AD-HOC SIGNED — no entitlements, no App Group, no widgets. Rebuild with a Developer ID and re-upload."
      elif [ -z "$team" ] || [ "$team" = "not set" ]; then
        fail "the published app has no TeamIdentifier — every entitlement was dropped at signing. Rebuild and re-upload."
      else
        pass "published app signed by team $team"
      fi
      # The entitlement the widgets live or die by, read off the shipped
      # bundle rather than the repo's entitlements file.
      if codesign -d --entitlements - --xml "$unz/Mihrab.app" 2>/dev/null |
          grep -q "group.com.prayerapp"; then
        pass "published app carries the App Group"
      else
        fail "published app has NO App Group — its widgets will not render"
      fi

      # ── AND IT IS NOTARIZED, WITH THE TICKET IN THE BUNDLE ──────────
      #
      # Eight releases, 2.11.0 to 2.13.3, went out unnotarized: Gatekeeper
      # refused the first launch of every Mac install and the cask carried
      # a caveat apologising for it. The step lived in a comment asking a
      # human to run notarytool after the build, so it did not happen.
      #
      # Checked here on the DOWNLOADED zip, which is the only copy whose
      # verdict matters — a ticket stapled to the bundle in ios/build says
      # nothing about the bytes a user gets. The ticket is issued by Apple
      # for one exact cdhash, so one that validates against this bundle is
      # the notarization; and stapling is the half that gets skipped, since
      # notarized-but-unstapled passes on any Mac that can reach Apple and
      # blocks a user who cannot.
      #
      # Deliberately NOT `spctl -a`: assessing a bundle unpacked into a temp
      # directory hands it to App Translocation, and the translocated
      # .appex that gets registered takes the installed app's plugin
      # registration down with it — every widget on the machine running
      # this script goes blank. Measured 2026-08-29.
      if xcrun stapler validate "$unz/Mihrab.app" >/dev/null 2>&1; then
        pass "published app is notarized, ticket stapled"
      else
        fail "published app carries NO notarization ticket — macOS blocks its first launch, as it has since 2.11.0"
      fi
    else
      fail "could not unpack the published zip to check its signature"
    fi
    # UNREGISTER BEFORE REMOVING. Unpacking an .app into a temp directory is
    # by itself enough to put it in the LaunchServices database — no launch
    # and no Gatekeeper call needed — and a record pointing at a path that
    # no longer exists blanks every widget on this Mac. Measured 2026-08-29;
    # this block had been leaving one behind on every release.
    LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
    [ -x "$LSREG" ] && { "$LSREG" -u "$unz/Mihrab.app" 2>/dev/null || true; }
    rm -rf "$unz"
    # AND PUT THE INSTALLED WIDGET BACK. That unregister takes a path but
    # drops records by BUNDLE IDENTITY, and it lands lazily — so it takes
    # the plugin registration of /Applications/Mihrab.app with it, minutes
    # later, long after any check here would have looked. Measured
    # 2026-08-29: the widgets on this Mac went blank and then vanished from
    # the gallery, from exactly this shape of command.
    #
    # Captured rather than piped into `grep -q`: grep exits on the first
    # line, pluginkit takes SIGPIPE, and under `pipefail` a registered
    # extension reads as missing.
    ext=/Applications/Mihrab.app/Contents/PlugIns/PrayerWidgetExtension.appex
    extid=maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension
    if [ -d "$ext" ]; then
      for _ in 1 2 3 4 5 6 7 8; do
        pluginkit -a "$ext" >/dev/null 2>&1 || true
        sleep 3
        seen="$(pluginkit -m -i "$extid" 2>/dev/null || true)"
        [ -n "$seen" ] && break
      done
      if [ -n "${seen:-}" ]; then
        pass "this Mac's own Mihrab widget extension is still registered"
      else
        fail "this Mac's widget extension is NOT registered — its widgets will be blank. See docs/release/catalyst-widgets.md"
      fi
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

# ── 6. The website names this version ───────────────────────────────────
# Checked twice on purpose: in the repo (what we committed) and on the live
# page (what a visitor actually reads). The site advertised an old release
# for three versions because nothing looked at either.
SITE="$(dirname "$0")/../docs/index.html"
if grep -q "Version $VERSION (" "$SITE" && grep -q "Mihrab $VERSION (" "$SITE"; then
  pass "docs/index.html names $VERSION"
else
  fail "docs/index.html does not name $VERSION — run: node scripts/sync-version.js"
fi

LIVE="$(curl -fsS --max-time 20 "https://mihrab.elghamri.se/?bust=$$" 2>/dev/null || true)"
if [ -z "$LIVE" ]; then
  fail "could not fetch the live site to check its version"
elif printf '%s' "$LIVE" | grep -q "Version $VERSION ("; then
  pass "live site serves $VERSION"
else
  # Say WHICH of the two failures this is, or the next person re-reads the
  # stamping script looking for a bug that is not there. If the committed
  # file is right (checked just above) and the served copy is old, the
  # deploy has not happened — that is GitHub's side, not ours.
  fail "live site is NOT serving $VERSION"
  SERVED=$(printf '%s' "$LIVE" | grep -oE 'Version [0-9.]+ \([0-9]+\)' | head -1)
  MOD=$(curl -sI "https://mihrab.elghamri.se/?bust=$$" | sed -n 's/^[Ll]ast-[Mm]odified: //p' | tr -d '\r')
  BUILD=$(gh api "repos/$REPO/pages/builds/latest" --jq '.status' 2>/dev/null || echo "unknown")
  PAGES=$(curl -s --max-time 10 https://www.githubstatus.com/api/v2/components.json 2>/dev/null \
    | python3 -c 'import json,sys;print(next((c["status"] for c in json.load(sys.stdin)["components"] if c["name"]=="Pages"),"unknown"))' 2>/dev/null || echo "unknown")
  echo "    served: ${SERVED:-none}   last-modified: ${MOD:-unknown}"
  echo "    latest Pages build: $BUILD   |   GitHub Pages status: $PAGES"
  if [ "$PAGES" != "operational" ]; then
    echo "    → Pages is not operational. The repo is right; the deploy is stuck on GitHub."
    echo "      Once it recovers: gh api -X POST repos/$REPO/pages/builds"
  else
    echo "    → Ask for a rebuild: gh api -X POST repos/$REPO/pages/builds"
  fi
fi

# ── 7. Store release notes exist for this versionCode ───────────────────
CODE="$(grep -m1 'versionCode' "$(dirname "$0")/../android/app/build.gradle" | tr -dc '0-9')"
for LOCALE in en-US sv-SE ar; do
  NOTE="$(dirname "$0")/../fastlane/metadata/android/$LOCALE/changelogs/$CODE.txt"
  if [ ! -f "$NOTE" ]; then
    fail "missing Play release notes: $LOCALE/changelogs/$CODE.txt"
  elif [ "$(wc -m < "$NOTE" | tr -d ' ')" -gt 500 ]; then
    fail "$LOCALE/changelogs/$CODE.txt is over Play's 500-character limit"
  else
    pass "Play release notes present for $LOCALE ($CODE)"
  fi
done

# ── 6. THE iOS CHANNEL ACTUALLY SHIPPED ────────────────────────────────
#
# The channel this file used to have no opinion about, and the one that
# fails most quietly. Everything above is fast and visible; an Xcode Cloud
# run takes half an hour and finishes after you have stopped looking.
#
# 2.13.0 is why this is here. Run #549 archived fine — ** ARCHIVE
# SUCCEEDED **, a 93 MB archive artifact, not a single ERROR-level issue
# recorded against it — and then ERRORED eleven minutes later in the step
# that uploads to App Store Connect. This script passed the release, said
# "live on every channel", and iPhone and iPad never got it.
#
# Three outcomes, because "not there yet" and "never going to be there"
# are different facts: a run still going is not a failure, and a version
# with nothing building it is.
XC="$(dirname "$0")/xcode-cloud.py"
if [ -f "$XC" ]; then
  # Hand it the tagged commit. Without it the check cannot tell "Xcode
  # Cloud has not seen this push yet" — true for the first couple of
  # minutes, i.e. exactly when release.sh runs this — from "it never
  # will", and 2.13.1 was reported as an iOS failure while its run was
  # starting on that very commit.
  xc_sha=$(git rev-parse -q --verify "$TAG^{commit}" 2>/dev/null || true)
  xc_out=$(python3 "$XC" shipped "$VERSION" ${xc_sha:+"$xc_sha"} 2>&1); xc_rc=$?
  case "$xc_rc" in
    0) pass "iOS: $xc_out" ;;
    3) pend "iOS: $xc_out" ;;
    *) fail "iOS: $xc_out" ;;
  esac
else
  fail "scripts/xcode-cloud.py is missing — cannot tell whether iOS shipped"
fi

# ── 8. CI IS GREEN ON THE COMMIT THAT WAS RELEASED ─────────────────────
#
# Local jest and tsc are not CI. CI runs on a clean Linux checkout with a
# fresh npm install, none of this machine's caches and none of its build
# artefacts, and it is the copy everybody else reads to decide whether the
# tree is healthy.
#
# Nobody was reading it. Every release from 2.13.1 onward went red on
# GitHub for one reason — release.sh writes `_(unfilled)_` into the
# journal and a test asserted that marker never appears — and four
# consecutive failure mails arrived without anyone connecting them to the
# release that sent them. A permanently red main teaches people to stop
# opening CI at all, which costs more than the failure it is reporting.
#
# The tag's own commit, not main's newest: F-Droid builds from the tag, and
# main moving on afterwards does not make the tag green. Same three
# outcomes as iOS above, for the same reason — release.sh calls this
# seconds after the push, when the run has not started, and "not finished
# yet" is not a verdict.
#
# -q --verify, not a bare rev-parse: on an unknown ref a bare rev-parse
# prints the argument back and exits 1, so `|| true` hands you the string
# "v9.9.9^{commit}" as a SHA and the check goes looking for its runs.
CI_SHA="$(git -C "$(dirname "$0")/.." rev-parse -q --verify "$TAG^{commit}" 2>/dev/null || true)"
CI_SHORT="${CI_SHA:0:7}"
if [ -z "$CI_SHA" ]; then
  fail "CI: cannot resolve $TAG to a commit locally — 'git fetch --tags' first"
else
  CI_ROW="$(gh run list --workflow=ci.yml --commit "$CI_SHA" -R "$REPO" --limit 1 \
    --json status,conclusion,url \
    --jq '.[0] // empty | "\(.status)|\(.conclusion)|\(.url)"' 2>/dev/null || true)"
  CI_STATUS="${CI_ROW%%|*}"
  CI_REST="${CI_ROW#*|}"
  CI_CONCLUSION="${CI_REST%%|*}"
  CI_RUN_URL="${CI_REST##*|}"
  if [ -z "$CI_ROW" ]; then
    pend "CI: no run on $CI_SHORT yet — re-run once GitHub has picked the push up"
  elif [ "$CI_STATUS" != "completed" ]; then
    pend "CI: $CI_STATUS on $CI_SHORT — $CI_RUN_URL"
  else
    case "$CI_CONCLUSION" in
      success)
        pass "CI: green on $CI_SHORT" ;;
      failure|timed_out|startup_failure)
        fail "CI: $CI_CONCLUSION on the released commit $CI_SHORT — $CI_RUN_URL" ;;
      *)
        # cancelled, skipped, neutral, action_required: finished without
        # deciding anything. Reporting that as a pass would be a lie and
        # as a failure would be a false alarm.
        pend "CI: $CI_CONCLUSION on $CI_SHORT — no verdict — $CI_RUN_URL" ;;
    esac
  fi
fi

echo
if [ "$FAILED" = "0" ] && [ "$PENDING" = "1" ]; then
  # Not a failure, and not "live on every channel" either. Saying the
  # second while iOS is mid-build is how 2.13.0 was called finished. The
  # same now goes for CI: a run that has not finished has not passed.
  echo "── EVERY FINISHED CHECK PASSED — something above is still running (marked ⧗), re-run this when it lands ──"
elif [ "$FAILED" = "0" ]; then
  echo "── ALL CHECKS PASSED — release $TAG is live on every channel ──"
else
  echo "── RELEASE VERIFICATION FAILED — fix the ✗ items above ──"
  exit 1
fi
