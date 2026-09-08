# The 2026 redesign — plan

Written 2026-09-08 at Hassan's request, from the audit in
`docs/design/modernisation.md` (every screen of v2.18.0 walked on a Pixel 10
Pro). The audit says *what is wrong*. This document says *what the app will
look like when it is right, and how to get there without breaking it.*

Companion documents: `docs/material-direction.md` (why this is not Material,
and the two things borrowed from it), `docs/themes-plan.md` (the scene layer
that lands *after* this), `docs/design/principles.md` (the rules, which this
plan applies rather than changes).

---

## 0. The one-paragraph version

Mihrab's bones are right — one accent, warm paper, tabular numerals, a
countdown hero that most apps would kill for, and a mushaf page that already
looks like 2026. What makes it read as dated is *accretion*: thirty font sizes,
twenty-six corner radii, forty-seven ALL-CAPS labels, cards inside cards inside
cards, prose where a control should be, and a tab bar that lets content crash
into it. The redesign is therefore a **subtraction and a consolidation**, not a
new look. Four releases, each shippable, each visibly better than the last;
no new dependency; nothing platform-specific; the same app on Android, iOS,
iPad and Mac at the end as at the start — just finished.

---

## 1. What "modern" means here, concretely

Not a style. Six properties, each of which the app currently violates
somewhere and each of which is checkable:

| Property | Now | Target | How it is checked |
|---|---|---|---|
| **Hierarchy through size and weight, not boxes** | tiles in cards in cards | one container level per screen | screenshot review; card count per screen (§7) |
| **Space instead of lines** | full-bleed hairlines | inset or none | `chrome.ts` flag + `theme-scenarios.sh` |
| **Sentence case, quiet labels** | 47 uppercase declarations | ≤3 (tables only) | `grep -c "textTransform: 'uppercase'"` |
| **One voice of colour** | green + gold + orange + cyan + red | accent, danger, data ramp | `tokens-audit` hex findings |
| **Controls, not prose** | 8-line setting descriptions | one line + ⓘ | word count per settings row (§7) |
| **Consistency** | 30 sizes, 26 radii | 9 type tokens, 4 radii | `tokens-audit` → 0 findings |

Everything in this plan serves one of those six rows.

---

## 2. The target design system

Most of this already exists in `src/theme/`. The work is to *finish* it and
*enforce* it, and to add the four or five components the screens keep
hand-rolling.

### 2.1 Type

Keep the nine tokens in `typography.ts`. They are a good scale. Two changes:

- **Retire `callout` (15)** — it exists only because 15 was used somewhere;
  it is the size that makes 14/15/16 all appear on one screen. Map its uses
  to `body` or `footnote`.
- **Add `label`**: `{ fontSize: 12, lineHeight: 16, fontWeight: '500' }` —
  the replacement for every uppercase overline. Sentence case, `palette.muted`,
  no tracking.

| Token | Size / leading | Weight | Use |
|---|---|---|---|
| `display` | 56 / 60 | 600, tabular | the countdown, the tasbih count, the qibla bearing |
| `title1` | 28 / 34 | 600 | screen titles on scrollable headers, the month name |
| `title2` | 22 / 28 | 600 | stat numbers, section titles |
| `title3` | 18 / 24 | 600 | card titles, dua titles, prayer names |
| `headline` | 16 / 22 | 600 | row titles, button labels |
| `body` | 16 / 22 | 400 | prose, translations |
| `footnote` | 13 / 18 | 400 | row subtitles, secondary times, credits |
| `caption` | 11 / 14 | 400 | timestamps, legend text |
| `label` *(new)* | 12 / 16 | 500 | section labels, tile labels — replaces caps |

**Arabic** keeps its own scale (`AmiriQuran` / `Amiri`, sizes owned by the
mushaf and dua renderers). Untouched by this plan.

**Enforcement:** every `fontSize:` literal in `src/` goes through
`typeStyle()`. 505 sites today. The `tokens-audit` rule already exists and
already fails; the sweep in §5 Phase 4 makes it pass.

### 2.2 Space

