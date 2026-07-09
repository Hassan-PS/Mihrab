# Adaptive layout plan — iPad + macOS (Catalyst)

Goal: **one codebase, one app, layouts that reflow *live* as the window resizes** — a
two-page mushaf spread on a wide window, the Home cards self-arranging to fill the
space without scrolling, everything collapsing back to a comfortable single scrollable
column as the window narrows. Same experience on iPhone, iPad, and a resizable Mac
window (Mac Catalyst).

This plan maps **every screen**, the **shared primitives** to build first, the
**navigation** change, the **Catalyst** enablement, and a **phased order** where each
phase is shippable on its own (and improves iPad along the way).

---

## 0. Principles

Anchored in `docs/design/principles.md` — width is not an excuse for noise.

1. **Comfortable measure, never stretched.** Text and rows keep a readable width
   (`MAX_CONTENT_WIDTH ≈ 720pt`, wider for tables). Extra width becomes **columns,
   panes, or margin** — never a 1600pt-wide prayer row.
2. **Live reflow.** Everything keys off `useWindowDimensions()` / `useBreakpoint()`,
   so dragging the Mac window re-lays-out instantly and returns to scrollable when small.
3. **Three breakpoints** (already defined in `src/responsive/breakpoints.ts`):
   - **compact** `< 700pt` — today's phone layout (unchanged baseline).
   - **regular** `700–1100pt` — iPad portrait, large phone landscape, small Mac window.
   - **expanded** `≥ 1100pt` — iPad landscape, wide Mac window → multi-pane / dashboard.
4. **Calm before clever.** More space = more breathing room and fewer taps (inline
   detail instead of push), not more chrome.
5. **RTL parity.** Every column/pane split mirrors correctly in Arabic/Urdu.

Current state: `breakpoints.ts` exists; `useBreakpoint()` is imported+called (but its
result **discarded**) in Duas/Tasbih/Fasting/Settings/Journal/MonthTimes; `contentColumnWidth`
/ `MAX_CONTENT_WIDTH` have **no consumers**. So: foundation stubbed, zero screens reflow yet.

### ⚠️ Critical prerequisite (fixed) — device family

