#!/bin/bash
# Cut a release, in an order that cannot strand one.
#
#   ./scripts/release.sh 2.13.2              # the whole thing
#   ./scripts/release.sh 2.13.2 --dry-run    # everything up to the first
#                                            #   irreversible step, then stop
#   ./scripts/release.sh --unreleased        # what is on main and has never
#                                            #   shipped
#
# ── WHY THIS EXISTS ───────────────────────────────────────────────────
#
# It replaces a thirteen-step checklist in docs/DISTRIBUTION.md that was
# run by hand every time. Every release incident this project has had came
# from that: not from anyone being careless, but from a list of steps being
# the wrong tool for a job with an irreversible step in the middle of it.
#
#   • 2.11.0 SHIPPED AD-HOC SIGNED. `SIGN_IDENTITY` was not set, a gate
#     written `!= "-"` let it through, and codesign silently dropped every
#     entitlement: no App Group so no widget data, no widget host so
#     nothing in the gallery, no Keychain so a brand-new sync identity that
#     orphaned the old device's file in every shared folder. Signature
#     verification passed. Notarization was never reached. The checklist
#     did not mention signing at all.
#
#   • A TAG WAS PUSHED BEFORE `main` LANDED. The push failed, the tag did
#     not, and a pushed tag must never be moved — so the history had to be
#     merged around it rather than rebased.
#
#   • PLAY REJECTED THE RELEASE NOTES for being over 500 characters, and
#     that was found by `verify-release.sh` AFTER the tag and the GitHub
#     release were already public. It is a thing you can know before you
#     start.
#
#   • FIXES SAT ON `main` FOR DAYS, released to nobody, because nothing
#     ever said so out loud. Hence `--unreleased`, and hence the log this
#     prints before it asks for anything.
#
#   • macOS WIDGETS FROZE ON EVERY UPGRADE and the cask postflight that
#     fixes it was not in any checklist, because the checklist predates
#     the Mac build entirely.
#
# ── THE ONE RULE ──────────────────────────────────────────────────────
#
# Everything that can fail happens BEFORE anything that cannot be undone.
# Tests, changelog limits, signing, the built artifacts' own version
# stamps — all of it is checked while the only cost of stopping is your
# time. `git push`, the tag, the GitHub release and the tap come after,
# in that order, because each is recoverable only by the one before it
# having already succeeded.
set -uo pipefail

REPO="Hassan-PS/Mihrab"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAP="$HOME/git/homebrew-tap/Casks/mihrab.rb"
GRADLE_FILE="$ROOT/android/app/build.gradle"
PBXPROJ="$ROOT/ios/PrayerApp.xcodeproj/project.pbxproj"
LOCALES="en-US sv-SE ar"
JDK="/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"

# ── grep AFTER capturing, never through a pipe ────────────────────────
#
# `set -o pipefail` plus `cmd | grep -q` is a trap, and this script fell
# into it on its first real run: `grep -q` exits the moment it matches, the
# producer gets SIGPIPE, and the pipeline reports 141. A correctly signed
# app was reported as unsigned. Worse were the silent ones — the duplicate
# tag check and the Xcode Cloud guard would have read "found" as "not
# found" and waved a bad release through.
#
# So: capture, then test. `has <haystack> <needle>` exists to make the
# right thing shorter than the wrong one.
has() { case "$1" in *"$2"*) return 0 ;; *) return 1 ;; esac; }

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
step() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }
ok()   { printf "  ✓ %s\n" "$1"; }

