# Before / after opening the fdroiddata MR

## What you can do locally (this repo)

```sh
cd /path/to/PrayerApp
npm ci --no-audit
cd android && ./gradlew assembleFdroidRelease
```

Expect: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`

## Adding a new `Builds:` entry — canonical prebuild template

**Always copy these blocks exactly.** Do not use older entries as a template.

```yaml
    sudo:
      - apt-get update
      - apt-get install -y npm curl ca-certificates openjdk-21-jdk-headless
      - npm install -g npm@10 --loglevel=error --no-fund
      - ln -snf /usr/lib/jvm/java-21-openjdk-amd64 /usr/local/jdk21
    gradle:
      - fdroid
    output: app/build/outputs/apk/fdroid/release/*.apk
    prebuild:
      - printf '\norg.gradle.java.home=/usr/local/jdk21\n' >> gradle.properties
      - echo 'react.internal.disableJavaVersionAlignment=true' >> gradle.properties
      - echo 'kotlin.jvm.target.validation.mode=IGNORE' >> gradle.properties
      - echo 'reactNativeArchitectures=arm64-v8a' >> gradle.properties
      - echo 'org.gradle.daemon=false' >> gradle.properties
      - echo 'org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m' >> gradle.properties
      - echo 'org.gradle.warning.mode=none' >> gradle.properties
      - echo 'org.gradle.logging.level=quiet' >> gradle.properties
      - echo 'org.gradle.console=plain' >> gradle.properties
      - echo 'android.javaCompile.suppressSourceTargetDeprecationWarning=true' >> gradle.properties
      - printf '\nandroid { lint { checkReleaseBuilds false } }\n' >> app/build.gradle
      - echo 'android { buildTypes { release { minifyEnabled false } } }' >> app/build.gradle
      - cd ..
      - npm ci --no-audit --no-fund --loglevel=error --ignore-scripts --omit=optional --omit=dev
      - npm install --no-save --no-fund --loglevel=error --ignore-scripts patch-package
      - node node_modules/.bin/patch-package
      - RNG=node_modules/@react-native/gradle-plugin
      - find $RNG -name build.gradle.kts -exec sed -i '/jvmToolchain/d' {} \;
    scanignore:
      - node_modules
    ndk: 27.1.12297006
```

**Keep only the current version in `Builds:`.** The fdroiddata MR diff adds every
entry, and CI builds each one in sequence starting from the oldest. Historical
versions were never on F-Droid, so building them wastes the pipeline budget — and
old entries that predate the log-quieting flags overflow GitLab's 4 MB job-log cap
(see pitfall §9). New versions are picked up automatically via
`AutoUpdateMode: Version` + `UpdateCheckMode: Tags`.

## Common pitfalls (all learned from real CI failures on MR 36312)

### 1. Blank line between entries (breaks `fdroid rewritemeta`)
Every build entry **must** be separated by **exactly one** blank line — neither zero nor two:
```yaml
    ndk: 27.1.12297006
              ← exactly one blank line
  - versionName: X.Y.Z
```
Both zero and two blank lines cause `fdroid rewritemeta` to reformat the file; CI then fails
because the file changed. `fdroid lint` and schema validation both pass — only `rewritemeta` catches this.

### 2. Python `\n` in YAML strings (breaks `fdroid rewritemeta` / lint)
If you generate the YAML entry via Python, **use raw strings** for the `printf` prebuild line:
```python
# WRONG — Python interprets \n as a real newline, splitting the YAML scalar
entry = "      - printf '\norg.gradle.java.home=/usr/local/jdk-17\n' >> gradle.properties"

# CORRECT — raw string keeps the literal backslash-n characters
entry = r"      - printf '\norg.gradle.java.home=/usr/local/jdk-17\n' >> gradle.properties"
```

### 3. Two ABIs → C++ compile timeout (arm64-v8a only for v2.3.9+)
`reactNativeArchitectures=arm64-v8a,armeabi-v7a` pushes react-native-svg C++ codegen past the
1-hour job timeout. Use `arm64-v8a` only. Virtually all active devices are arm64.

### 4. Lint + R8 parallel OOM → daemon crash + timeout (v2.3.9+)
Even arm64-only isn't enough. `lintVitalAnalyzeRelease` runs on every native npm module
(react-native-svg, netinfo, gesture-handler, ...) in parallel with R8 minification. Combined
memory pressure OOM-kills the AAPT2 and Gradle daemons ("Gradle build daemon disappeared
unexpectedly"), which then triggers the 1h timeout.

The canonical prebuild block above handles both issues:
- `org.gradle.jvmargs=-Xmx1536m` caps Gradle heap so it doesn't compete with AAPT2 workers or Metro.
- `printf '\nandroid { lint { checkReleaseBuilds false } }' >> app/build.gradle` disables all
  `lintVital*` tasks including those for dependencies. Groovy DSL merges duplicate `android {}`
  blocks in the same file, so appending a second block is safe.

### 5. Metro OOM-kill → hermesc exit code 5 (v2.3.x+)
Metro (the JS bundler, a Node.js subprocess) runs during `createBundleFdroidReleaseJsAndAssets`.
If Gradle holds too much heap (`-Xmx2g`), there is insufficient RAM left for Node.js → Metro is
OOM-killed → `index.android.bundle` is never written → hermesc exits with code 5 ("Failed to
open file"). Fix: `-Xmx1536m` (see §4 above) plus `--ignore-scripts` on npm ci to finish faster.

### 6. npm ci postinstall scripts → slow install (~55+ min)
npm ci with postinstall scripts (native module compilation, etc.) takes ~55–60 min on the CI
runner, eating into the 1h budget and leaving no time for Gradle. Fix: `--ignore-scripts` skips
them; `node node_modules/.bin/patch-package` is then run explicitly to re-apply the
`patches/` patches (specifically the Google Play Services strip for `@react-native-community/geolocation`).

### 7. `org.gradle.parallel=true` → C++ OOM → cmake exit code 1
`org.gradle.parallel=true` causes multiple native module CMake builds to run simultaneously.
React Native autolinking compiles C++ specs for 10+ native modules (react-native-screens,
gesture-handler, safe-area-context, notifee, svg, etc.) as subdirectories of the app's single
CMake build. With parallel enabled, all modules' clang++ processes run at once — combined with
the 1.5 GB Gradle JVM heap, this exhausts available RAM, the OOM killer sends SIGTERM to clang++
processes, and cmake exits with code 1.

**Do NOT add `org.gradle.parallel=true`.** Sequential C++ compilation (the Gradle default) keeps
one module compiling at a time; each gets full CPU cores from Ninja and finishes in ~25-30 min
total without OOM.

### 8. `newArchEnabled=false` is silently ignored for library subprojects
`ReactRootProjectPlugin` (applied to `android/build.gradle` as `com.facebook.react.rootproject`)
**forcibly sets `newArchEnabled=true` on all subprojects** at configuration time — overriding any
root `gradle.properties` value. Native module build.gradles that check `isNewArchitectureEnabled()`
will always see `true`. Setting `newArchEnabled=false` in the root `gradle.properties` has no
effect on C++ compilation of library modules.

**Do NOT add `newArchEnabled=false`.** It is a no-op and will cause confusion.

### 9. Job log exceeds GitLab's 4 MB cap → "Job's log exceeded limit" (truncated, unreadable)
The fdroiddata MR pipeline runs `fdroid build --verbose` on **every** `Builds:` entry the
MR adds, in `versionCode` order (oldest first). A single React Native build emits thousands
of repeated warning lines — the per-CMake `NDK was located by using ndk.dir property`
deprecation (one block per native module × per ABI), npm `EBADENGINE` warnings, and Java
`source/target value 8 is obsolete` warnings. Left unsilenced, one build alone can blow past
GitLab's **4 MB** job-log limit; the job then continues but stops collecting output, so any
later real failure is invisible.

Two fixes, both required:
- **Quiet the build** (in every entry's prebuild): `org.gradle.logging.level=quiet`,
  `org.gradle.warning.mode=none`, `org.gradle.console=plain`,
  `android.javaCompile.suppressSourceTargetDeprecationWarning=true`, and run every npm
  command with `--loglevel=error --no-fund`. (`quiet` still prints errors, so failures stay
  debuggable.)
- **Build fewer versions**: keep only the current version in `Builds:` (see the note under
  the template above).

---

## What only GitLab can confirm

- **All fdroiddata pipelines green** — wait on CI; do not claim “pipelines pass” until then.
- **Fork public, branch not protected** — GitLab project settings (your **Hassan-PS/fdroiddata** fork).

## What we are **not** doing for v1 (and why)

| Suggested item | Status |
|----------------|--------|
| **Git submodules** for deps | **No** — React Native uses **npm** + lockfile; see `SUGGESTED_ITEMS.md`. |
| **Reproducible builds** | **No** for now — explicit opt-out in MR; large RN/Hermes effort. |
| **Per-ABI APK splits** | **No** for now — one universal APK + single `output` in YAML. |

## Optional polish (strongly recommended)

- **Screenshots** for the store: add PNGs under  
  `fastlane/metadata/android/en-US/images/phoneScreenshots/`  
  (typical width **440 px**; see [F-Droid graphics](https://f-droid.org/en/docs/All_About_Descriptions_Graphics_and_Info/)).  
  Not required for CI, but improves the listing.

## Sync metadata from PrayerApp → your fork

After pulling latest **PrayerApp** `main`:

```sh
cp /path/to/PrayerApp/contrib/fdroid/com.prayer_times.yml \
   /path/to/fdroiddata/metadata/com.prayer_times.yml
# Remove the two # comment lines at the top of the copied file if present
cd /path/to/fdroiddata
git checkout add-com.prayer_times   # or your MR branch
git add metadata/com.prayer_times.yml
git commit -m "Update com.prayer_times maintainer notes"
git push
```

Then paste **`SUGGESTED_ITEMS.md`** into the MR description and **uncheck** the three suggested checkboxes you had ticked incorrectly.