`SPACING` (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64) is right. Enforce it. Add
one convention: **screen gutter = `SPACING.lg` (16)**, **card padding =
`SPACING.lg`**, **row vertical padding = `SPACING.md` (12)**, **between cards =
`SPACING.md`**. Named once in `tokens.ts` as `LAYOUT = { gutter, cardPad,
rowPad, cardGap }` so screens stop choosing.

### 2.3 Shape

`RADIUS` has six steps; the app uses twenty-six literals. Collapse to **four**
with a documented owner for each:

| Token | Value | Owner |
|---|---|---|
| `RADIUS.sm` | 8 | chips, small controls, heatmap cells, inputs |
| `RADIUS.md` | 12 | buttons, stat tiles (where they survive), segmented controls |
| `RADIUS.lg` | 20 | cards, sheets, the tab-bar pill, the hero |
| `RADIUS.full` | 999 | pills, avatars, the count ring |

`xs` (4) and `xl` (20→ becomes `lg`) go. 16 goes — the one value that makes
cards and buttons look almost-but-not-quite the same. Any component that
needs a fifth radius is a design question, not a token request.

### 2.4 Colour

`AppPalette` keeps its shape. Two roles change meaning and two disappear from
the screens:

- `accent` — the one colour that means "interactive" or "current". Green.
- `danger` — one colour, used only for destructive actions and the `Missed`
  state. Red.
- **Gold and orange leave the screens.** The `Sunnah` chips, `7%`, `0 days`,
  the fasted/sunnah heatmap outlines, `Juz ١٥` in the reader, the target-ayah
  highlight — all move to `accent` (at low alpha where a highlight is needed)
  or to `text` / `muted`.
- **The cyan `✓ Today's reading done` button** becomes an `accent` secondary
  button.
- The heatmap keeps its four-step green ramp. That is data, not chrome.

The Material tonal engine (`docs/material-direction.md` §6) is the *next*
step after this, not part of it: first reduce to the roles above, then
generate them. Reducing first means the engine has fewer roles to get right.

### 2.5 Surfaces

The rule is **one level of containment per screen**, and it needs a vocabulary
so it can be applied without arguing every time:

| Surface | What it is | Where |
|---|---|---|
| **Page** | `palette.bg`, the warm paper | everything sits on it |
| **Card** | `palette.card`, `RADIUS.lg`, hairline border, no shadow in dark | one thing that stands alone: the hero, a khatmah strip, a settings group |
| **Group** *(new)* | a card that contains **rows** and nothing else | settings pages, the dua index, the fasting sunnahs, the surah list on iPad |
| **Row** | title / subtitle / trailing, `rowPad`, inset divider or none | inside a Group, or bare on the Page (the surah list on phones) |
| **Tile** | number + label, no background | stats — they sit on the Page, never in a Card |

Two things are explicitly *not* surfaces: a Card inside a Card, and a Tile
with a background. `Card` in `components/ui` gets a dev-only warning if it
finds itself inside another `Card`.

### 2.6 Chrome

- **Header.** Title centred at `title2`; at most **one** trailing icon and
  one leading control. The tab back arrow (§6, decision D1) is the leading
  control on non-Today tabs if it stays. No text buttons in headers — `Audio`,
  `Translation`, `Tilawah` become icons.
- **Tab bar.** The floating pill stays (it is good, and the iPad/Mac
  full-width variant is already handled). Behind it, always, a **fade scrim**
  from transparent to `palette.bg`, bar height + 24 dp. Every scroll view's
  bottom inset comes from `tabBarInset.ts`, no exceptions, with a test that
  greps for `ScrollView`/`FlatList` in tab screens and asserts the hook.
- **Section label.** `label` token, sentence case, `muted`, `SPACING.sm`
  above the group it names. Never uppercase. Never needed when the group's
  content is self-evident.
- **Info affordance** *(new)*. A small `ⓘ` at the trailing edge of a row or
  a "Learn more" text link that opens the existing prose in a bottom sheet.
  This is how every eight-line setting description survives without being
  on the page.
- **Stepper** *(new)*. `‹  Title  ›` with a subtitle line, used identically
  by Month and the Log's day view.

### 2.7 Controls