# ── PUT THE MACHINE BACK THE WAY IT WAS FOUND ─────────────────────────
#
# A release starts several long-lived things and, until this was written,
# finished without stopping any of them. Still running hours after the
# 2.13.4 cut: a Gradle daemon holding 2 GB, seven orphaned `jest-worker`
# children, a Metro dev server, and — the one that matters —
#
#   57114 …/ios/build/catalyst-dist/Mihrab.app/…/PrayerWidgetExtension
#
# a widget extension running out of a bundle `build-catalyst.sh` had
# already deleted. That is not untidiness, it is the same failure as a
# stale LaunchServices record in process form: a live widget provider for
# this bundle identifier, answering from a path nothing else agrees with,
# beside the installed copy that is supposed to be serving the widgets.
# build-catalyst.sh reaps its own now; this catches what an interrupted or
# failed build left behind, and the rest is hygiene.
#
# EVERYTHING NAMED HERE BELONGS TO THIS REPO. Scoped to "$ROOT" on purpose
# — no `killall java`, no `pkill node`. A release must not reach into work
# that has nothing to do with it.
#
# `if`, not `[ … ] && return`: under `set -e` an AND-list whose left side
# fails takes the whole script down, which is the same class of mistake as
# the pipeline note above and just as quiet.
reap() {  # <what> <pgrep -f pattern>
  local pids
  # `|| true` INSIDE the substitution. `pgrep` exits 1 when it matches
  # nothing, which is the ordinary case here, and with `pipefail` that 1
  # becomes the pipeline's and then the assignment's — so `set -e` ends the
  # release at the first pattern that finds nothing. Caught by running this
  # function against a decoy: it reaped the decoy, printed its line, and
  # exited 1 on the next reap. A cleanup step that kills the release it is
  # tidying up after would have been a fine way to learn this.
  pids=$(pgrep -f "$2" 2>/dev/null | tr '\n' ' ' | sed 's/ *$//' || true)
  if [ -z "$pids" ]; then return 0; fi
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
  ok "stopped $1 ($pids)"
}

# ── AND PUT THE INSTALLED WIDGET BACK ─────────────────────────────────
#
# `lsregister -u <path>` takes a PATH and drops records by BUNDLE IDENTITY,
# and it does it LAZILY. Unregistering a temp copy called `Mihrab.app`
# therefore takes the plugin registration of the copy in /Applications with
# it — minutes later, so a check run straight afterwards reports everything
# fine and means nothing.
#
# Measured the hard way on 2026-08-29. A throwaway `Mihrab.app` was
# unregistered, `pluginkit` was checked immediately and listed the
# installed extension; a few minutes later the user's widgets were blank,
# and then gone from the gallery entirely. `lsregister -u` is used in three
# places in this cycle — here, in `verify-release.sh`, and in
# `build-catalyst.sh` — and each one is a chance to take the widgets down
# on the machine cutting the release.
#
# So: after any unregister, assert the installed extension back, and verify
# it STAYED rather than that the command returned 0.
#
# Captured, not piped, for the third time in this file: `pluginkit -m … |
# grep -q .` makes grep exit on the first line, pluginkit take SIGPIPE and
# `pipefail` report 141 — a registered extension read as missing, and a
# loop that can never break.
keep_installed_widget_registered() {
  local app=/Applications/Mihrab.app
  local ext="$app/Contents/PlugIns/PrayerWidgetExtension.appex"
  local id=maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension
  local i seen
  if [ ! -d "$ext" ]; then return 0; fi
  for i in 1 2 3 4 5 6 7 8; do
    pluginkit -a "$ext" >/dev/null 2>&1 || true
    sleep 3
    seen="$(pluginkit -m -i "$id" 2>/dev/null || true)"
    if [ -n "$seen" ]; then return 0; fi
  done
  printf "  ⚠ %s\n" "/Applications/Mihrab.app's widget extension is not registered — its widgets will be blank. See docs/release/catalyst-widgets.md." >&2
  return 0
}

cleanup_workbench() {
  step "Cleanup"
  reap "the app and widget extension left running from ios/build" \
       "$ROOT/ios/build/.*Mihrab\.app/Contents"
  reap "orphaned jest workers" "$ROOT/node_modules/jest-worker"
  reap "the Metro dev server for this repo" \
       "$ROOT/node_modules/.bin/react-native start"
  # Captured, then tested — `… --stop | grep -q Daemon` is the pipeline the
  # comment above `has()` is about: grep exits on the first match, gradlew
  # takes SIGPIPE, and `pipefail` reports 141 for a daemon that stopped
  # perfectly well.
  if [ -x "$ROOT/android/gradlew" ]; then
    local stopped
    stopped="$(JAVA_HOME="$JDK" "$ROOT/android/gradlew" --stop 2>/dev/null || true)"
    has "$stopped" "Daemon" && ok "stopped the Gradle daemon" || true
  fi
  # Last word on the way out: whatever else this run did to LaunchServices,
  # the widgets on this Mac work when it finishes.
  keep_installed_widget_registered
  ok "nothing of this release's is still running"
}

