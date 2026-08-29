# Distribution

How Mihrab gets from a `git push` to a user's phone. Three independent channels share one `main` branch.

```
                            ┌─────────────────────┐
                            │     main branch     │
                            └──────────┬──────────┘
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
        ┌───────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
        │   F-Droid      │    │  Google Play    │    │   App Store     │
        │  (fdroiddata)  │    │ (Play Console)  │    │ (Xcode Cloud)   │
        └───────┬────────┘    └────────┬────────┘    └────────┬────────┘
                │                      │                      │
       fdroidRelease APK         playRelease AAB        Xcode Cloud build
       built by F-Droid CI       uploaded manually      from `main` push or
       from a public tag         to the Play Console    `vX.Y.Z` tag → TestFlight
```

The Android `app/build.gradle` declares two product flavors (`fdroid` / `play`) plus a `beta` build type that sits next to release via `.beta` `applicationIdSuffix`. The iOS project has a single target that Xcode Cloud builds for both App Store and TestFlight.

---

## 1. Shared release flow (everyone first)

```sh
./scripts/release.sh --unreleased    # what is on main and has never shipped
./scripts/release.sh 2.14.0 --dry-run   # every check, and every build, then stop
./scripts/release.sh 2.14.0             # the whole thing
```

**One command, and it is the only supported way to cut a release.** It
bumps both platforms, stamps the site and the F-Droid recipe, builds all
three artifacts, publishes the tag, the GitHub release and the Homebrew
cask, and then runs `verify-release.sh` against what is live.

### Why it is a script and not a list

This section used to be that list, and §6 used to be a thirteen-step
version of it. Every release incident this project has had came out of
them — not from carelessness, but because a checklist is the wrong shape
for a job with an irreversible step in the middle:

| What happened | What the list said about it |
|---|---|
| 2.11.0 shipped **ad-hoc signed** — no team identifier, so codesign dropped every entitlement: no App Group, no widget data, no Keychain, and a new sync identity that orphaned every paired device's file | nothing; signing was not a step |
| A **tag was pushed before `main` landed**, naming a commit nobody could fetch — and a pushed tag is never moved here, so history had to be merged around it | right order, no enforcement |
| **Play rejected the release notes** at 500+ characters, found *after* the tag and release were public | nothing |
| **Fixes sat on `main` for days**, released to nobody, because nothing said so out loud | nothing |
| **Every Mac's widgets froze on upgrade**, fixed only by the cask's `postflight` | the list predates the Mac build |
| **Every Mac's widgets were removed on upgrade** — replacing the app drops the extension's PlugInKit record and nothing re-registers it, so WidgetKit has no provider and discards the placement | same postflight, second failure, found only because a user said so |

The script's one rule: **everything that can fail happens before anything
that cannot be undone.** Tests, the changelog limits, the Xcode Cloud
in-flight check, the signature and App Group of the *actual* zip about to
be published — all before the first `git push`. After that the order is
main → tag → GitHub release → tap, because each is only recoverable by
the one before it having already succeeded.

`--dry-run` stops at exactly that line, having done all the work and none
of the publishing.

### What it still cannot do for you

Two things need a human at a console, and the script prints both when it
finishes:

- **Play** — upload `app-play-release.aab`. The release notes for the new
  `versionCode` must already be in `fastlane/metadata/android/*/changelogs/`
  before you start; the script refuses to run without them.
- **App Store** — Xcode Cloud starts on the push to `main`; submit from
  App Store Connect once it succeeds (`./scripts/xcode-cloud.py runs 3`).
  **Do not push to `main` again until it finishes.** A second push cancels
  the run, and the build that reaches App Store Connect is then built from
  the newer commit rather than the tagged one — 2.13.1's own run #550 was
  cancelled this way, minutes after the tag.

For beta tags, swap the Gradle commands for `assembleFdroidBeta` /
`bundlePlayBeta` and mark the GitHub release as **prerelease** — the
script does production tags only.

---

## 2. F-Droid

F-Droid builds the APK themselves on their CI from a public tag. We don't ship a built APK to them — we ship a recipe and a git tag.

### Files

| Path | Role |
|---|---|
| `contrib/fdroid/com.prayer_times.yml` | **Local copy of the recipe**, source of truth in this repo. |
| `~/git/fdroiddata/metadata/com.prayer_times.yml` | **Upstream copy**, now merged into `fdroid/fdroiddata` master. |
| https://f-droid.org/packages/com.prayer_times/ | **The listing.** Live once F-Droid's builder has run against a tag. |
| `contrib/fdroid/README.md` | The submission-kit README. Outside contributors read this. |
| `contrib/fdroid/PRE_MERGE_CHECKLIST.md` | Local sanity checks before pushing. |
| `contrib/fdroid/MERGE_REQUEST.md` | Suggested MR title / description for GitLab. |

