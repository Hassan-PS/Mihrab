# Before / after opening the fdroiddata MR

## What you can do locally (this repo)

```sh
cd /path/to/PrayerApp
npm ci --no-audit
cd android && ./gradlew assembleFdroidRelease
```

Expect: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`

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