# Every abort is recorded. A release cycle only improves from evidence
# about where it actually stops people, and nobody remembers the third
# failed attempt from two weeks ago. Gitignored — it is this machine's
# account of its own attempts, not a repo fact.
ATTEMPTS="$ROOT/.release-attempts.log"
die() {
  printf "%s\t%s\t%s\n" "$(date -u +%FT%TZ)" "${VERSION:-?}" "$1" >>"$ATTEMPTS"
  printf "\n  ✗ %s\n\n" "$1" >&2
  exit 1
}

# The files that ARE the release cycle. A release that changes one of
# these is a release that changed how releasing works, and the next
# person through deserves to know what it taught you.
# NOT fastlane/ — those are the release NOTES, which change every time by
# definition. Flagging them would mark every release as cycle-changing,
# and a signal that is always on is not a signal.
CYCLE_PATHS="scripts/release.sh scripts/verify-release.sh scripts/build-catalyst.sh scripts/sync-version.js scripts/xcode-cloud.py .github/workflows docs/DISTRIBUTION.md"
JOURNAL="$ROOT/docs/release-log.md"

# Everything phase 2 writes into the tree, so a run that stops partway can
# be undone in one line. The JOURNAL belongs in here: it is appended before
# the release commit, so a rerun after a failed publish would otherwise add
# a SECOND entry for the same version.
REVERT="git checkout -- android/app/build.gradle ios/PrayerApp.xcodeproj/project.pbxproj docs/index.html contrib/fdroid/com.prayer_times.yml docs/release-log.md"

current_version() { grep -o 'versionName "[^"]*"' "$GRADLE_FILE" | head -1 | cut -d'"' -f2; }
current_code()    { grep -o 'versionCode [0-9]*'  "$GRADLE_FILE" | head -1 | awk '{print $2}'; }

# ── --unreleased ──────────────────────────────────────────────────────
#
# The question that went unasked for days at a time. A fix that is merged
# and not shipped is, from the outside, a fix that was never made.
show_unreleased() {
  git -C "$ROOT" fetch --quiet --tags origin 2>/dev/null
  local last
  last=$(git -C "$ROOT" describe --tags --abbrev=0 --match 'v*' 2>/dev/null)
  if [ -z "$last" ]; then
    bold "No release tag found — everything on main is unreleased."
    return 0
  fi
  local n
  n=$(git -C "$ROOT" rev-list --count "$last"..main 2>/dev/null || echo 0)
  if [ "$n" = "0" ]; then
    bold "main is $last. Nothing unreleased."
    return 0
  fi
  bold "$n commit(s) on main since $last — released to nobody:"
  git -C "$ROOT" log --oneline --no-decorate "$last"..main | sed 's/^/  /'
  # The version in the tree, NOT the shipped one — they differ exactly when
  # a bump is sitting uncommitted, which is worth seeing rather than hiding.
  printf "\nLast tag %s.  Working tree says %s (%s).\n" \
    "$last" "$(current_version)" "$(current_code)"
}

if [ "${1:-}" = "--unreleased" ]; then
  show_unreleased
  exit 0
fi

VERSION="${1:-}"
DRY_RUN=0
[ "${2:-}" = "--dry-run" ] && DRY_RUN=1
[ -z "$VERSION" ] && die "usage: release.sh X.Y.Z [--dry-run] | release.sh --unreleased"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || die "version must be X.Y.Z, got '$VERSION'"

TAG="v$VERSION"
OLD_VERSION="$(current_version)"
OLD_CODE="$(current_code)"
CODE=$((OLD_CODE + 1))

# ══════════════════════════════════════════════════════════════════════
# PHASE 1 — PREFLIGHT.  Nothing is written. Everything that can say no
# says it here, while stopping costs nothing but the time already spent.
# ══════════════════════════════════════════════════════════════════════
bold "Releasing $OLD_VERSION ($OLD_CODE) → $VERSION ($CODE)"
step "Preflight"

