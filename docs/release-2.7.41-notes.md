# v2.7.41 (225) — 2026-07-29

Tag `v2.7.41` = `b78bab6`. Three user-reported bugs, all reproduced and
verified on device before release.

## 1. Phone landscape mushaf (the deep one)

Report: "turning a phone horizontal … tries to open double pages as if it
is an iPad; it should show the single page zoomed in and scrollable while
all functionality is reserved."

Two defects stacked:

- **Gating was width-only** (`landscape && width >= 960`). A tall phone in
  landscape IS ~1280dp wide, so phones got the tablet spread on a 576dp-tall
  screen. Now gated on the physical screen's shorter side (<600dp = phone),
  extracted as the unit-tested `mushafLayoutMode()` in `mushafSpread.ts`.
- **Single-page landscape rendered BLANK.** The pager lays all 604 pages out
  absolutely inside one content box (604 × pageW). At `pageW` = full
  landscape width that puts a mid-mushaf page's left edge past ~1.3 M px —
  beyond what Android will rasterise. Phone landscape now uses a WINDOWED
  strip (only the mounted pages, offsets relative to the highest mounted
  page) so coordinates stay small; the re-anchor effect recenters the window
  after each page turn.

Phone landscape = `phoneLandscape`: one page fitted to the full window width,
uncapped/unstretched, inside a vertical `ScrollView` (`PageViewport`). Verified
on the emulator at 576×1280dp (300dpi): width-fitted page, vertical scroll,
long-press → correct ayah sheet (3:4), swipe → page 50 → 51 with recentre.
iPad/Mac untouched (`isPhoneDevice` false → identical dual-page path).

## 2. Arabic surah names truncated

"آل عمران" wrapped at the space on narrow rows and lost the second word.
Fixed by joining with U+00A0 (unwrappable) + `flexShrink: 0`, so the
flexible left column yields instead. `adjustsFontSizeToFit` remains as a
net for extreme font scales. Verified at 480dpi (360dp wide) and 300dpi.

## 3. macOS Settings gear intermittent

The location chip + gear lived in the transparent navigation bar, which on
Catalyst sits inside the window's title-bar DRAG REGION — clicks were
sometimes swallowed as window drags. The row moved to
`navigation/HomeHeaderControls.tsx` and renders on Catalyst as a pinned
absolute overlay just below the title bar (also above the scale-transformed
dashboard). Verified with 4 consecutive open/close cycles on the Catalyst
build; every click registered.

## Release

All four channels; `verify-release.sh v2.7.41` → ALL CHECKS PASSED.
637 jest tests (6 new for `mushafLayoutMode`), tsc clean, Kotlin compiles
at compileSdk 37 and 36. Play AAB inherits the Billing 8 work from 2.7.40.
