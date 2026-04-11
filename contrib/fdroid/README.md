# F-Droid submission kit

Everything here is **upstream preparation**. The real merge request goes to **[fdroiddata on GitLab](https://gitlab.com/fdroid/fdroiddata)** (separate account/repo).

## Files in this folder

| File | Purpose |
|------|---------|
| [`com.prayer_times.yml`](com.prayer_times.yml) | **Paste into** `metadata/com.prayer_times.yml` in your fdroiddata fork (delete the 2-line comment at the top when committing). |
| [`MERGE_REQUEST.md`](MERGE_REQUEST.md) | Suggested **MR title, description, branch name** for GitLab. |
| [`SUGGESTED_ITEMS.md`](SUGGESTED_ITEMS.md) | Honest **Suggested**-section answers (submodules / reproducible / split APKs). |
| [`PRE_MERGE_CHECKLIST.md`](PRE_MERGE_CHECKLIST.md) | Local build check + syncing YAML to your fdroiddata fork. |

## Repo root (optional, for listings)

| Path | Purpose |
|------|---------|
| [`fastlane/metadata/android/en-US/`](../../fastlane/metadata/android/en-US/) | Title / short / long description. F-Droid (and Play) can reuse these; the YAML above still includes `Description` so the first MR is self-contained. |

## Steps (you do on GitLab)

1. Sign in at [gitlab.com](https://gitlab.com) and **fork** [fdroid/fdroiddata](https://gitlab.com/fdroid/fdroiddata).
2. Create branch e.g. `add-com.prayer_times`.
3. Add **`metadata/com.prayer_times.yml`** using the contents of **`com.prayer_times.yml`** from this folder.
4. Open a **Merge Request** to `fdroid/fdroiddata` — copy text from **`MERGE_REQUEST.md`**.
5. Iterate with reviewers (Node/NDK/`scanignore` tweaks are common for React Native).

## After a new app release

Add a new list item under **`Builds:`** in fdroiddata (or your next MR) with updated `versionName`, `versionCode`, and `commit` (git tag). See [Build metadata reference](https://f-droid.org/docs/Build_Metadata_Reference/).

## Local sanity check

```sh
cd /path/to/PrayerApp
npm ci --no-audit
cd android && ./gradlew assembleFdroidRelease
```

APK: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`

## Docs

- [Submitting to F-Droid: Quick Start](https://f-droid.org/docs/Submitting_to_F_Droid_Quick_Start_Guide/)
- [Adding React Native apps](https://f-droid.org/2020/10/14/adding-react-native-app-to-f-droid.html)
- [Build metadata reference](https://f-droid.org/docs/Build_Metadata_Reference/)