| Control | Spec |
|---|---|
| **Button, primary** | `accent` fill, `onAccent` label, `headline`, `RADIUS.md`, 48 dp min height. **One per screen.** |
| **Button, secondary** | `accentBg` fill, `accent` label. |
| **Button, tertiary** | text only, `accent`. For `Reset`, `Previous day`, `Skip`. |
| **Chip, selectable** | unselected: text only in `muted`, no fill, no border. Selected: `accent` fill, `onAccent` text, `RADIUS.full`. This is the day strip, the dua categories, the status pills. |
| **Segmented control** *(new)* | one rounded container, selected segment filled `accentBg`, others plain. Replaces the three-outlined-buttons pattern in Appearance and the `Surah / Juz / Bookmarks` row. |
| **Toggle** | platform switch, as now. |
| **Disclosure** | `›` chevron in `muted`, trailing. Never `▸`, never `⌄` floating at the far right. |
| **Status pill row** (Log) | four chips per the Chip spec; `On time` is selected-style when chosen and *secondary-style when it is the suggested default*; the other three are text until chosen. |

### 2.8 Motion

Free, from `docs/material-direction.md` §9.1: two spring tracks in
`motion.ts` — `spatial` (stiffness 380, damping 31.2) for things that move,
`effects` (1600, 80) for colour and opacity — via `Animated.spring`, which RN
0.83 supports natively. Used for: sheet presentation, chip selection, the
tab-bar hide/show (currently a 180 ms timing), the count ring. Reduce Motion
path already exists and stays mandatory.

### 2.9 Icons

The 14 hand-drawn SVGs in `icons.tsx` are consistent with each other and stay.
Two additions: an `info` glyph for §2.6, a `kaaba` glyph for the Qibla needle.
Stroke 2 pt like the rest.

---

## 3. The target screens

Wireframes for the two screens that change most. Everything else follows
from the system in §2 and the per-screen list in `modernisation.md` §B.

### 3.1 Today

```
┌──────────────────────────────────────────┐
│ ⌂ Mihrab                  ◎ Stockholm Auto│   header, unchanged
├──────────────────────────────────────────┤
│                                           │
│  ┌ hero card ──────────────────────────┐  │   RADIUS.lg, accentBg tint
│  │                        ◎ Qibla 148° │  │
│  │  1h 27m 24s  19:39                  │  │   display; no "MAGHRIB IN"
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │  │
│  │  Asr                        Maghrib │  │   footnote
│  │  Sep 8 · 26 Rabi I 1448             │  │   footnote, muted
│  └─────────────────────────────────────┘  │   ← "Updated · stored" gone
│                                           │
│   Tue  Wed  Thu  Fri  Sat  Sun  Mon       │   plain text, muted
│   (8)   9   10   11   12   13   14        │   only today is a filled chip
│                                           │
│  Fajr                          ⌂  03:37   │   rows ON THE PAGE, no card
│  until ~05:18                             │   footnote; icon-only alert mode
│  Sunrise                       ⌂  05:53   │   inset dividers or none
│  Dhuhr                         ♪  12:51   │
│  Asr                           ♪  16:22   │
│ ▌Maghrib                       ♪  19:39   │   accentBg row, left rule, as now
│  Isha                          ♪  21:48   │
│                                           │
│  Whole month                          →   │   tertiary link row
│                                           │
│  ┌ card ───────────────────────────────┐  │
│  │ ▤ Continue · Al-Kahf 18:46          │  │
│  │   Day 4 of 30 · 19 pages left today │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  Today            ◔ 3 of 5 logged     →   │   ring, not ✕; plain row
│  Times            Sweden · Stockholm  ›   │   plain row; label token
│  Data             ● OK                ⌄   │   plain row, chevron trailing
│                                           │
│░░░░░░░░░░░░░░░ fade scrim ░░░░░░░░░░░░░░░░│
│  ⌂ Today  ▤ Quran  ∘ Tasbih  ☝ Duas  …    │   pill, unchanged
└──────────────────────────────────────────┘
```

The hero is the only card above the fold. The prayer list sits on the page.
The three utility rows at the bottom are rows, not three cards.

The alert-mode control stays on the row — `AlertModeButton.tsx` argues
correctly that it is a per-prayer decision — but its label drops to `caption`
in `muted`, and the icon takes `accent` **only when the mode differs from the
app default**. A list where every prayer is on the default reads quiet; the
one Fajr set differently stands out, which is the information that matters.

