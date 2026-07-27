# v2.7.40 (224) — release state, 2026-07-27

Released on all four channels. Tag `v2.7.40` = `95b0522`. F-Droid pipeline
#2708744413 SUCCESS (first run, no retries). `verify-release.sh v2.7.40`
printed ALL CHECKS PASSED. Homebrew cask at 2.7.40.

## Play Billing 8 compliance (added after the tag, Play-only)

Play Console policy: Billing Library >= 8.0.0 required by 2026-08-31.
- `android/build.gradle` ext: `playBillingSdkVersion = "8.0.0"` —
  react-native-iap honours this rootProject override.
- `patches/react-native-iap+12.16.2.patch` now also patches
  `RNIapModule.kt` for the Billing 8 API: `PendingPurchasesParams` on the
  client builder, the `queryProductDetailsAsync` listener's second param
  becoming `QueryProductDetailsResult`, and the removed
  `queryPurchaseHistoryAsync` stubbed to resolve an empty array (the tip
  jar never used purchase history).
- The compliant AAB (54,911,115 bytes, built 15:14) at
  `android/app/build/outputs/bundle/playRelease/app-play-release.aab`
  is the one to upload for 224. Verified: play runtime classpath resolves
  `com.android.billingclient:billing[-ktx]:8.0.0`; play flavor Kotlin
  compiles clean. F-Droid/iOS unaffected (react-native-iap is play-only).
- Commit `f4755c7` on main.

## ⚠️ One item still pending

`git push origin main` — commits `f4755c7` (Billing 8) and `84d3428`+
(docs) are local-only; the sandbox has no GitHub credentials. Run the
push from the next session with a working host shell (Desktop Commander)
or any terminal. (The stale `.git` lock files from the outage were
already cleaned up.)

## F-Droid MR 36312 — review round 2 (2026-07-27, later)

linsui reviewed within the hour: ① `reactNativeArchitectures` echo →
`gradleprops:` field, ② delete both `org.gradle.*` gradle.properties
appends (empty suggestion), ③ remove MaintainerNotes. All applied in
fork commit `a4b7826c` (pushed via the GitLab web Replace-file flow —
Desktop Commander was down; the sandbox's pip-installed `fdroidserver`
validated `rewritemeta` no-diff + lint BEFORE pushing, and CI's
rewritemeta job then passed). `contrib/fdroid/com.prayer_times.yml`
matches the fork (local commit 612ea6a, unpushed). All three threads
auto-resolved by the push; summary comment posted tagging @linsui with
the heap-cap history caveat. NOTE: `gradleprops` = command-line `-P`
props — valid for reactNativeArchitectures, INERT for `org.gradle.*`
(launcher reads those only from properties files); if the no-cap build
OOMs (hermesc exit 5), that's the argument to restore the appends.
Pipeline to watch: #2709129320.

## F-Droid MR 36312 (2026-07-27)

The "waiting-on-response" label traced to Licaon_Kter's checklist ask:
the MR-description checkboxes were never ticked. All 7 applicable boxes
are now checked (via Hassan's GitLab session), and a status comment was
posted citing pipeline 2708744413 green on 2.7.40 and @-mentioning
@linsui + @licaon-kter asking what, if anything, still blocks the merge.
Upstream fastlane icon/screenshots and single-version recipe were
already in place.

## Gotcha learned

`patch-package` sweeps `node_modules/<pkg>/android/build/` gradle
artifacts (binary .dex!) into the patch if the library was built in
place. Delete that dir before regenerating a patch.

Round-2 outcome: pipeline #2709129320 ALL NINE JOBS GREEN — fdroid build
passed in 13 min WITHOUT the heap cap (R8-off + arm64-only removed the
pressure; the org.gradle.* appends are confirmed unnecessary). The minimal
recipe (gradleprops only, no MaintainerNotes) is the reviewed, working
state. contrib copy matches the fork.