for tool in gh git node python3; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done
ok "tools present"

cd "$ROOT" || die "cannot enter $ROOT"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "not on main"
# Untracked files are the author's business; STAGED or MODIFIED tracked
# files are not, because the release commit would sweep them up.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no | sed 's/^/    /'
  die "working tree has tracked changes — commit or stash them first"
fi
ok "on main, tracked files clean"

git fetch --quiet origin || die "cannot reach origin"
if [ -n "$(git rev-list origin/main..main --not --all 2>/dev/null)" ]; then :; fi
if [ -n "$(git rev-list main..origin/main 2>/dev/null)" ]; then
  die "origin/main has commits main does not — pull first"
fi
ok "main is not behind origin"

# A pushed tag is never moved in this project, so a tag that already
# exists is a hard stop rather than something to force past.
if git rev-parse "$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists locally"
fi
REMOTE_TAGS="$(git ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null)"
if has "$REMOTE_TAGS" "$TAG"; then
  die "tag $TAG already exists on origin — pick the next version"
fi
ok "$TAG is free"

[ "$VERSION" != "$OLD_VERSION" ] || die "version is already $VERSION"
ok "version moves $OLD_VERSION → $VERSION"

# Play's limit, checked BEFORE the tag rather than after. 2.13.0 went out
# with all three locales over it and the gate caught it only once the
# release was already public.
for loc in $LOCALES; do
  note="$ROOT/fastlane/metadata/android/$loc/changelogs/$CODE.txt"
  [ -f "$note" ] || die "missing release notes: $loc/changelogs/$CODE.txt"
  chars=$(wc -m < "$note" | tr -d ' ')
  [ "$chars" -le 500 ] \
    || die "$loc/changelogs/$CODE.txt is $chars characters — Play's limit is 500"
  ok "release notes for $loc ($chars chars)"
done

# The cask is the only code that runs when a Mac replaces the app, and it
# is what stops the widgets freezing on upgrade — and, since 2026-08-29,
# what stops them being removed outright. See verify-release.sh 4a.
if [ -f "$TAP" ]; then
  CASK_SRC="$(cat "$TAP")"
  { has "$CASK_SRC" "postflight" && has "$CASK_SRC" "chronod"; } \
    || die "cask has no chronod postflight — Macs upgrading to $TAG would freeze their widgets"
  ok "cask restarts chronod after install"
  has "$CASK_SRC" "pluginkit" \
    || die "cask does not re-register the widget extension — Macs upgrading to $TAG would LOSE their widgets"
  ok "cask re-registers the widget extension"
else
  die "cask not found at $TAP — clone the tap before releasing"
fi

# ── THE LAST RELEASE'S LESSON MUST BE WRITTEN ─────────────────────────
#
# This is the self-improvement step, and it is a gate rather than a
# reminder because reminders about process are the first thing a hurried
# release skips.
#
# A release that changed the cycle, or that had to be abandoned and
# restarted, gets an entry in docs/release-log.md with a `**Lesson:**`
# line left blank. The NEXT release will not start until that line says
# something. Everything else here is a check that stops a bad release;
# this is the one that stops a bad *cycle* — the same mistake being paid
# for twice because nobody wrote down what the first one cost.
#
# Clean, uneventful releases record "none needed" automatically and this
# never fires. It only asks when there was actually something to learn.
#
# ANCHORED, and this needed catching: the file explains itself by quoting
# `_(unfilled)_` in its own header, so a substring test matched the
# documentation and would have blocked every release for ever. The marker
# is a whole line, and only a whole line counts.
if [ -f "$JOURNAL" ]; then
  UNFILLED=$(grep -n '^\*\*Lesson:\*\* _(unfilled)_$' "$JOURNAL" | tail -1 | cut -d: -f1)
  if [ -n "$UNFILLED" ]; then
    # Show the entry it belongs to, from its `## version` heading down.
    HEAD_LINE=$(awk -v end="$UNFILLED" 'NR<=end && /^## /{n=NR} END{print n+0}' "$JOURNAL")
    [ "$HEAD_LINE" -lt 1 ] && HEAD_LINE=1
    printf "\n"
    sed -n "${HEAD_LINE},${UNFILLED}p" "$JOURNAL" | sed 's/^/    /'
    die "the last release left its lesson unwritten — fill in that '**Lesson:**' line in docs/release-log.md, commit it, and rerun"
  fi
