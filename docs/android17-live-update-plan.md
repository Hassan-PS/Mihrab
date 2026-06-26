# Android 17 Live Activity — assessment & implementation plan

Status: proposal (June 2026). Owner: Live Activity / notifications.
Related code: `android/app/src/main/java/com/prayer_times/MihrabLiveActivityModule.kt`,
`MihrabLiveActivityService.kt`, `src/notifications/liveActivity.ts`,
`src/liveActivity/syncLiveActivity.ts`.

---

## 0. TL;DR

- **The current implementation already works — and works *better* — on Android 17.** On the Pixel 10 Pro (API 37) the existing `Notification.ProgressStyle` path renders the segmented prayer-day timeline, shows the promoted **status-bar chip with the live countdown**, and pins to the top of the shade and lock screen. `dumpsys` confirms `FLAG_PROMOTED_ONGOING` is granted.
- **Notably, Android 17 promotes our foreground-service notification, which Android 16 did not.** The chip is now available *with* the FGS, removing the trade-off documented in the module header.
- **"iOS-style" parity: largely yes, with one hard limit.** Android's *Live Updates* are Google's official equivalent of iOS Live Activities. We can match the compact **status-bar chip ≈ Dynamic Island compact**, the **expanded promoted card ≈ Lock Screen Live Activity / expanded Island**, plus AOD presence and (new) Wear OS bridging. We **cannot** draw a free-form, pixel-custom "island" — Live Updates forbid custom `RemoteViews` by design, so we adopt system templates (`ProgressStyle` / `MetricStyle`) rather than a bespoke shape.
- **What's genuinely new in Android 17 worth adopting:** the **Semantic Color API**, the new **`MetricStyle`** template, first-class **promotion-introspection APIs** (`canPostPromotedNotifications()`, `hasPromotableCharacteristics()`, `ACTION_MANAGE_APP_PROMOTED_NOTIFICATIONS`), and a system-driven countdown (chip ticks without per-second re-posts → battery win).
- **Plan:** keep the existing path **unchanged for API 36 (Android 16)** and **< 36 (legacy)**, add a new **API ≥ 37** branch (`buildAndroid17`) that layers the 17-only enhancements on top, gated at runtime. Bump `compileSdk` to 37 but **keep `targetSdk` at 36** for now to avoid unrelated API-37 behavior changes.

---

## 1. How the current build looks on Android 17 (captured)

Device: Pixel 10 Pro, Android **17 (API 37, REL)**. App: Mihrab **2.7.17 (198)**, `targetSdk=36`.

| Surface | Result on Android 17 |
|---|---|
| **Lock screen** | LA card at top: `Asr · 4:25:18 / 17:35` + green **segmented `ProgressStyle` timeline**. |
| **Status bar (unlocked)** | Promoted **chip** next to the clock showing the live countdown `4:23:49` (`shortCriticalText`). |
| **Shade** | LA pinned at the top of the drawer, above all other notifications, with the segmented timeline. |
| **AOD** | Present (promoted ongoing surfaces on Always-On Display). |

`dumpsys notification` for our notification (`channel=mihrab_live_activity_v3`):

```
flags = ONGOING_EVENT | ONLY_ALERT_ONCE | NO_CLEAR | FOREGROUND_SERVICE | PROMOTED_ONGOING
android.template               = android.app.Notification$ProgressStyle
android.requestPromotedOngoing = true
android.shortCriticalText      = "4:23:49"  (length 7)
category = navigation, color = 0xff1f5f4a, vis = PUBLIC
```

SystemUI handled it via `PromotedOngoing` / `ChipbarCoordinator` / `KeyguardChipbarViewBinder`.

**Conclusion:** nothing is broken on Android 17. The "new implementation" is an *enhancement layer*, not a rescue.

Screenshots captured: lock screen, home + chip, shade (shared alongside this plan).

---

## 2. What Android 17 changes for Live Updates

Sourced from Google's Android 17 docs (links at the end).

### 2.1 Live Updates are the official iOS-Live-Activity equivalent
Live Updates surface "real-time, persistent" status across **AOD, lock screen, status bar (chip), and heads-up**. A qualifying notification must be:

- one of **Standard, `BigTextStyle`, `CallStyle`, `ProgressStyle`, or `MetricStyle`**;
- declare **`android.permission.POST_PROMOTED_NOTIFICATIONS`** (we already do, manifest line 21);
- call **`setRequestPromotedOngoing(true)`** (or `EXTRA_REQUEST_PROMOTED_ONGOING`);
- be **ongoing**, have a **`contentTitle`**, **no custom `RemoteViews`**, not be a **group summary**, not be **colorized**, and not use an **`IMPORTANCE_MIN`** channel.

Promoted cards are **expanded by default and uncollapsible**. The status chip is **≤ 96 dp**, shows full text only if < 7 chars, otherwise as much as fits, else icon-only — our `4:23:49` (7 chars) fits exactly.

