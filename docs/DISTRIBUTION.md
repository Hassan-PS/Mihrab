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

Every production release does these once, in order:

1. **Bump versions** — both platforms together.
   - `android/app/build.gradle` → `versionCode` (+1) and `versionName` (e.g. `"2.1.0"`).
   - `ios/PrayerApp.xcodeproj/project.pbxproj` → `CURRENT_PROJECT_VERSION` (matches Android's `versionCode`) and `MARKETING_VERSION` (matches Android's `versionName`), 4 occurrences each (main target Debug/Release × widget extension Debug/Release).
   ```sh
   sed -i '' \
     's/CURRENT_PROJECT_VERSION = OLD/CURRENT_PROJECT_VERSION = NEW/g;
      s/MARKETING_VERSION = X.Y.Z/MARKETING_VERSION = NEW.X.Y/g' \
     ios/PrayerApp.xcodeproj/project.pbxproj
   ```
2. **Update `CHANGELOG.md`** under a new `## [X.Y.Z] — YYYY-MM-DD` heading. Group as `Added`, `Changed`, `Fixed`, `Removed`.
3. **Commit and push `main`** — this triggers Xcode Cloud's Beta workflow.
4. **Tag the commit** `vX.Y.Z` (or `vX.Y.Z-beta.N` for prereleases) and push the tag.
5. **Build the Android binaries locally** (next sections).
6. **Create a GitHub release** with the F-Droid APK attached.
7. **Mirror the F-Droid recipe** + push the fdroiddata fork branch (auto-updates MR 36312).
8. **Upload the Play AAB** to the Play Console.

For beta tags, swap the Gradle commands for `assembleFdroidBeta` / `bundlePlayBeta` and mark the GitHub release as **prerelease**.

---

## 2. F-Droid

F-Droid builds the APK themselves on their CI from a public tag. We don't ship a built APK to them — we ship a recipe and a git tag.

### Files

| Path | Role |
|---|---|
| `contrib/fdroid/com.prayer_times.yml` | **Local copy of the recipe**, source of truth in this repo. |
| `~/git/fdroiddata/metadata/com.prayer_times.yml` | **Upstream copy**, lives in the Hassan-PS/fdroiddata fork. We mirror after every bump. |
| https://gitlab.com/fdroid/fdroiddata/-/merge_requests/36312 | **The MR**, branch `add-com.prayer_times`. Pushes to the fork auto-update the MR. |
| `contrib/fdroid/README.md` | The submission-kit README. Outside contributors read this. |
| `contrib/fdroid/PRE_MERGE_CHECKLIST.md` | Local sanity checks before pushing. |
| `contrib/fdroid/MERGE_REQUEST.md` | Suggested MR title / description for GitLab. |

### Per-release flow

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

- **No `react-native-iap`** — the dep is registered as `playImplementation` in `app/build.gradle`, so the F-Droid flavor never pulls it in.
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

- **`play` flavor**: includes `react-native-iap` (the tip-jar IAP). The `PrayerBuildInfo` native module exposes the flavor to JS so the AboutCard hides the tip jar entirely on F-Droid.
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

## 6. End-to-end checklist (production tag `vX.Y.Z`)

Run top to bottom:

1. ☐ Bump `versionCode` + `versionName` in `android/app/build.gradle`.
2. ☐ Bump `CURRENT_PROJECT_VERSION` + `MARKETING_VERSION` in `ios/PrayerApp.xcodeproj/project.pbxproj` (4 occurrences each).
3. ☐ Update `CHANGELOG.md` under a new `## [X.Y.Z] — YYYY-MM-DD` heading.
4. ☐ Update `CLAUDE.md`'s "Current:" line.
5. ☐ `./android/gradlew -p android assembleFdroidRelease` (local sanity build).
6. ☐ `./android/gradlew -p android bundlePlayRelease` (Play AAB).
7. ☐ `git push origin main` (triggers Xcode Cloud Beta workflow).
8. ☐ `git tag vX.Y.Z && git push origin vX.Y.Z` (triggers Xcode Cloud Release workflow).
9. ☐ `gh release create vX.Y.Z ... app-fdroid-release.apk` (attach F-Droid APK).
10. ☐ Bump `contrib/fdroid/com.prayer_times.yml` (`Builds:` entry + `CurrentVersion:` + `CurrentVersionCode:`).
11. ☐ Mirror to `~/git/fdroiddata/metadata/com.prayer_times.yml` and push the fdroiddata fork branch.
12. ☐ Upload `app-play-release.aab` to Play Console.
13. ☐ Submit the App Store build for review.

For beta tags, swap steps 5/6 for `assembleFdroidBeta` / `bundlePlayBeta` and mark step 9's release `--prerelease`.

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