### 3.2 Log

```
┌──────────────────────────────────────────┐
│ ‹ Log                                     │   one leading control, no refresh
├──────────────────────────────────────────┤
│                                           │
│   0          7%         0          0      │   tiles ON THE PAGE, title2
│   day streak sunnah     fasted     owed   │   label token, sentence case
│   best 81    this month this month        │   caption, muted
│                                           │
│   Jun          Jul          Aug     Sep   │
│ M ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■▫   │   heatmap ON THE PAGE
│   ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■□   │
│ W ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■    │
│   …                                       │
│   0 → 5  ▫▪■■   ▫ missed  ▫ fasted  ▫ sunnah│   one legend line, accent ramp only
│                                           │
│   Fill in earlier days                →   │   tertiary rows, no card
│   Fill the past three months          →   │
│   Reset the prayer log                →   │   danger text, same weight
│                                           │
│   ‹        Today                      ›   │   Stepper, same as Month
│            Tue Sep 8 · 26 Rabi I 1448     │
│                                           │
│  ┌ day card ───────────────────────────┐  │   the ONE card on the screen
│  │ Fajr 03:37              Mark all ✓  │  │   primary action aligned to title
│  │ (On time)  Late  Missed  Make-up  ✎ │  │   one filled chip, three text
│  │ Dhuhr 12:51                       ✎ │  │
│  │ (On time)  Late  Missed  Make-up    │  │
│  │ Asr 16:22                         ✎ │  │
│  │ (On time)  Late  Missed  Make-up    │  │
│  │ Maghrib 19:39      not yet          │  │   future: one quiet line
│  │ Isha 21:48         not yet          │  │
│  │ After Isha    Witr ·  Qiyam 0 +     │  │   one row, label token
│  │ Fasting       not recorded  Mark ✓  │  │   secondary button
│  └─────────────────────────────────────┘  │
│                                           │
│░░░░░░░░░░░░░░░ fade scrim ░░░░░░░░░░░░░░░░│
└──────────────────────────────────────────┘
```

Twenty pills become three filled and nine text. The `Sunnah`/`0/2` outline
chips fold into the pencil's sheet. Gold and orange are gone.

### 3.3 The other screens, in one line each

- **Quran tab:** the list first; one compact khatmah strip with a primary
  `Continue` and a secondary `Done for today`; the two "Continue"s merged and
  labelled; surahs as rows; header = `‹ Quran  ♫`.
- **Reader:** header takes the page tone (dark on dark); `Audio` /
  `Translation` as icons; `Juz` and `Light` into the bottom bar; accent-alpha
  highlight.
- **Tasbih:** count centred; the ring shows progress; `Previous` / `Reset` /
  `Skip` all tertiary; the "next" preview as a footnote line, not a card.
- **Duas:** category page loses `‹ All duas`; dua titles at `title3`;
  `Pronunciation` / `Translation` as tertiary links; sections with `label`.
- **Month:** `Shareable` → header share icon; `Refresh stored data` → Data
  statistics; footer line for provenance.
- **Qibla:** `148°` at `display`; a real dial (§4); one line of guidance;
  the rest behind ⓘ.
- **Fasting:** tiles on the page; sunnahs as rows in one group; the loose
  sentence becomes the hero's subtitle.
- **Settings sub-pages:** one line per row + ⓘ; segmented controls;
  paragraphs between cards removed.
- **Sync:** one sentence up top; second paragraph deleted.

---

## 4. The two pieces of actual design work

Everything else in this plan is cleanup. These two need a designer's hour
each before an engineer's day.

**The Qibla dial.** A degree ring with ticks every 10° and numerals every 30°;
a thin needle (2 pt) from centre to ring with the `kaaba` glyph at its tip; a
small centre dot; `N` marked, the other cardinals lighter; the phone-front
marker as a small filled triangle on the ring. Compass signal as a short arc
on the ring's outside rather than a full-width bar. Monochrome plus `accent`.
One SVG, ~150 lines. It is the most visually iconic object in a prayer app
and the biggest before/after in the whole plan.

**The immersive reader.** The header and status bar take the page tone when
the page is dark, via `systemBarSurface.ts` and `mushafTone.ts`, which already
exist for this. The bottom bar becomes one row: `#` · scrubber · `2 / 604` ·
`Juz` · `☀`. Nothing floats over the page.