fi
ok "the last release's lesson is written down"

step "Tests"
NODE_ENV=test npx jest --silent >/dev/null 2>&1 || die "jest failed — run 'NODE_ENV=test npx jest'"
ok "jest"
npx tsc --noEmit >/dev/null 2>&1 || die "tsc failed — run 'npx tsc --noEmit'"
ok "tsc"

# One workflow, started by a push to main. A second run started while one
# is live kills both ("An update has been initiated by another request"),
# which is how 2.12.0's iOS build was lost.
XC_RUNS="$(python3 "$ROOT/scripts/xcode-cloud.py" runs 1 2>/dev/null)"
if has "$XC_RUNS" "PENDING" || has "$XC_RUNS" "RUNNING"; then
  die "an Xcode Cloud run is already in flight — let it finish, or it and the release build will kill each other"
fi
ok "no Xcode Cloud run in flight"

step "What this ships"
show_unreleased

# Which of the shipping commits touched the cycle itself.
LAST_TAG=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null)
CYCLE_TOUCHED=""
if [ -n "$LAST_TAG" ]; then
  # shellcheck disable=SC2086
  CYCLE_TOUCHED=$(git diff --name-only "$LAST_TAG"..HEAD -- $CYCLE_PATHS 2>/dev/null)
fi
if [ -n "$CYCLE_TOUCHED" ]; then
  printf "\n"
  bold "  This release CHANGES THE RELEASE CYCLE:"
  echo "$CYCLE_TOUCHED" | sed 's/^/    /'
  echo "    → its journal entry will ask what that changed, and the next"
  echo "      release will not start until you have answered."
fi

# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — BUILD.  Writes to the working tree and to ios/build, and
# nothing else. Everything here is `git checkout` away from undone.
# ══════════════════════════════════════════════════════════════════════
step "Stamping $VERSION ($CODE)"
sed -i '' "s/versionCode $OLD_CODE/versionCode $CODE/" "$GRADLE_FILE"
sed -i '' "s/versionName \"$OLD_VERSION\"/versionName \"$VERSION\"/" "$GRADLE_FILE"
sed -i '' "s/CURRENT_PROJECT_VERSION = $OLD_CODE;/CURRENT_PROJECT_VERSION = $CODE;/g" "$PBXPROJ"
sed -i '' "s/MARKETING_VERSION = $OLD_VERSION;/MARKETING_VERSION = $VERSION;/g" "$PBXPROJ"
node "$ROOT/scripts/sync-version.js" >/dev/null || die "sync-version failed"
[ "$(current_code)" = "$CODE" ] || die "gradle stamp did not take"
grep -q "MARKETING_VERSION = $VERSION;" "$PBXPROJ" || die "pbxproj stamp did not take"
ok "build.gradle, pbxproj, site and F-Droid recipe all say $VERSION ($CODE)"

step "Android"
# TWO INVOCATIONS, deliberately. The play and fdroid flavors have
# different signing config and manifest merges, and building them in one
# gradle run has produced an APK carrying the other flavor's settings.
( cd "$ROOT/android" && JAVA_HOME="$JDK" ./gradlew -q assemblePlayRelease bundlePlayRelease ) \
  || die "play build failed"
ok "play APK + AAB"
( cd "$ROOT/android" && JAVA_HOME="$JDK" ./gradlew -q assembleFdroidRelease ) \
  || die "fdroid build failed"
ok "fdroid APK"

# Ask the artifact what it thinks it is, rather than trusting the stamp.
APK="$ROOT/android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk"
AAB="$ROOT/android/app/build/outputs/bundle/playRelease/app-play-release.aab"
AAPT=$(ls "$HOME"/Library/Android/sdk/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)
if [ -n "$AAPT" ]; then
  badge=$("$AAPT" dump badging "$APK" 2>/dev/null | head -1)
  has "$badge" "versionCode='$CODE'"    || die "APK reports the wrong versionCode: $badge"
  has "$badge" "versionName='$VERSION'" || die "APK reports the wrong versionName: $badge"
  ok "APK badging confirms $VERSION ($CODE)"
