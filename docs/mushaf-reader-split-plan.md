# Splitting the mushaf reader: one mechanism per device class

> **Status (2026-09-02): complete.** Steps 1–3 shipped on 2026-07-30. Step 4
> slipped for fifteen releases — the image reader stayed mounted underneath
> both text readers, forty-odd hooks that rendered nothing, and nothing in
> Settings could have selected it since the day text mode shipped. It is
> gone now: `MushafReader.tsx` is the download gate and the device-class
> route (~300 lines, from 1,522), and with it went `MushafPhoneLandscape`,
> the image geometry table (2.6 MB of JSON in the bundle), the render cache
> and its native scaler on both platforms, the crop and windowed-strip math,
> the colour-matrix dependency, and the tests that pinned all of it.

Decision context (2026-07-30, Hassan): phone landscape now has its own view
(`MushafPhoneLandscape`, shipped after the page-skip fix) — but it is bolted
onto a 1,323-line `MushafReader` that still computes every layout mode on
every render. This plan finishes the thought: **two small readers, one shared
core, and the device question answered exactly once.**

## What the current code costs

Measured on the current `main`:

- `MushafReader.tsx` is 1,323 lines and carries **28** `phoneLandscape`/
  `dualPage` branch points and **12** window-dimension reads. Every state
  change re-evaluates spread pairing, zoom clamps, windowed-strip anchors and
  image-cache math — even on a phone in portrait, even in text mode, where
  most of it is dead.
- The image-era machinery (`landscapePageWidthDp`, the windowed strip, the
  render-cache clamp, crop/stretch geometry) exists solely because bitmaps
  have a resolution ceiling. Text pages don't, but the code still runs.
- Rotation on a phone currently *remounts between two different component
  trees* (portrait ScrollView pager ↔ landscape FlatList). The handoff works
  but each side re-derives state the other already had (current page, font
  slots stay warm only by luck of the pool size).

## Target architecture

```
MushafScreen (route entry)
│  reads deviceClass() ONCE — module-level constant, not per render
│
├── phone  → MushafPhoneReader        (portrait + landscape, one component)
└── large  → MushafSpreadReader       (iPad, Mac Catalyst, large foldables)

shared core (no layout opinions):
  MushafTextPageSurface   page = font + text run (already exists)
  useMushafPageFont       font slots + prefetch   (already exists)
  usePageState            currentPage, lastRead, khatmah, jump, fullscreen
  useAyahSelection        selection + action sheet + playback follow
  MushafChrome            header row, night pill, page number, jump modal
```

### The device question is answered once, at module scope

```ts
// deviceClass.ts — evaluated once at import, never per render.
// A phone cannot become an iPad mid-session; only WINDOW SIZE changes.
export const DEVICE_CLASS: 'phone' | 'large' =
  Math.min(screen.width, screen.height) < 600 ? 'phone' : 'large';
```

Everything downstream branches on props it is given, never on the window.
`mushafLayoutMode()` and its tests are retired with the image reader.

### MushafPhoneReader — one component, both orientations

The key optimisation: **portrait and landscape are the same FlatList**, not
two trees. Rotation changes three numbers, no remount:

- `pageWidth` = window width (both orientations)
- `textWidth` = portrait: width − padding · landscape: `height × 1.6`
- the page column scrolls vertically only when `pageHeight > window.height`
  (portrait: never; landscape: always) — same ScrollView, it just has
  nothing to scroll in portrait.

What this removes outright, per rotation: component-tree teardown/mount,
font re-pin churn, scroll-position reconstruction, and the last remnant of
the windowed-strip model. The FlatList keeps its index; `getItemLayout`
recomputes from the new width; done. Rotation cost becomes one re-render of
≤3 mounted pages — pure text re-layout.

Perf specifics:

- `windowSize={3}`, `initialNumToRender={1}`, `removeClippedSubviews` — a
  page is a typeface + ~150 text nodes, so this window is generous.
- `renderItem` depends only on `(page, width, height, nightMode)`; selection
  and playback highlighting flow through a context read INSIDE the page so a
  selection change re-renders one page, not the list.
- Fullscreen toggles chrome opacity, not list layout — no re-measure.
- No `pageDims`, no crops, no `PixelRatio`, no cache-width math anywhere in
  the phone path.

### MushafSpreadReader — large screens only

- Spread pager: each item is a **pair** (RTL: odd page right, even left),
  step = one spread. The pair is the item, so "skips a page" cannot be
  expressed — the FlatList index IS the spread index.
- No zoom concept: a spread is width-fit, height-capped, centred. iPad
  portrait shows a single centred page (the one non-trivial branch this
  component keeps, and it is internal to it).
- Same shared core underneath; the only new code is the pairing.

### What gets deleted (after image mode retires, one release later)

- The windowed strip + moving-anchor scroll math in `MushafReader`
- `landscapePageWidthDp`, `renderRequestPx`, `RENDER_CACHE_SKIP_PX`
- Crop/stretch geometry (`pageDims`, `MAX_VERTICAL_STRETCH`, offsets)
- `mushafLayoutMode()` and both its test files
- Ultimately `MushafReader.tsx` itself — replaced by two ~300-line readers

Net: ~1,700 lines of layout machinery becomes ~700 with zero cross-class
branching, and the phone path touches nothing that exists for tablets.

## Migration order (each step shippable)

1. **Extract the shared core** out of `MushafReader`: `usePageState`,
   `useAyahSelection`, `MushafChrome`. Pure refactor, no behaviour change;
   the existing reader consumes them. Tests stay green.
2. **Build `MushafPhoneReader`** on the core (the existing
   `MushafPhoneLandscape` FlatList grows portrait support — it is already
   90% of this component). Route phones to it in text mode. Image mode and
   large screens still use the old reader.
3. **Build `MushafSpreadReader`** (spread-as-item pager). Route large
   screens to it in text mode.
4. **Retire**: when image mode is dropped (planned one release after text
   mode ships), delete `MushafReader` and the listed machinery. This is the
   step where the line count actually falls — do not let the old reader
   linger past it.

## Verification bar per step

- Page turns: 1→2→3 and back, fast flicks, both orientations, both classes.
- Rotation: phone portrait↔landscape keeps page + selection + playing ayah,
  paints in <300 ms, no font re-registration (slot debug stays stable).
- iPad: spread pairing correct at both orientations; Catalyst window resize
  re-pairs without losing the page.
- Long-press → correct ayah on every class (arithmetic hit-testing).
- `dumpsys meminfo` flat across 10 rotations on the Pixel-class emulator.
```

The plan deliberately does NOT start with deleting the old reader — image
mode still needs it, and the safest path is to grow the new readers beside
it, switch routing, and delete once nothing routes there.