### Per-release flow

**Since the MR merged (1 Aug 2026) there is nothing to do per release.** The
recipe carries `AutoUpdateMode: Version` + `UpdateCheckMode: Tags`, so
F-Droid's own checkupdates bot adds each new version from the git tag. Two
consequences worth holding on to:

- **Do not delete or move a pushed tag.** The bot may already have written a
  build entry pointing at it, and F-Droid's build then fails on a missing ref.
- Only file an MR by hand if the *recipe* itself has to change — a new NDK, a
  new gradle prop, a new source dependency — not for a version bump.

The manual flow below is kept for that case, and for anyone forking this
setup from scratch.

1. Bump versions (step 1 of the shared flow).
2. Tag the release `v2.x.y` and push the tag. **The recipe references tag refs, not commit hashes** — F-Droid CI enforces this.
3. Edit `contrib/fdroid/com.prayer_times.yml`:
   - Add a new entry under `Builds:` with the new `versionName`, `versionCode`, and `commit: v2.x.y`.
   - Update the trailing `CurrentVersion:` and `CurrentVersionCode:`.
4. Mirror to the fork:
   ```sh
   cp contrib/fdroid/com.prayer_times.yml ~/git/fdroiddata/metadata/com.prayer_times.yml
   ```
5. Commit + push both repos:
   ```sh
   git -C ~/git/PrayerApp     add -A && git -C ~/git/PrayerApp     commit -m "fdroid metadata: bump to vX.Y.Z (versionCode N)"
   git -C ~/git/PrayerApp     push
   git -C ~/git/fdroiddata    add -A && git -C ~/git/fdroiddata    commit -m "com.prayer_times: bump to vX.Y.Z (versionCode N)"
   git -C ~/git/fdroiddata    push                       # to the fork, branch add-com.prayer_times
   ```
   The MR auto-updates the moment the fork branch advances.

### Local sanity build

```sh
./android/gradlew -p android assembleFdroidRelease
# → android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk
```

Then attach that APK to the GitHub release so users who want F-Droid binaries before the upstream build finishes can sideload.

### What the `fdroid` flavor does differently

- **No billing dependency anywhere** — the tip jar and `react-native-iap` were removed from the project, so no flavor pulls one in.
- **No Google Play Services** — guarded by the `patch-package` patch on `@react-native-community/geolocation` that strips `play-services-location` and uses AOSP `LocationManager` only.
- **No ABI splits** — split APKs are only enabled for `playRelease` (guarded by `wantsPlayRelease` in `app/build.gradle`). The F-Droid build is a single universal APK, which is what their CI recipe expects.

### F-Droid CI rules (`rewritemeta` linter)

Mechanically enforced; ignore at your peril:

- Multi-line `curl` commands in `sudo:` MUST keep a **trailing space before the indented URL line**.
- Build entries MUST use **tag refs** (`commit: v2.1.0`), never commit hashes.
- One entry per `Builds:` block per target.
- The `Name:` field, if present, MUST appear AFTER `Changelog:` (we hit this in v2.0.13).

For known build pitfalls — Kotlin 2.2 SAM regressions, RemoteViews allowed-views, JDK 17 install via curl — see the agent memory file `~/Library/Application Support/Claude/.../memory/fdroid_ci_safeguards.md`.

---

## 3. Google Play

Manual upload to the Play Console after a local AAB build. No automation yet.

### Build

```sh
# Production AAB
./android/gradlew -p android bundlePlayRelease
# → android/app/build/outputs/bundle/playRelease/app-play-release.aab

# Beta AAB (separate channel, .beta applicationId suffix)
./android/gradlew -p android bundlePlayBeta
# → android/app/build/outputs/bundle/playBeta/app-play-beta.aab
```

### Signing

`android/keystore.properties` (gitignored). Required keys:

```properties
storeFile=mihrab-release.jks
storePassword=...
keyAlias=mihrab
keyPassword=...
```

The Gradle `wantsPlayRelease` guard in `app/build.gradle` REFUSES to fall back to debug signing for `playRelease` / `playBeta`. If `keystore.properties` is missing or incomplete, the build fails loudly rather than producing an unsigned-for-Play binary.

### Upload

