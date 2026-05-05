# Mihrab rebrand — what's already done, and what only you can do

The code-side rebrand is shipped in v2.0.7 (commit `0f721aa`). What's left is platform-side work that requires your account credentials and console access. Walk through these in order.

---

## 1. GitHub: rename `Hassan-PS/PrayerApp` → `Hassan-PS/Mihrab`

GitHub auto-redirects every old URL (clones, releases, raw file links, comparison URLs) for ~12 months after a rename, so this won't break anything that's already deployed. The v2.0.7 source already references `Hassan-PS/Mihrab`.

1. Go to <https://github.com/Hassan-PS/PrayerApp/settings>.
2. In the **Repository name** field, change `PrayerApp` to `Mihrab`. Click **Rename**.
3. Update your local clone:
   ```bash
   cd /Users/hassan/git/PrayerApp
   git remote set-url origin git@github.com:Hassan-PS/Mihrab.git
   git remote -v   # verify
   ```
4. Optionally rename the local folder too:
   ```bash
   cd ~/git
   mv PrayerApp Mihrab
   ```
   If you do, also update the `cwd` references in `CLAUDE.md` and any IDE workspace files. Not strictly required — git won't care.
5. Verify the previously-published assets still load. Open one of these in your browser:
   - <https://github.com/Hassan-PS/Mihrab/releases/download/mushaf-assets-v2/001.png>
   - <https://github.com/Hassan-PS/Mihrab/releases/tag/v2.0.6>

   Both should resolve directly. The old `Hassan-PS/PrayerApp/...` URLs will also still work (auto-redirect), so v2.0.6 users on F-Droid and Play continue to fetch mushaf images and check for updates without disruption.

The `mushaf-assets-v2` release tag carries the same 604 PNGs after the rename — releases are tied to the repo, not the name, so nothing to re-upload.

---

## 2. F-Droid: rebrand on the existing MR (no resubmission needed)

You're keeping `applicationId = com.prayer_times`, so this is a normal metadata update on the existing MR 36312, not a fresh app submission. F-Droid will pick up the new `Name: Mihrab` field on the next build cycle.

The change is already pushed to the GitLab fork branch `add-com.prayer_times` (commit `c2d69a7f93`). The MR auto-updates from the branch, so MR 36312 already shows the rebrand. No further action on F-Droid until a maintainer reviews.

If a maintainer asks about the name change in MR comments, the answer is: "Same app, same package id, brand-only rename. Auto-update for existing v2.0.6 installs is preserved."

---

## 3. Apple App Store Connect: rename for the iOS listing

Apple lets you rename a published app in the next version submission. You can't change the bundle ID (`com.prayer_times`), but the **App Name** that shows on the home screen and in search is editable.

1. Sign in to <https://appstoreconnect.apple.com/>.
2. **My Apps** → select Prayer Times.
3. In the left sidebar, under iOS App, click the version that's currently in **Prepare for Submission** state — this is the v2.0.7 version that Xcode Cloud will push once it finishes building.
   - If no version is in that state yet, click **+ Version** (top right) and create a 2.0.7 version. App Store Connect will pull the new build from Xcode Cloud automatically.
4. In the **App Information** section (left sidebar), edit:
   - **Name**: change "Prayer Times" → **Mihrab**
   - **Subtitle** (optional): something like "Prayer times, calmly"
5. In the **Version Information** section:
   - **Promotional Text** and **Description**: update first sentence to reference Mihrab. The body text I prepared in `fastlane/metadata` is now Mihrab-aware so you can paste from there.
   - **Keywords**: add "Mihrab", keep "prayer times", "qibla", "adhan" etc.
   - **What's New in This Version**: paste the v2.0.7 release notes from `outputs/v207_notes.md`.
6. Upload the new app icon: **App Information** → **App Icon** — drop in `ios/PrayerApp/Images.xcassets/AppIcon.appiconset/AppIcon-1024.png` (the file is already at the right size: 1024×1024, no transparency).
7. Click **Save**. Submit for review when the build is attached.

Apple's review takes 1-3 days. The name change becomes live the moment the v2.0.7 binary is approved.

**Important Apple rule:** the App Name must contain at least one alphanumeric character that's also in your bundle's `CFBundleDisplayName`. The Info.plist now reads "Mihrab" so this is already satisfied.

---

## 4. Google Play Console: rename for the Android listing

Google lets you change the Play Store name without touching the package id. The change is live within a few hours, no review required.

1. Sign in to <https://play.google.com/console/>.
2. Select Prayer Times from the **All apps** list.
3. In the left sidebar: **Grow → Store presence → Main store listing**.
4. Change:
   - **App name** (50-char limit): "Prayer Times" → **Mihrab**
   - **Short description** (80-char limit): pull from `fastlane/metadata/android/en-US/short_description.txt` (already updated).
   - **Full description**: pull from `fastlane/metadata/android/en-US/full_description.txt` (already updated).
5. Upload the new app icon:
   - **App icon**: drop in `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` resized to 512×512 (Play Console expects 512×512). You can re-render with: `npx svgexport branding/01_mihrab.svg /tmp/play-icon.png 512:512`.
6. **Save** at the top.
7. Click **Send X changes for review** at the top right.

Play reviews are typically <24 hours. Once approved, the new name + icon propagate to the Play Store within a few hours.

When you're ready to push the v2.0.7 AAB to Play, build it with `./android/gradlew -p android bundlePlayRelease` (signs with `keystore.properties`) and upload to **Production → Create new release** in the Play Console.

---

## 5. Quick sanity check after all four are live

- iOS launcher shows the pointed-arch icon and reads "Mihrab" under it.
- Android launcher shows the same icon (cropped to the device's adaptive mask) and reads "Mihrab".
- App Store search for "Mihrab" returns your app.
- Play Store search for "Mihrab" returns your app.
- F-Droid listing shows "Mihrab" once the next build cycle completes.
- The About card in-app links to <https://github.com/Hassan-PS/Mihrab>.
- A fresh v2.0.7 install opens the mushaf reader and downloads pages from the new repo URL. (Old v2.0.6 installs continue to work via GitHub's auto-redirect.)

---

## What I deliberately didn't change

- **Android `applicationId` (`com.prayer_times`)** and **iOS bundle id**. Changing these makes v2.0.7 a different app from v2.0.6 — every existing user has to uninstall and reinstall, losing their journal, fasting log, location presets, tasbih state. The brand can be Mihrab without changing the underlying ID.
- **Xcode project file (`PrayerApp.xcodeproj`)**. Renaming this is a 30-minute manual surgery in Xcode + a fresh archive scheme, with non-trivial risk of breaking Xcode Cloud signing. Not worth it for a brand-only rename.
- **F-Droid metadata file path (`metadata/com.prayer_times.yml`)**. The file is named after the package id; F-Droid wouldn't accept a rename without a fresh app submission.
- **Java package paths and notification channel ids**. Internal identifiers; users never see them.

If at any point you want a clean break (new package id, new Play / App Store listing, fresh F-Droid submission), that's a separate one-week effort and we'd treat the existing v2.0.6 installs as a legacy app that no longer receives updates. Keep this in your back pocket; not recommended unless the brand pivot becomes broader than just renaming.