### 2.2 New in Android 17 (API 37)
1. **Semantic Color API** for Live Updates — `Notification.createSemanticStyleAnnotation(SEMANTIC_STYLE_{INFO|SAFE|CAUTION|DANGER|UNSPECIFIED})` applied via spannable text, plus semantic coloring on `Notification`, `Notification.Metric`, `ProgressStyle.Point`, `ProgressStyle.Segment`. Meaning-based: Green=safe, Orange=caution, Red=danger, Blue=info.
2. **`MetricStyle`** — a new Live-Update-eligible template (sits alongside `ProgressStyle`); a natural fit for the "countdown-focused" design.
3. **Promotion-introspection APIs** — `Notification.FLAG_PROMOTED_ONGOING`, `Notification.hasPromotableCharacteristics()`, `NotificationManager.canPostPromotedNotifications()`, and `Settings.ACTION_MANAGE_APP_PROMOTED_NOTIFICATIONS` (deep-link the user to enable Live Updates if they turned them off).
4. **Custom notification view size restrictions tightened** — only bites apps **targeting API 37**; irrelevant to Live Updates (which forbid custom views anyway) but relevant to our legacy `< 36` RemoteViews path if/when we bump `targetSdk`.
5. **Compose Live Update API** and **Wear OS bridging** of Live Updates.

### 2.3 What is still *not* possible
- **No custom-drawn island / RemoteViews in a Live Update.** Google explicitly forbids it ("custom notifications make consistent testing and UX difficult… avoid `RemoteViews`"). So an iOS-identical, fully bespoke Dynamic Island is out; we use the sanctioned templates.

---

## 3. iOS parity assessment

| iOS Live Activity element | Android 17 equivalent | Parity |
|---|---|---|
| Dynamic Island — **compact / minimal** | **Status-bar chip** (`shortCriticalText` / `when`, ≤96 dp) | ✅ Have it |
| Dynamic Island — **expanded** | **Promoted card** (expanded-by-default, uncollapsible) | ✅ Have it (ProgressStyle) |
| Lock Screen Live Activity | **Promoted card on lock screen** | ✅ Have it |
| Live countdown without app work | **`setWhen` + chronometer countdown** (system-ticked) | ⚠️ Switch to this (see §5.4) |
| Fully custom SwiftUI layout | System templates only (`ProgressStyle`/`MetricStyle` + semantic color) | ❌ Not allowed |
| — | **Wear OS bridging**, **Always-On presence** | ✅ Bonus over iOS |

**Verdict:** we can reach functional parity with the iOS Live Activity's *behaviour and surfaces* on Android 17, and even exceed it (Wear). We cannot reach pixel-for-pixel custom-island parity — that's a platform constraint, not an implementation gap.

---

## 4. Proposed architecture (keep 16, add 17)

Today the builder branches once: `Build.VERSION.SDK_INT >= 36` → `buildAndroid16(...)`, else legacy RemoteViews. Add a third branch so each OS generation is independently maintainable:

```
buildNotificationFromPayload(ctx, p):
    when {
        SDK_INT >= 37 -> buildAndroid17(ctx, p, …)   // NEW: enhancement layer
        SDK_INT == 36 -> buildAndroid16(ctx, p, …)   // UNCHANGED (Android 16 users)
        else          -> buildLegacy(ctx, …)         // UNCHANGED (custom RemoteViews)
    }
```

`buildAndroid17` starts as a copy of `buildAndroid16` (same `ProgressStyle` timeline + `countdown` design) and adds only the 17-only improvements in §5. This guarantees **zero behavioural change for Android 16 users** and isolates risk to the new branch.

Keep the single-foreground-service lifecycle as-is (it now coexists with promotion on 17). Re-evaluate dropping the FGS only after §5.4 lands.

---

## 5. Android 17 enhancements (the "new implementation")

Ordered by value/effort.

### 5.1 Call the real promotion APIs instead of reflection
With `compileSdk = 37`, replace the reflective `tryRequestPromotedOngoing` / `tryAttachShortCriticalText` with direct, type-checked calls in the `>= 37` branch:
`builder.setRequestPromotedOngoing(true)` and `builder.setShortCriticalText(shortText)`. Keep the reflection helpers for the `== 36` path (compileSdk 37 can still target runtime 36 safely). Lower crash surface, clearer code.

### 5.2 Detect & recover when the user disabled Live Updates
Use `NotificationManager.canPostPromotedNotifications()` (and `hasPromotableCharacteristics()` for self-check) to know if promotion will actually happen. If the user turned Live Updates off for Mihrab, surface a one-tap fix in Settings via `startActivity(Settings.ACTION_MANAGE_APP_PROMOTED_NOTIFICATIONS)`. This removes a silent-failure mode that's invisible today.

### 5.3 Adopt `MetricStyle` for the "countdown" design (evaluate)
The app already exposes two designs (`timeline`, `countdown`). On 17, map `countdown` → **`MetricStyle`** (a large, glanceable metric) and keep `timeline` → `ProgressStyle`. Verify the exact `MetricStyle` builder API against the API-37 reference before committing; fall back to the current big-title approach if it doesn't fit the "remaining time" metric cleanly.