fi

step "macOS (Catalyst)"
"$ROOT/scripts/build-catalyst.sh" >/tmp/release-catalyst.log 2>&1 \
  || { tail -20 /tmp/release-catalyst.log; die "catalyst build failed — /tmp/release-catalyst.log"; }
ZIP="$ROOT/ios/build/catalyst-dist/Mihrab-macOS-$VERSION.zip"
[ -f "$ZIP" ] || die "catalyst build produced no $ZIP"
ok "$(basename "$ZIP")"

# The 2.11.0 check, run on what is about to be PUBLISHED rather than on
# what happens to be in ios/build afterwards. An ad-hoc signature has no
# team identifier, and without one codesign drops every entitlement —
# which is invisible to `codesign --verify` and fatal to the widgets.
UNZIP=$(mktemp -d)
ditto -x -k "$ZIP" "$UNZIP" || die "cannot unpack $ZIP"
APP="$UNZIP/Mihrab.app"
SIG="$(codesign -dv "$APP" 2>&1)"
has "$SIG" "TeamIdentifier=GAW23HT439" \
  || die "the app about to be published is not signed by the Developer ID — this is the 2.11.0 failure"
ok "signed by team GAW23HT439"
ENTS="$(codesign -d --entitlements - --xml "$APP" 2>/dev/null)"
has "$ENTS" "group.com.prayerapp" \
  || die "no App Group entitlement — widgets would have no data"
ok "App Group sealed in"

# ── NOTARIZED, AND THE TICKET IS IN THE BUNDLE ────────────────────────
#
# 2.11.0 through 2.13.3 all shipped unnotarized — Gatekeeper refused the
# first launch of every Mac install for eight releases, and nothing said
# so, because notarization was a comment in build-catalyst.sh asking a
# human to run notarytool afterwards. It is part of that script now, and
# this is the check that makes the flag it honours unable to matter:
# SKIP_NOTARIZE builds a zip, and this refuses to publish it.
#
# `stapler validate` AND NOT `spctl`, on this unpacked copy. The ticket is
# issued by Apple's notary service for one exact cdhash, so a ticket that
# validates against this bundle is the notarization — and stapling is the
# half that gets skipped anyway: a notarized-but-unstapled build passes
# `spctl` on any Mac that can reach Apple and blocks a user who cannot.
#
# `spctl -a` here would be worse than redundant. Assessing a bundle in a
# temp directory hands it to App Translocation and REGISTERS the
# translocated path, and the .appex record that comes with it takes the
# installed app's plugin registration down with it — every widget on this
# Mac goes blank. Measured 2026-08-29. build-catalyst.sh runs the Gatekeeper
# assessment where it is safe to: on the bundle in ios/build that it
# already registers and cleans up.
xcrun stapler validate "$APP" >/dev/null 2>&1 \
  || die "the app about to be published carries no notarization ticket — Gatekeeper would block its first launch, as it has since 2.11.0"
ok "notarized, ticket stapled into the bundle"

# UNREGISTER BEFORE REMOVING. Unpacking an .app into a temp directory is by
# itself enough to put it in the LaunchServices database — no launch, no
# Gatekeeper call, just the extraction. Measured 2026-08-29: two `ditto -x`
# calls into mktemp directories left two registered Mihrab.app records
# behind. This block has been doing that on every release since it was
# written, and a record pointing at a path that no longer exists is exactly
# what makes every widget on the release machine go blank.
#
# `.app` only — see build-catalyst.sh on why `.appex` paths are never
# unregistered by hand.
LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[ -x "$LSREG" ] && { "$LSREG" -u "$APP" 2>/dev/null || true; }
rm -rf "$UNZIP"
# That unregister is by bundle identity and lands late — see
# keep_installed_widget_registered. Without this the release blanks the
# widgets on the machine cutting it.
keep_installed_widget_registered