1. Open https://play.google.com/console.
2. App: **Mihrab** (`com.prayer_times`).
3. Release → **Production** (or **Open testing** / **Internal testing** for staged rollouts).
4. **Create new release** → upload `app-play-release.aab`.
5. Paste the release notes from `CHANGELOG.md`.
6. Roll out — typically Internal → Open → Production over a week.

### Listing copy

`fastlane/metadata/android/en-US/`:

```
fastlane/metadata/android/en-US/
├── title.txt
├── short_description.txt
├── full_description.txt
├── changelogs/
│   └── 149.txt           # one file per versionCode
└── images/
    ├── icon.png
    ├── featureGraphic.png
    └── phoneScreenshots/
```

The Play Console reads from these. F-Droid optionally reuses them but our `com.prayer_times.yml` carries its own copy too.

### Flavor specifics

- **`play` flavor**: Google Play Services for location. The `PrayerBuildInfo` native module still exposes the flavor to JS, now only so `rateApp` knows whether there is a Play Store to open.
- **ABI splits**: per-ABI APKs (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) for the Play upload, `universalApk = false`. Cuts download size ~3-4× per device.
- **R8 minification**: on (`enableProguardInReleaseBuilds = true`). Rules in `android/app/proguard-rules.pro` — keep `com.prayer_times.**` and any new RN-bridged native modules.

---

## 4. App Store / TestFlight (iOS)

Fully automated via **Xcode Cloud**. We don't build the iOS binary locally for distribution — Xcode Cloud handles signing, archiving, upload, and submission.

### Workflows

Connected in Xcode → Settings → Accounts → Xcode Cloud. Two workflows on the GitHub repo:

| Trigger | Workflow | Outcome |
|---|---|---|
| Push to `main` | **Beta (TestFlight)** | New TestFlight build for the internal/external tester groups. |
| Push of tag `vX.Y.Z` | **Release (App Store)** | New App Store Connect build; needs the human submit step after build finishes. |

The same Xcode workspace builds both. There's no Fastlane lane, no `xcrun altool` upload — Xcode Cloud signs the build with the App Store Connect cert + provisioning profile, and runs the iOS Distribution upload itself.

### Local builds

Only used for verification / debugging. Open `ios/PrayerApp.xcworkspace` in Xcode and Run, or:

```sh
cd ios
xcodebuild -workspace PrayerApp.xcworkspace -scheme PrayerApp \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build/sim -quiet build

xcrun simctl install booted build/sim/Build/Products/Debug-iphonesimulator/PrayerApp.app
xcrun simctl launch booted com.hassan.prayerapp
```

Local builds use "Sign to Run Locally" / "Personal Team" signing — they won't run on a real device without a paid Apple Developer account.

### Version bumps

Every `vX.Y.Z` tag must have a matching `CURRENT_PROJECT_VERSION` in `project.pbxproj`. Xcode Cloud reads this directly when archiving; if the build number is the same as a previous TestFlight build, App Store Connect rejects the upload.

**This is why the Default workflow does not build data-only pushes.** The
dataset bot (`.github/workflows/ifis-dataset.yml`) commits refreshed prayer
times to `main` without touching app code, so the version is unchanged from
the release before it — and every one of those pushes started a nine-minute
archive that could only ever die at "Preparing build for App Store Connect
failed", a duplicate build number (build 517, 2026-08-17). The failure is
noise, but it is noise that looks exactly like a broken release.

The fix is a start condition, set on the workflow itself rather than in this
repo, so it is written down here instead:

```
Xcode Cloud → Default → Edit Workflow → Start Conditions → Branch Changes
  Files and Folders: Do not start if all files match → directory "data"
```

Equivalently, on `ciWorkflows/{id}`, `branchStartCondition.filesAndFoldersRule`
= `{mode: "DO_NOT_START_IF_ALL_FILES_MATCH", matchers: [{directory: "data"}]}`.
A push that touches app code still builds, including one that touches app code
AND data — the rule only skips pushes where *every* changed file is under
`data/`. Setting it back to `null` restores the old behaviour.

```sh
# Bump build N → N+1, marketing version X.Y.Z → X.Y.(Z+1)
sed -i '' \
  's/CURRENT_PROJECT_VERSION = N/CURRENT_PROJECT_VERSION = N+1/g;
   s/MARKETING_VERSION = X.Y.Z/MARKETING_VERSION = X.Y.(Z+1)/g' \
  ios/PrayerApp.xcodeproj/project.pbxproj
```

### Widget Extension