### 5.4 System-driven countdown (battery)
Today `MihrabLiveActivityService` re-posts **every second** to tick the chip/timeline. On 17, prefer `setWhen(nextEpochMs)` + `setUsesChronometer(true)` + `setChronometerCountDown(true)` so the **system** ticks the chip and time, and re-post only when the segment/next-prayer actually changes (≈ 5–6 times/day) or each minute for the timeline fill. Expected: large reduction in wakeups while keeping a live chip. This is also the closest analog to iOS's system-rendered timer.

### 5.5 Semantic color (optional / subtle)
Prayer countdown isn't a safety signal, so semantic colors are a weak fit for the main accent (we keep the brand/Material-You accent on segments). Possible tasteful use: tint the **imminent** state (e.g., < 5 min to prayer) with `SEMANTIC_STYLE_CAUTION`, or mark the current segment. Treat as polish, not core.

### 5.6 Wear OS (stretch)
Live Updates bridge to connected Wear OS devices automatically; verify the prayer chip/timeline bridges acceptably and add a local Wear Live Update only if the bridged form is poor. Stretch goal.

---

## 6. Build & distribution changes

| Change | Detail | Risk |
|---|---|---|
| `compileSdkVersion = 37` | `android/build.gradle` line 5. Needed for the 17-only APIs (semantic color, `MetricStyle`, `canPostPromotedNotifications`, direct `setRequestPromotedOngoing`). | Low. CI/F-Droid build env must have **SDK Platform 37** installed. |
| `targetSdkVersion` **stays 36** (for now) | Avoids unrelated API-37 behavior changes (background-audio hardening, large-screen orientation, static-final restriction, custom-view size cap). Live Updates do **not** require `targetSdk 37`. | Low. Decouples this work from a full target bump. |
| Runtime gating | All new calls behind `Build.VERSION.SDK_INT >= 37`. | Low. |
| F-Droid | Pure additive Kotlin + an SDK bump; no new deps, nothing pulling Play Services. F-Droid CI just needs platform-37. The existing `POST_PROMOTED_NOTIFICATIONS` permission is non-Play, FOSS-safe. | Low — keep MR 36312 green; verify the build image has SDK 37. |
| Play / App Store | Android-only change; iOS untouched. | None for iOS. |

When we later bump `targetSdk` to 37, audit the **custom-view size restriction** against the legacy `< 36` RemoteViews layout (`notification_live_activity.xml`) and the FGS path — that's the one place it could bite.

---

## 7. Risks & mitigations

- **OEM variance.** Docs warn OEMs may add Live-Update eligibility criteria. Mitigation: keep the graceful chain (promoted → plain ongoing → legacy) and test on at least Pixel + one OEM (Samsung/Xiaomi).
- **User dismissal / demotion.** Promoted notifications can be demoted to standard by the user; don't fight it, and use `setDeleteIntent` (already present) to avoid re-pinning dismissed updates. Consider an **Unpin** action per Google's guidance.
- **`MetricStyle` API uncertainty.** Validate against the API-37 reference; keep `ProgressStyle` as the guaranteed path.
- **Battery regression** if §5.4 is done wrong. Mitigation: measure wakeups before/after; gate seconds-precision to screen-on only (already a pattern via `withSeconds`).
- **compileSdk 37 in CI.** Ensure both local and F-Droid build images have platform 37 before merging.

---

## 8. Phasing & rough effort

1. **Phase 0 — scaffold (½ day):** add the `>= 37` branch as a clone of `buildAndroid16`; bump `compileSdk 37`, keep `targetSdk 36`; confirm parity on the Pixel 10 Pro. No behaviour change.
2. **Phase 1 — robustness (1 day):** direct promotion APIs (§5.1) + promotion introspection & Settings deep-link (§5.2). Highest reliability payoff.
3. **Phase 2 — battery (1 day):** system-driven countdown (§5.4); measure wakeups.
4. **Phase 3 — design (1–2 days):** `MetricStyle` countdown design (§5.3) + optional semantic color polish (§5.5).
5. **Phase 4 — stretch:** Wear OS bridging check (§5.6).

Phases 0–2 deliver the meaningful Android 17 wins (cleaner promotion, self-healing, lower battery) with low risk; 3–4 are polish/parity.

---

## 9. Sources

- [Android 17 — Features and APIs (Live Update Semantic Color API)](https://developer.android.com/about/versions/17/features)
- [Android 17 — behavior changes (apps targeting 17)](https://developer.android.com/about/versions/17/behavior-changes-17)
- [Create live update notifications (Views)](https://developer.android.com/develop/ui/views/notifications/live-update)
- [Create live update notifications (Compose)](https://developer.android.com/develop/ui/compose/notifications/live-update)
- [Android 16 — Progress-centric notifications (ProgressStyle baseline)](https://developer.android.com/about/versions/16/features/progress-centric-notifications)
- [Android 17 is here (blog)](https://android-developers.googleblog.com/2026/06/Android-17.html)
- [Live Updates platform sample](https://github.com/android/platform-samples/tree/main/samples/user-interface/live-updates)