Before ANY of this is visible on iPad/Mac: the **main app target had no
`TARGETED_DEVICE_FAMILY`**, so iOS ran the app at **375 pt iPhone-compat** even on
iPad — every responsive layout silently stayed on the `compact` path. Fixed by adding
`TARGETED_DEVICE_FAMILY = "1,2"` to the app target (Debug + Release); verified the built
app now reports `UIDeviceFamily [1,2]` and renders at native iPad width. Also note the
**iPad Air 11" simulator reports a 663 pt portrait window** (below the 700 `regular`
threshold → `compact`), so `regular`/`expanded` layouts only engage on a **larger iPad
(Pro 13" = 1024 pt portrait) or in landscape**. Test wide layouts there.

### Progress log

- **Phase 0 — DONE & verified.** `breakpoints.ts` extended (`useResponsive`, `useColumns`,
  `columnsFor`, `isMacCatalyst`); `CenteredColumn` + `AdaptiveGrid` built; unit tests green.
- **Phase 1 — partial.** Home / Settings / Fasting / Journal content centered;
  `QuickActionsGrid` → `AdaptiveGrid` (verified 6-column reflow on iPad). Remaining:
  Duas, Tasbih, Month, Quran index, secondary screens; modals → `ResponsiveModal`.
- **Phase 2 — DONE & verified.** Home two-column dashboard on `expanded` (fixed "today"
  main column + flexible tools sidebar); collapses to single column below. Verified the
  2-column layout renders on the iPad (forced-low breakpoint).
- **Catalyst groundwork — DONE.** iPad family + all iPad orientations + `UIRequiresFullScreen NO`.
- **Phases 3–6 — remaining.** Mushaf dual-page (Phase 3), master-detail screens (Phase 4),
  nav shell (Phase 5), widget port + feature-gating + signing/distribution (Phase 6).

---

## 1. Foundations (build first — Phase 0)

Shared primitives so every screen adapts consistently instead of each reinventing it.

1. **Extend `src/responsive/breakpoints.ts`:**
   - `useResponsive()` → `{ width, height, bp, isWide, isLandscape, gutter, contentWidth }`.
   - `useColumns(minItemWidth, { max, gutter })` → integer column count from available width.
   - `isMacCatalyst` flag (`Platform.OS === 'ios' && Platform.isMacCatalyst`-style check via a
     native constant) for feature-gating and window chrome.
2. **`<CenteredColumn maxWidth={720}>`** — centers content and applies side margin on
   regular/expanded, full-bleed on compact. The cheap universal fix; wraps almost every screen.
3. **`<AdaptiveGrid minItemWidth gutter>`** — flex-wrap grid that computes its own column
   count (replaces the hard-coded `flexBasis: '31%'` in `QuickActionsGrid` and every other grid).
4. **`<ResponsiveModal>`** — bottom-sheet on compact, **centered popover/dialog** (capped
   width, backdrop) on regular/expanded. All existing modals adopt it.
5. **`<SplitView master detail>`** — persistent list-pane + detail-pane on expanded;
   transparently falls back to push-navigation on compact/regular. Used by Settings, Duas,
   Quran index, Journal.
6. **Adaptive navigation shell** (bigger; Phase 5) — a persistent left **Sidebar** on
   expanded (Home · Quran · Duas · Tasbih · Qibla · Fasting · Journal · Month · Settings)
   with an inner content pane, instead of pushing full screens. Compact/regular keep the
   current native-stack header + push.

---

## 2. Per-screen plan

Legend — **C** compact, **R** regular, **E** expanded.

### Home — `HomeScreen.tsx` (+ `home/*`)
Today: one vertical `ScrollView` → NextPrayerCard → DayCarousel → QuranShortcut →
QuickActionsGrid (fixed 3-col) → DataStatsPanel.
- **C:** unchanged.
- **R:** wrap in `CenteredColumn`. NextPrayerCard + today's prayer table sit **side by
  side** (2 cols); QuickActionsGrid → 4–6 cols via `AdaptiveGrid`.
- **E:** **dashboard** — cards become tiles in an `AdaptiveGrid` that *fills the window
  without scrolling*: hero NextPrayer (large countdown), today's full 6-row table (no
  carousel), the **week ahead** as a 7-column strip, quick actions, and the stats panel,
  self-arranging into 2–3 columns. Shrink the window → columns collapse → scroll returns.
- Work: give each home card a preferred column span; replace the `ScrollView` stack with a
  span-aware grid driven by `useColumns`.

- **`NextPrayerCard`** — cap width; on E show next-2 prayers + bigger numerals (keep tabular-nums).
- **`DayCarousel` / `PrayerRow` / `DayCard`** — the "cards align themselves as it grows"
  request: C = swipe one day; **R/E = render the whole week as aligned columns/rows**
  (no horizontal paging when width allows). This is a dedicated `WeekGrid` variant.
- **`QuickActionsGrid`** — swap `flexBasis:'31%'` for `AdaptiveGrid(minItemWidth≈150)`.
- **`DataStatsPanel` / `ProviderFooter` / `RamadanCountdownCard`** — become dashboard tiles on E.

### Quran index — `QuranScreen.tsx`
Today: tabs (Surah/Juz/Bookmarks) + votd + khatmah + search, single column.
- **C:** unchanged.
- **R:** surah list → 2-col `AdaptiveGrid`; votd/khatmah/search across the top capped.
- **E:** **`SplitView`** — persistent left surah/juz/bookmarks list; selecting a surah opens
  the **mushaf/translation inline in the right pane** (no full-screen push). Search + votd header.

### Mushaf reader — `MushafReader.tsx` ★ headline feature
Today: horizontal `pagingEnabled` ScrollView, 3 mounted pages, **one page** at a time
(`screenWidth = windowWidth`), render-cache keyed by display size, ayah geometry mapped per page.
- **C / R-portrait:** single page (unchanged).
- **E / any width ≫ height:** **dual-page spread** — two pages side by side in true mushaf
  order (RTL: page *N* on the **right**, *N+1* on the **left**), the pager advances by **2**,
  the spread **fills the window** (each page = min(window/2, height-fit), preserving the
  Madinah page aspect). Opening page handled like a physical mushaf (1 alone, then 2–3, 4–5 …).