`ios/PrayerWidgetExtension/` is an embedded extension target inside the same `.ipa`. Its deployment target is iOS 16 (matches WidgetKit + ActivityKit minimums).

The Widget Extension Bundle (`PrayerWidgetExtension.swift`) is a `WidgetBundle` containing:

1. `PrayerTimesHomeWidget` — the home-screen + Lock-Screen accessory widget.
2. `PrayerLiveActivityWidget` (iOS 16.1+) — the ActivityKit Live Activity (Lock Screen card + Dynamic Island compact / minimal / expanded).

`PrayerLiveActivityAttributes.swift` is a **dual-target member** (main app + widget extension) so ActivityKit's type-identity check passes when the app calls `Activity<…>.request(…)` and the widget renders via `ActivityConfiguration<…>`. The dual membership is set via direct `pbxproj` edits — see `outputs/pbxproj_add_liveactivity.py` for the editor that wires it up.

### TestFlight

Three tester pools, configured in App Store Connect → TestFlight:

- **Internal Testers** — Hassan only. Gets every build automatically.
- **Beta Testers** (external, public link) — opt-in via the public TestFlight link. Gets every `main` push.
- **Production Testers** (external, invite-only) — invited explicitly before each App Store submission.

### App Store submission

After Xcode Cloud finishes the **Release** workflow:

1. Open App Store Connect → Mihrab → iOS App → App Store tab.
2. Pick the new build (Xcode Cloud uploaded it automatically).
3. Fill in "What's new" (copy from `CHANGELOG.md`).
4. **Submit for Review**.
5. Apple review is typically 24–48 hours.

---

## 5. GitHub releases (sideload + binary archive)

Every tag gets a GitHub release with the F-Droid APK attached, so:

- Users on F-Droid have a fallback while F-Droid CI is building the upstream version.
- Obtainium users (Android power-user app updater) can subscribe to GitHub Releases and auto-pull every new APK.
- Reproducible-build verifiers can compare the GitHub-attached APK against the F-Droid-built APK byte-for-byte.

```sh
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "$(awk '/^## \[X.Y.Z\]/,/^## \[/' CHANGELOG.md | sed '$d')" \
  android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk
```

For beta tags, add `--prerelease`.

---

## 6. End-to-end release

`./scripts/release.sh X.Y.Z` — see §1.

There used to be a thirteen-step checklist here, kept in parallel with the
one in §1. Two copies of the same procedure is how a procedure goes wrong:
by the time it was replaced this one had no Catalyst build, no Homebrew
cask, no signing check and no release notes limit, and still asked for a
`CHANGELOG.md` heading and a `CLAUDE.md` line that nothing reads. Anyone
following it faithfully would have shipped a broken macOS build.

### Preparing the release notes

The only thing you must do by hand before running the script, because it
refuses to start without them:

```sh
CODE=$(( $(grep -o 'versionCode [0-9]*' android/app/build.gradle | head -1 | awk '{print $2}') + 1 ))
for l in en-US sv-SE ar; do
  $EDITOR "fastlane/metadata/android/$l/changelogs/$CODE.txt"
done
```

Under 500 **characters** each — `wc -m`, not `wc -c`; Arabic and Swedish
are well under the limit in characters and can be over it in bytes.

### If something fails partway

- **Before the "Publishing" step** — nothing has left your machine. The
  version bump is in the working tree; `git checkout --` the four stamped
  files and start again.
- **After `main` is pushed but before the tag** — safe to rerun once the
  cause is fixed; the script refuses a tag that already exists rather than
  moving one.
- **After the tag** — do not retag. Fix forward with the next patch
  version. Retagging silently converts the GitHub release to a draft and
  every asset URL starts 404ing, which breaks `brew install` (v2.7.39).

---

## 7. Where the credentials live

| What | Where | Used by |
|---|---|---|
| Android upload key | `android/keystore.properties` (gitignored, in 1Password) | `./gradlew bundlePlayRelease` |
| App Store Connect API key | App Store Connect → Users + Access | Xcode Cloud (configured once in App Store Connect) |
| Apple Developer signing certs | Xcode → Settings → Accounts | Xcode Cloud (automatic) |
| GitHub PAT for `gh release` | `~/.config/gh/hosts.yml` | `gh release create` |
| GitLab PAT for fdroiddata fork pushes | `~/.gitlab-credentials` | `git push origin add-com.prayer_times` (in `~/git/fdroiddata`) |

Nothing sensitive is in this repo; every credential is loaded from gitignored files or from the system keychain.