if [ "$DRY_RUN" = "1" ]; then
  cleanup_workbench
  printf "\n"
  bold "Dry run. Everything that can fail has passed."
  echo "  Artifacts:"
  echo "    $APK"
  echo "    $AAB"
  echo "    $ZIP"
  echo
  echo "  The version bump is in your working tree. Undo it with:"
  echo "    $REVERT"
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════
# PHASE 3 — PUBLISH.  From here nothing can be taken back, so the order
# is the whole safety mechanism: each step is only reachable because the
# one before it succeeded.
# ══════════════════════════════════════════════════════════════════════
# ── THE JOURNAL ENTRY, WRITTEN INTO THE RELEASE COMMIT ────────────────
#
# In the release commit deliberately, not pushed separately afterwards.
# A second push to main would start a second Xcode Cloud run, and a newer
# run CANCELS the one before it — which is exactly how 2.13.0's iOS build
# was lost. The one thing a retrospective must not do is break the
# release it is reflecting on.
#
# So it records what is known by now: how many attempts this took and
# where they died, and whether the cycle itself changed. The `Lesson`
# line is the human's, and the next release is gated on it.
step "Journal"
ATTEMPT_LINES=""
[ -f "$ATTEMPTS" ] && ATTEMPT_LINES=$(grep -c "	$VERSION	" "$ATTEMPTS" 2>/dev/null || echo 0)
[ -z "$ATTEMPT_LINES" ] && ATTEMPT_LINES=0

{
  printf '\n## %s (%s) — %s\n\n' "$VERSION" "$CODE" "$(date -u +%F)"
  if [ "$ATTEMPT_LINES" -gt 0 ]; then
    printf 'Took %s aborted attempt(s) before it ran clean:\n\n' "$ATTEMPT_LINES"
    grep "	$VERSION	" "$ATTEMPTS" | cut -f3 | sort | uniq -c \
      | sed 's/^ */  - /'
    printf '\n'
  else
    printf 'Ran clean on the first attempt.\n\n'
  fi
  if [ -n "$CYCLE_TOUCHED" ]; then
    printf 'Changed the release cycle itself:\n\n'
    echo "$CYCLE_TOUCHED" | sed 's/^/  - `/;s/$/`/'
    printf '\n**Lesson:** _(unfilled)_\n'
  elif [ "$ATTEMPT_LINES" -gt 0 ]; then
    printf '**Lesson:** _(unfilled)_\n'
  else
    printf '**Lesson:** none needed — clean run, no change to the cycle.\n'
  fi
} >>"$JOURNAL"
ok "docs/release-log.md updated"

step "Publishing"

git add "$GRADLE_FILE" "$PBXPROJ" "$ROOT/docs/index.html" \
        "$ROOT/contrib/fdroid/com.prayer_times.yml" \
        "$JOURNAL" \
        "$ROOT/fastlane/metadata/android" || die "git add failed"
git commit -q -m "Release $VERSION ($CODE)" || die "commit failed"
ok "committed"

# MAIN BEFORE THE TAG, always. A tag pushed while main is still local
# names a commit nobody else can see, and this project does not move a
# pushed tag — so the recovery is to merge around it for ever.
git push -q origin main || die "push to main failed — nothing tagged, nothing published.
    Undo the local release commit and the stamps, then rerun:
      git reset --soft HEAD~1 && $REVERT"
ok "main pushed"

git tag -a "$TAG" -m "Mihrab $VERSION ($CODE)" || die "tag failed"
git push -q origin "$TAG" || die "tag push failed — main is pushed, so rerunning after a fix is safe"
ok "$TAG pushed"

# THE ASSET IS NAMED BY ITS FILENAME, so the file has to be named first.
#
# `gh release create file#Label` sets a display LABEL, not the asset name —
# the asset keeps the basename on disk. Uploading the gradle output
# directly would publish `app-fdroid-release.apk`, and then every download
# URL anyone has ever been given 404s: the one in the release notes, the
# one verify-release.sh checks, and the one F-Droid's recipe resolves.
# Copy to the published name and upload that.
STAGE=$(mktemp -d)
cp "$APK" "$STAGE/Mihrab-v$VERSION-fdroid.apk" || die "cannot stage the APK"
cp "$ZIP" "$STAGE/" || die "cannot stage the zip"

