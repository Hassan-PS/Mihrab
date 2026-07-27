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

## ⚠️ Cleanup owed to a Desktop Commander outage mid-release

The MCP shell died after the AAB rebuild; commit `f4755c7` was made
through the sandbox mount, which cannot unlink git temp files. On the
next host shell in `~/git/PrayerApp`:

```sh
rm -f .git/HEAD.lock .git/objects/*/tmp_obj_*   # stale sandbox locks
git push origin main                            # f4755c7 is unpushed
```

(Until `HEAD.lock` is removed, host-side `git commit`/`checkout` will fail
with "File exists".)

## Gotcha learned

`patch-package` sweeps `node_modules/<pkg>/android/build/` gradle
artifacts (binary .dex!) into the patch if the library was built in
place. Delete that dir before regenerating a patch.