- Work: make a "slide" hold a **page-pair**; per-page target pixel size = half-window (the
  existing render cache already keys off display size, so sharpness carries over); map ayah
  tap/long-press hit-testing to the correct half; keep fullscreen filling the window; a
  Single/Spread toggle + auto (by aspect). Narrow the window → back to single, live.
- This is the single biggest and highest-value piece.

### Surah/translation reader — `QuranSurahScreen.tsx`
- **C:** single-column ayah cards.
- **R:** `CenteredColumn` at a reading measure (~760).
- **E:** optional **two-column per ayah** (Arabic ∥ translation) on very wide; otherwise keep
  the centered measure — never run Arabic lines the full 1600pt.

### Duas — `DuasScreen.tsx`
- **C:** category chips + single-column dua list.
- **R:** dua cards → 2-col `AdaptiveGrid`.
- **E:** **`SplitView`** — categories become a left rail; selected category's duas fill the
  right pane in 1–2 columns; dua text keeps a comfortable measure.

### Tasbih — `TasbihScreen.tsx`
- **C:** big centered counter + Prev/Reset/Next.
- **R/E:** counter stays centered in a capped square (don't stretch the giant number); on E
  place the **dhikr list/picker beside** the counter (two-pane) so switching dhikr needs no nav.

### Qibla — `CompassScreen.tsx` ⚠︎ no magnetometer on Mac
- **iPad:** center the compass in a capped square; put the bearing/help panel beside it on E.
- **Mac (Catalyst):** **feature-gate off** — hide from the sidebar / show a "compass needs a
  device sensor" note. (Native `Compass` module no-ops on Mac.)

### Fasting — `FastingScreen.tsx`
- **C:** today toggle + stats + upcoming list (single column).
- **R/E:** two columns — left today+stats, right the **upcoming fasts** list (2-col grid on E);
  centered/capped.

### Journal — `JournalScreen.tsx`
- **C:** day list + per-day prayer log.
- **R/E:** **`SplitView`** — left a day list (or a month **calendar grid** on E), right the
  selected day's prayer log + notes; streak stats across the top.

### Month times — `MonthTimesScreen.tsx`
- **C:** `FlatList` of day rows.
- **R/E:** the whole month as a **table/grid** (rows = days, columns = the 6 prayers) that
  fills the width like a schedule — this screen benefits most from width. Cap or full-bleed
  with tabular-nums alignment.

### Settings — `SettingsScreen.tsx` (+ `settings/*Card`, `*Modal`)
- **C:** vertical scroll of cards; modals as bottom sheets.
- **R:** `CenteredColumn`.
- **E:** **`SplitView`** — left a category list (Appearance · Location · Data source ·
  Calculation · Notifications · Live Activity · Saved locations · About), right the selected
  card. Method/PreReminder/SoundPicker/PrayerOffsets/Language modals → `ResponsiveModal`
  (centered popovers on wide).

### Secondary screens
- **Mosques** (`MosquesScreen`) — opens Maps; just `CenteredColumn` any content.
- **Backup** (`BackupScreen`) / **Quran downloads** (`QuranDownloadsScreen`) —
  `CenteredColumn`; downloads list capped; disk-usage rows in a 2-col grid on E.
- **Share month** (`ShareMonthScreen`) — preview scales to fit; center controls.
- **Onboarding / LocationSetup / FeatureTourModal / PhaseScreen** — center the flow in a
  capped card on wide (FeatureTour already reads window dims); modal → centered dialog.
- **All modals / sheets** (Method, PreReminder, SoundPicker, PrayerOffsets, Language,
  location selector, ayah action sheet) → `ResponsiveModal`.

---

## 3. Navigation shell (Phase 5, optional but "desktop-grade")

Introduce an adaptive navigator: **expanded** → persistent Sidebar + content pane
(NavigationSplitView feel); **compact/regular** → keep the native-stack push. Implement as a
conditional root: `useBreakpoint()==='expanded' ? <SidebarShell/> : <NativeStackNavigator/>`.
Deep links and back behavior preserved. Delivers the "it's a real Mac app" feel; can land
after per-screen reflow.

---

## 4. macOS Catalyst enablement (Xcode / pbxproj)

1. **iPad family:** `TARGETED_DEVICE_FAMILY = 1,2` on the app target **and** the widget
   extension (currently `1`).
2. **Turn on Catalyst:** `SUPPORTS_MACCATALYST = YES`, derive the Mac bundle id, set a
   default + **minimum window size**, allow resizing + state restoration. Start with
   *"Scale interface to match iPad"* (safest for RN); consider *"Optimize for Mac"* later.
3. **Widget extension on Mac:** add the widget target to the Mac build; under
   `#if targetEnvironment(macCatalyst)` **drop the Lock-Screen accessory families**, keep
   systemSmall/Medium/Large (these map to macOS Notification Center / desktop widgets); the
   App-Group shared container the widget reads already works on Mac.
4. **Feature-gate the un-portables** behind `isMacCatalyst`:
   - **Live Activity** (ActivityKit) — hide (no Dynamic Island/Lock Screen on Mac; a menu-bar
     item is a separate future build).
   - **Qibla compass** — hide (no magnetometer).
   - Re-verify **notifications/exact-alarm**, **audio (react-native-track-player)**, and
     **geolocation** (Core Location on Mac) actually behave under Catalyst.
5. **Native-module audit under Catalyst:** `Compass` (no-op), `PrayerLiveActivity` (no-op),
   `PrayerWidget` (works via App Group), track-player, geolocation, encrypted-storage
   (Keychain OK), svg, blob-util, share, view-shot, iap (Mac App Store IAP differs — gate).
6. **Signing / distribution:** Mac provisioning; ship via the **Mac App Store** (same app
   record, Catalyst binary) and/or a notarized build. F-Droid/Play/iOS pipelines untouched.

---

## 5. Testing & QA

- **Live-resize sweep:** drag the Mac window from ~380pt → full-screen on *every* screen;
  confirm reflow at each breakpoint, no clipping, scroll returns when small.
- **Three-width snapshots** per screen (compact/regular/expanded) as review artifacts.
- **iPad**: Split View + Stage Manager; **Mac**: multiple window sizes.
- **RTL** (Arabic + Urdu) at each breakpoint — every split mirrors.
- Extend Jest where pure (breakpoint math, `useColumns`); Maestro flows on iPad + Mac.

---

## 6. Phased sequence (each phase ships on its own)

- **Phase 0 — Foundations:** extend `breakpoints.ts`; build `CenteredColumn`, `AdaptiveGrid`,
  `ResponsiveModal`, `SplitView`, `useColumns`, `isMacCatalyst`.
- **Phase 1 — Universal centering + grids (biggest cheap win):** wrap every screen in
  `CenteredColumn`; convert QuickActionsGrid, Duas, Journal, downloads to `AdaptiveGrid`;
  all modals → `ResponsiveModal`. Kills the "tiny locked column on a 27-inch display."
- **Phase 2 — Home dashboard:** span-aware card grid + week table replacing the carousel on wide.
- **Phase 3 — Mushaf dual-page spread** (headline).
- **Phase 4 — Master-detail screens:** Settings, Duas, Quran index, Journal; Month → table.
- **Phase 5 — Navigation shell:** persistent sidebar on expanded.
- **Phase 6 — Catalyst target:** iPad family, Catalyst flags, widget port, feature-gating,
  signing/distribution.
- **Phase 7 — QA sweep:** all breakpoints, RTL, iPad + Mac.

**Biggest / riskiest:** Mushaf dual-page (Phase 3) and the navigation shell (Phase 5).
**Cheapest high-impact:** Phase 1. Phases 0–2 already make iPad + "Designed for iPad on Mac"
look right; Phase 6 is what turns it into a true resizable **macOS** window.