---

## 5. Phases

Each phase is a release. Each is shippable on its own and visibly better than
the one before. Nothing waits on a big-bang.

### Phase 0 — Guardrails *(2 days, ships with Phase 1)*

Before changing pixels, make it possible to see what changed.

- **Baseline screenshots.** Run `scripts/theme-scenarios.sh` and an adb
  sweep of every screen (the walk from 2026-09-08, scripted) in light, dark
  and **Arabic RTL** — the audit did not capture RTL, and P2/P3 touch
  `paddingStart/End` everywhere. Commit the script as
  `scripts/design/screen-sweep.sh`; keep the images out of git.
- **Burn-down numbers** in `scripts/tokens-audit.js` output: findings by
  rule, and the four counts from §7 printed at the end. The CI job stays
  advisory until Phase 4; it stops being advisory then.
- **`Card`-in-`Card` dev warning** (§2.5).
- **`tabBarInset` test**: every screen registered as a tab must call the
  hook.

### Phase 1 — The bug and the plainly wrong *(1 week → v2.19)*

- **P0.** The fade scrim in `MainTabs`; bottom insets on Today, Quran, Duas,
  Log, dua category. Verified by the sweep: no text under the bar on any
  capture.
- **Today:** `Updated · stored` out of the hero and into Data statistics;
  `MAGHRIB IN` deleted; the `✕` box → a ring.
- **Quran:** the two "Continue"s merged; the khatmah card down to one primary
  + one secondary + overflow; the cyan button → accent secondary.
- **Duas:** `‹ All duas` removed.
- **Reader:** gold highlight → accent alpha.
- **Motion tokens** added to `motion.ts` and used by the tab-bar hide/show.
  Free, and it is the first thing a user *feels*.

Strings: deletions only (`MAGHRIB IN`-style labels). 13 locales lose keys;
none gain any.

### Phase 2 — Type and labels *(1 week → v2.20)*

- `label` token added; `callout` retired.
- All 47 `textTransform: 'uppercase'` → `label` in sentence case, except the
  month table's column heads. Dua titles → `title3`.
- Every section label reviewed: **delete** where the group is self-evident
  (`PRACTICE`, `TODAY`), keep as `label` otherwise.
- Stat tiles: number at `title2`, label at `label`, qualifier at `caption`.

Strings: casing is `textTransform`, not translation — **no locale work**. A
locale that stores a label in caps is a bug to fix in that locale.

### Phase 3 — Surfaces and controls *(2 weeks → v2.21)*

- **P2**: `rowDividerStyle` → inset (behind a flag for one release, then
  default). Sweep before/after.
- **P3**, in order: Log (tiles out, heatmap out, action rows out), Quran
  (cards → rows, six cards → list + strip), Fasting (tiles out, sunnahs →
  group). `Group` and `Tile` components added to `components/ui`; `Card`
  warns when nested.
- **P4**: `Chip` and `SegmentedControl` in `components/ui`; day strip, dua
  categories, Log status pills, `Surah / Juz / Bookmarks`, Appearance's
  `Theme` / `Time format` all adopt them. Future prayers on Log → one line.
- **Stepper** component; Month and Log share it.
- Alert-mode control: label → `caption` muted; accent only on non-default.

### Phase 4 — Prose, colour, and the sweep *(2 weeks → v2.22)*

- **P7**: `InfoSheet` component; Settings → Prayer times, Appearance, Sync,
  Qibla, Notifications' banner. Rule: one line per row; word count enforced
  by a test over the settings screens' subtitle strings (≤ 90 characters).
- **P6**: gold, orange and cyan removed from every screen; `tokens-audit`'s
  hex rule goes from advisory to blocking.
- **P5**: the token sweep. 505 `fontSize` literals → `typeStyle()`; 244
  `borderRadius` literals → `RADIUS`; spacing literals → `SPACING`.
  Mechanical, boring, one screen per commit, `theme-scenarios.sh` after each.
  **`design-qa.js` passes at the end of this phase and CI blocks on it from
  then on.**

### Phase 5 — The two design pieces *(1 week → v2.23)*

