# Publishing on F-Droid

## Where it lives

| Place | Role |
|--------|------|
| **This repo** (`contrib/fdroid/com.prayer_times.yml`) | Reference copy only — F-Droid does **not** read it automatically. |
| **[fdroiddata](https://gitlab.com/fdroid/fdroiddata)** (separate GitLab repo) | **Real** metadata. You add `metadata/com.prayer_times.yml` there and open a **Merge Request**. |

Maintainers review the MR, run builds on their infrastructure, and merge when it passes.

## What you do

1. [Create a GitLab account](https://gitlab.com/users/sign_up) if needed.
2. **Fork** [fdroiddata](https://gitlab.com/fdroid/fdroiddata).
3. In your fork, add **`metadata/com.prayer_times.yml`** — start from the file in this directory (`com.prayer_times.yml`).
4. Open a **Merge Request** against `fdroid/fdroiddata` with a short description (link this GitHub repo and the `fdroid` flavor).
5. Reply to reviewer comments (they often tweak `sudo`, Node version, `ndk`, or `init` for React Native).

Official guides:

- [Submitting to F-Droid: Quick Start](https://f-droid.org/docs/Submitting_to_F_Droid_Quick_Start_Guide/)
- [Build metadata reference](https://f-droid.org/docs/Build_Metadata_Reference/)
- [Forum — Inclusion Policy](https://forum.f-droid.org/c/fdroid/InclusionPolicy/6)

## After each new release

Bump the **`Builds:`** block in **fdroiddata** (new `versionName`, `versionCode`, `commit` tag) via another MR, or rely on `UpdateCheckMode: Tags` once the app is in the repo (automation still needs metadata updates for some setups — follow F-Droid docs).

## Local check

From your machine (optional):

```sh
npm ci
cd android && ./gradlew assembleFdroidRelease
```

APK: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`