NOTES="${RELEASE_NOTES:-}"
if [ -n "$NOTES" ] && [ -f "$NOTES" ]; then
  gh release create "$TAG" -R "$REPO" --title "Mihrab $VERSION" \
     --notes-file "$NOTES" --latest \
     "$STAGE/Mihrab-v$VERSION-fdroid.apk" "$STAGE/Mihrab-macOS-$VERSION.zip" \
     >/dev/null || die "gh release failed"
else
  gh release create "$TAG" -R "$REPO" --title "Mihrab $VERSION" \
     --generate-notes --latest \
     "$STAGE/Mihrab-v$VERSION-fdroid.apk" "$STAGE/Mihrab-macOS-$VERSION.zip" \
     >/dev/null || die "gh release failed"
  echo "  (generated notes — set RELEASE_NOTES=/path/to/notes.md to write your own)"
fi
rm -rf "$STAGE"

# Ask GitHub what it actually published, rather than assuming the upload
# meant what we meant.
PUBLISHED=$(gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[].name' 2>/dev/null)
has "$PUBLISHED" "Mihrab-v$VERSION-fdroid.apk" \
  || die "the APK published under the wrong name: $PUBLISHED"
has "$PUBLISHED" "Mihrab-macOS-$VERSION.zip" \
  || die "the macOS zip published under the wrong name: $PUBLISHED"
ok "GitHub release published, both assets named correctly"

# The cask is bumped against the sha of the zip AS PUBLISHED, downloaded
# back from the release, not against the local file. They came apart once
# and `brew install` served a zip whose checksum the cask rejected.
step "Homebrew tap"
TMPZIP=$(mktemp)
curl -sL -o "$TMPZIP" \
  "https://github.com/$REPO/releases/download/$TAG/Mihrab-macOS-$VERSION.zip" \
  || die "cannot download the published zip"
SHA=$(shasum -a 256 "$TMPZIP" | cut -d' ' -f1)
rm -f "$TMPZIP"
OLD_SHA=$(grep -o 'sha256 "[a-f0-9]*"' "$TAP" | cut -d'"' -f2)
[ -n "$OLD_SHA" ] || die "cannot read the cask's current sha256"
sed -i '' "s/version \"$OLD_VERSION\"/version \"$VERSION\"/" "$TAP"
sed -i '' "s/$OLD_SHA/$SHA/" "$TAP"
# The cask's version is whatever SHIPPED last, which is not necessarily
# this repo's previous version — a release abandoned between the tag and
# the tap leaves them apart, and then the sed matches nothing and pushes a
# stale cask that says the old version with the new sha.
NEW_CASK="$(cat "$TAP")"
has "$NEW_CASK" "version \"$VERSION\"" \
  || die "the cask still does not say $VERSION — it was on $OLD_VERSION? edit $TAP by hand"
has "$NEW_CASK" "sha256 \"$SHA\"" \
  || die "the cask sha did not update — edit $TAP by hand"
( cd "$(dirname "$TAP")/.." \
  && git add Casks/mihrab.rb \
  && git commit -q -m "mihrab $VERSION" \
  && git push -q origin HEAD ) || die "tap push failed — run verify-release.sh and fix the cask by hand"
ok "cask at $VERSION, sha matches the published zip"

# ══════════════════════════════════════════════════════════════════════
# PHASE 4 — VERIFY.  The same gate as always, against what is now live.
# ══════════════════════════════════════════════════════════════════════
step "Verifying"
"$ROOT/scripts/verify-release.sh" "$TAG" || die "verification failed — see the ✗ lines above"

# Last, and after verification rather than before it: verification unpacks
# the published zip and is the last thing that touches a bundle.
cleanup_workbench

printf "\n"
bold "$VERSION ($CODE) is live on GitHub, Homebrew and the F-Droid recipe."
cat <<EOF

  Still yours to do — both need a human at a console:

    Play      upload $AAB
              (release notes for this build are already in the repo)

    App Store Xcode Cloud starts on the push to main; when it succeeds the
              build is in App Store Connect to submit.
              ./scripts/xcode-cloud.py runs 3
              Leave main alone until that run finishes — the next push
              cancels it, and iOS then ships the newer commit, not the tag.

EOF
