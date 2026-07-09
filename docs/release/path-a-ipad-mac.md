# Path A — ship the iPad app + make it available on Mac (Apple Silicon)

This is the fast path to macOS: distribute the **existing universal iPad binary** on
Apple-Silicon Macs via App Store Connect's "Designed for iPad" option. No Catalyst
target, no separate build. The same Xcode Cloud pipeline that already ships iOS does
all the building.

The app is technically ready for this today:

- `TARGETED_DEVICE_FAMILY = "1,2"` (universal iPhone + iPad) on all four configs.
- iPad supports all orientations; `UIRequiresFullScreen = NO` (free window resize).
- Layouts reflow to window size (Home dashboard, centred reading, grids, dual-page
  mushaf, two-column Settings).
- Mac-incompatible features are feature-gated off (`isMacCatalyst`): Live Activity
  no-ops, Qibla/magnetometer is removed for this version.

## What the release automation already did (v2.7.36 / 217)

- Bumped iOS + Android versions together.
- CHANGELOG + localised store notes (en-US, ar, sv-SE).
- Pushed `main` (→ Xcode Cloud **Beta**/TestFlight) and tagged `v2.7.36`
  (→ Xcode Cloud **Release**/App Store).

## What you do in App Store Connect (manual — needs your Apple account)

These steps are yours because they require signing in to App Store Connect and can't
be automated from here.

1. **Wait for the Xcode Cloud build to finish** and appear under the app's
   TestFlight / App Store build list (the `v2.7.36` tag triggers the Release
   workflow; verify a build with version 2.7.36 (217) lands).

2. **Add iPad screenshots.** In *App Store Connect → your app → (version) → App
   Previews and Screenshots*, add the **iPad 13-inch** (and/or 12.9-inch) set.
   - The generated set is in `fastlane/ipad-screenshots/` (2732 × 2048, landscape).
   - App Store Connect requires at least one iPad screenshot before it will let you
     enable iPad — you cannot ship the iPad/Mac app without them.
   - You can drag more/replace later; order them best-first.

3. **Enable the Mac (Apple Silicon) availability.**
   - Go to *App Store Connect → your app → Pricing and Availability* (or the
     *App Availability* / *Platforms* section, depending on the current UI).
   - Turn on **"Make this app available on Apple Silicon Macs"** (a.k.a. "Designed
     for iPad" on Mac). This is a single toggle — no separate Mac binary.
   - Note: this is only offered when the build is a compatible iPad app (it is).

4. **Fill the version metadata** for 2.7.36 if not inherited: the "What's New"
   text (reuse the CHANGELOG 2.7.36 highlights), keywords, etc.

5. **Submit for review.** One submission covers iPhone, iPad, and the Mac
   ("Designed for iPad") availability. Apple reviews it as the iOS app.

## Caveats to expect on Mac (Designed for iPad)

- It runs the iPad app in a **resizable Mac window** — exactly the adapt-to-size
  experience. It is **not** a fully native Mac app (that's Path B / Catalyst).
- iOS-only surfaces degrade gracefully: **Live Activity** doesn't run on Mac (gated
  off), **home-screen widgets** are limited, **Qibla** is already removed this
  version. Core prayer times, Quran, duas, tasbih, month view, journal, fasting all
  work.
- If you later want a more native Mac app (menu bar, native window chrome), that's
  **Path B — Mac Catalyst**, which needs `SUPPORTS_MACCATALYST = YES`, Mac
  entitlements/signing, and `#if !targetEnvironment(macCatalyst)` guards around the
  ActivityKit Swift. Not required for Path A.

## Regenerating the iPad screenshots

The set was rendered from a Release simulator build (no dev overlays). To refresh
after UI changes: install the Release build on an iPad simulator, capture screens,
and re-run the compositor. The pristine source is the TestFlight/Release build — a
dev (Metro) build shows debug toasts that shouldn't ship to the store.
