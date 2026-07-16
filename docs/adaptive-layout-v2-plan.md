# Adaptive layout v2 — iPad & Mac polish plan

Audit date: 2026-07-16, on the shipping 2.7.37 build running on an Apple-Silicon Mac
(Arabic/RTL UI, window tested at expanded ≈1500pt and regular ≈1000pt) plus code
review of `src/responsive/*`, `HomeScreen`, `QuranScreen`, `MushafReader`.

## Audit findings

### General (cross-app)
- **G1 — RTL centering broken on wide list screens.** The Quran index renders its
  whole 720pt column pinned to the trailing (right) edge; the left half of the
  window is empty. Cause: `listWide: { maxWidth: 720, alignSelf: 'center' }` on a
  FlatList doesn't center under RTL the way `CenteredColumn` does. Every screen
  that hand-rolls `maxWidth + alignSelf` instead of `CenteredColumn` needs the
  same check.
- **G2 — Sheets stretch edge-to-edge on wide windows.** The ayah action sheet
  spans the full ~1400pt window: one ayah line across the whole width, control
  rows with the label at one edge and the control at the other. Applies to every
  bottom sheet (ayah sheet, reciter picker, khatmah menus). `ResponsiveModal`
  exists but isn't used here.
- **G3 — BIDI/i18n breaks in mixed-direction lines.** The hero's data-freshness
  line renders scrambled in Arabic: "آخر تحديث 485 · Jul 9 يومًا مخزّنة".
  Embedded Latin ("Jul 9") needs bidi isolation and a locale-aware date format.
  Also untranslated strings in Settings ("SAVED LOCATIONS" + helper) — 13-locale
  parity break.
- **G4 — No pointer affordances.** On Mac/iPad-trackpad: trackpad scroll does
  NOT turn mushaf pages; no hover cues; no keyboard shortcuts; Esc doesn't exit
  mushaf fullscreen.
- **G5 — Full-width header vs capped content.** The nav header (brand, location
  chip, gear) spans the window while content caps at 720/1180pt — looks detached
  on wide windows.

### Home dashboard (expanded)
- **H1 — Vertical dead space.** The dashboard is top-anchored; on a tall window
  the bottom ~40% is empty while the hero stays phone-sized.
- **H2 — Tools grid ragged.** 7 tiles flow 5-across + orphans; tiles cramped;
  orphan alignment inconsistent in RTL. (QuickActionsGrid still uses fixed
  `flexBasis '31%'`, not AdaptiveGrid.)
- **H3 — Column imbalance.** `dashRow` = fixed `HOME_MAIN_COL` main column +
  `flex:1` sidebar, `alignItems:'flex-start'`; sidebar is sparse and shorter
  than the main column; no vertical rhythm.
- **H4 — Dashboard threshold.** Two-column kicks in at ≥1100pt where it's still
  cramped; at ~1140pt tiles are tiny.

### Mushaf (raw Arabic Quran)
- **M1 — Duplicated chrome in the spread.** Dual-page mode renders per-page
  chrome twice: two "Night" pills, two Juz labels (windowed) and two surah
  names (fullscreen). Should be ONE chrome band per spread; only the page-number
  ovals belong per page.
- **M2 — No way to turn pages with a pointer.** Trackpad scroll doesn't page;
  only touch-style drag works. Needs hover chevrons (prev/next) and ideally
  arrow-key support; Esc should exit fullscreen.
- **M3 — No spread seam.** Facing pages butt together with zero gutter — a small
  center gap/fold hint reads better and prevents cross-page text collision.
- **M4 — Spread threshold.** `dualPage = landscape && width ≥ 900` → per-page
  columns as narrow as 450pt. Tune to per-page ≥ ~470pt and keep single-page
  otherwise.
- **M5 — Ayah sheet full-width (G2)** is most painful here, over the reader.

## Plan (phased, prioritized)

### Phase A — general foundations
1. **A1 (G1): RTL-safe wide centering.** Replace hand-rolled `maxWidth+alignSelf`
   wrappers with `CenteredColumn` (outer `alignItems:'center'` is RTL-proof).
   Screens: Quran index (FlatList header+list), and audit Duas/Mosques/Backup/
   Downloads/Month for the same pattern.
2. **A2 (G2/M5): ResponsiveModal for sheets.** On regular/expanded, the ayah
   action sheet (and reciter picker) render as a centered card capped at
   ~640pt; compact keeps the bottom sheet unchanged.
3. **A3 (G3): BIDI + i18n fixes.** Wrap embedded Latin runs in the hero status
   line with Unicode isolates (U+2066/U+2069) or reorder per direction; use
   locale-aware date formatting; translate the SAVED LOCATIONS block (13 locales).
4. **A4 (G5): align header with content cap** where feasible (header content
   max-width matches the screen's column).

### Phase B — Home dashboard
1. **B1 (H1): fill the window.** Wrap the dashboard in a min-height container
   that vertically centers when content is shorter than the viewport; scale the
   hero up on expanded (larger time + paddings).
2. **B2 (H2): tools grid → AdaptiveGrid** with `minItemWidth≈150`, and
   `maxColumns` 3 in the sidebar — 7 tiles form 3+3+1→ balanced rows; verify RTL
   flow order.
3. **B3 (H3): column balance.** Ratio columns (main ≈ 0.58 / sidebar ≈ 0.42 of
   the 1180 cap) instead of fixed pt; `alignItems:'stretch'`; consistent 12pt
   rhythm in the sidebar.
4. **B4 (H4): threshold tune.** Dashboard at ≥1180pt (else the centered single
   column) so the two-column form always has room.

### Phase C — Mushaf
1. **C1 (M1): de-duplicate spread chrome.** Lift the Juz label + Night pill +
   (fullscreen) surah name out of `renderPage` into ONE spread-level header row
   when `dualPage`; keep per-page page-number ovals.
2. **C2 (M2): pointer paging.** Hover-revealed chevron buttons at the left/right
   edges (Pressable `hovered` state — appears only with a pointer); they call the
   existing `scrollXForPage` navigation. Investigate hardware-keyboard arrows
   (needs native key handling on iOS — separate task if not cheap). Esc exits
   fullscreen where key events are available.
3. **C3 (M3/M4): spread polish.** 12pt center gutter with a hairline fold hint;
   `dualPage` requires per-page width ≥ 470pt.
4. **C4: verification pass** on iPad Pro 13" simulator (portrait single-page,
   landscape spread) + Mac window at 3 widths, LTR + RTL.

### Ordering & risk
- A1, C1, B1–B3 are the visible wins; do them first (this pass).
- A2 touches the most complex component (ayah sheet) — implement behind the
  existing ResponsiveModal so compact is byte-identical.
- A3's locale edits must land in all 13 files in one commit.
- Phone layouts must stay pixel-identical: every change gates on
  `bp !== 'compact'` (or `dualPage`).

### Verification checklist (per phase)
- iPad Pro 13" sim: portrait + landscape, en + ar.
- Mac (Designed for iPad): 1500pt, 1100pt, 800pt windows.
- iPhone sim: unchanged snapshots of Home + mushaf.
- `NODE_ENV=test npx jest` (mushafSpread + responsive units green).
