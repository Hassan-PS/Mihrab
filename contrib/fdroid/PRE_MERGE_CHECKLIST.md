# Before / after opening the fdroiddata MR

## What you can do locally (this repo)

```sh
cd /path/to/PrayerApp
npm ci --no-audit
cd android && ./gradlew assembleFdroidRelease
```

Expect: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`

## Adding a new `Builds:` entry — canonical prebuild template

**Always copy this prebuild block exactly.** Do not use older entries (pre-v2.3.9) as a template.

```yaml
    prebuild:
      - printf '\norg.gradle.java.home=/usr/local/jdk-17\n' >> gradle.properties
      - echo 'reactNativeArchitectures=arm64-v8a' >> gradle.properties
      - echo 'org.gradle.daemon=false' >> gradle.properties
      - echo 'org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m' >> gradle.properties
      - printf '\nandroid { lint { checkReleaseBuilds false } }' >> app/build.gradle
      - cd ..
      - npm ci --no-audit --build-from-source
```

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
- `org.gradle.jvmargs=-Xmx2g` caps Gradle heap so it doesn't compete with AAPT2 workers.
- `printf '\nandroid { lint { checkReleaseBuilds false } }' >> app/build.gradle` disables all
  `lintVital*` tasks including those for dependencies. Groovy DSL merges duplicate `android {}`
  blocks in the same file, so appending a second block is safe.

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