- The Qibla dial (§4).
- The immersive reader (§4).

### After this plan

- `docs/material-direction.md` option C — the tonal engine — now has 6
  colour roles to generate instead of 17 semantic fields plus gold and orange.
- `docs/themes-plan.md` Phase 1 — the scene layer — now has one container
  level to sit behind instead of three.

Both get easier because this plan ran first. Neither is part of it.

---

## 6. Decisions needed from Hassan

- **D1 — the back arrow on tabs.** `TabBackButton.tsx` argues for it (Today
  is home; hardware back always went there; the arrow says so). The cost is
  the leading header slot on five of six tabs. *Recommendation:* keep the
  model, express it as a `‹` chevron at `muted` weight rather than a full
  arrow, so it reads as "up to Today" rather than "pop". Decided in Phase 2.
- **D2 — the alert-mode labels.** Keep (as proposed: muted, accent only when
  non-default) or go icon-only. *Recommendation:* keep; the file's reasoning
  is right.
- **D3 — which "Continue" wins on the Quran tab.** Last-read position or
  today's khatmah target as the primary. *Recommendation:* the khatmah target,
  because Today already surfaces last-read.
- **D4 — future prayers on the Log day view.** Show `not yet` or hide the
  row. *Recommendation:* show, one line, so the day reads complete.
- **D5 — the release cadence.** Four releases as above, or fold Phases 1–2
  into one. *Recommendation:* four; each is a visible step and a rollback
  point.

---

## 7. Definition of done

| Measure | 2.18.0 | Target |
|---|---|---|
| `tokens-audit` findings | 1,483 | **0**, blocking in CI |
| `textTransform: 'uppercase'` | 47 | ≤ 3 (month table) |
| raw `fontSize:` literals | 505 | 0 |
| raw `borderRadius:` literals | 244 | 0 |
| distinct radii in use | 26 | 4 |
| type tokens in use | 9 (+30 literals) | 9 |
| accent hues on screen | 5 | 2 (accent, danger) + data ramp |
| cards above the fold, Today | 1 (containing 4 things) | 1 (containing 1) |
| cards on Log | 3 nested | 1 |
| cards before the surah list | 6 | 1 strip |
| pill buttons on Log day view | 20 + 5 chips | 3 filled + 9 text |
| settings rows over 90 characters | ~12 | 0 |
| screens where content passes under the tab bar | 5 | 0 |
| `design-qa.js` | FAIL | PASS |

Plus the qualitative gate the repo already uses: every phase's screenshots
reviewed side-by-side with the baseline in light, dark and RTL, on a phone,
an iPad and a Mac window, before the release is cut.

---

## 8. Risks

- **`chrome.ts` is 151 call sites.** P2 is one line to change and one line
  to get wrong everywhere. Flag first, sweep, then default.
- **`ShareMonthScreen` and `ShareAyahModal` capture views.** Any surface
  change under them must be checked in the exported image, not just on screen.
- **The tab bar's hide-on-scroll** and the new scrim must animate together
  or the scrim will sit there after the bar has gone. Same `Animated` value.
- **Catalyst.** The full-width tab-bar variant and the `macHeaderRow` in
  `HomeScreen` have their own layout; every phase's sweep includes a Mac
  window.
- **RTL.** Inset dividers, chevrons, steppers and the alert column are all
  directional. `paddingStart/End` only, per CLAUDE.md, and the Arabic sweep
  every phase.
- **The reader.** `mushafReaderCore` and `MushafUnicodePage` are the two most
  complex files in the app and Phase 5 touches their chrome. Chrome only;
  the page renderer is not opened.
- **Scope creep toward a redesign.** The temptation once the surfaces are
  clean will be to "also" change the icons, the header, the green. The plan
  says what stays (`modernisation.md` first section) so that the answer is
  already written down.

---

## Related

- `docs/design/modernisation.md` — the audit this plan executes.
- `docs/design/principles.md` — unchanged by this plan; enforced by it.
- `docs/material-direction.md` §6, §9.1 — the tonal engine (after) and the
  motion springs (Phase 1).
- `docs/themes-plan.md` — the scene layer (after).
- `scripts/tokens-audit.js`, `scripts/design-qa.js`,
  `scripts/theme-scenarios.sh` — the gates.
