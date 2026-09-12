# The sky palette — plan

Written 2026-09-12 at Hassan's request: *"how about making the entire app
UI follow the color scheme of the day drawn in the hero… I am thinking of
having it in the menues not in the reader, in the dua and quran translate
view we can make the card with the text shift the color to make it more
readable, there is also a need to make the text throughout the UI adapt
to the light and dark colors of the UI as the day changes."*

Companion reading: `docs/design/principles.md` (principle 5 is literally
"time-of-day awareness — felt, not announced"), `docs/design/redesign-plan.md`
(the pass that took colour *out*, which this has to answer for).

---

## 0. The one-paragraph version

The hero already draws the day — five prayer-bounded passages, a real
gradient, and text that takes its ink from the sky rather than the theme.
Everything else in the app is painted from a palette that is a pure
function of four settings and the OS colour scheme, with no notion of
time in it at all. This plan gives the palette a fifth input — where the
sun is — as an **opt-in fourth appearance**, built so that it is not a
third theme engine but a modulation of the two that exist: the sky picks
light or dark, and washes that base with its own hue at low saturation.
Every contrast guarantee already in the app survives, because the base
underneath is unchanged. Long-form reading gets a surface that takes the
base but never the wash, so a dua and an ayah translation stay as legible
at dusk as at noon. The muṣḥaf is untouched. And the app's text flips ink
at most twice a day, at dawn and at dusk, where a change is expected and
means something — not continuously, which is the version of this idea
that fails.

---

## 1. The leverage, and the reason this is smaller than it looks

Two facts from reading the source decide most of the design.

**The palette has exactly one entry point, and nobody caches it.**
`resolveAppPalette()` in `src/theme/appPalette.ts` is the only place an
`AppPalette` is built. 107 files call `useAppPalette()` across 133 call
sites, and between them they read `palette.<token>` **1,471 times** — and
not once through an alias. Zero files do `const { bg, card } = palette`
or `const p = palette`. Every read is a live member access on the object
the hook returned.

That means changing what the hook returns changes all 1,471 sites for
free. The work of this plan is not "repaint the app"; it is "give one
function a new input, and be honest about the consequences".

**And there is already a precedent for time-driven colour — deliberately
kept out of the palette.** `src/screens/home/skyModel.ts` carries a
`// tokens-ok` marker and a header that states the rule it lives by: *the
sky is true to the hour, not to the theme.* It exports everything this
plan needs — `SkyPassage`, `skyMoment`, `skyFrame`, `skyColorAt(frame, y)`,
`luminance(hex)`, `mixHex(a, b, t)` and `INK_SWITCH_LUMINANCE = 0.18`,
whose comment already did the contrast arithmetic: at that luminance pure
white reads 4.56:1 and pure black 4.6:1, so **both** clear WCAG AA.

So the two halves exist and have never been introduced. This is the
introduction.

### 1.1 What the palette actually is today

`AppPalette` has seventeen fields, not the thirteen a casual reading
suggests — `controlBg`, `onAccent`, `textSolid` and `isDark` are easy to
miss and all four matter here. Usage, counted across `src/`:

| token | reads | token | reads |
|---|---:|---|---:|
| `muted` | 391 | `danger` | 40 |
| `text` | 247 | `controlBg` | 36 |
| `accentSolid` | 184 | `overlay` | 24 |
| `accent` | 115 | `flatChrome` | 18 |
| `border` | 110 | `onAccent` | 15 |
| `bg` | 103 | `isDark` | 7 |
| `card` | 98 | `mutedSolid` | 7 |
| `accentBg` | 71 | `textSolid` | 4 |
| | | `glass` | 1 |

`muted` and `text` together are 638 of the 1,471 — **43% of every colour
read in the app is ink**. That is the number that makes §5 the load-
bearing section of this document rather than a detail at the end.

### 1.2 There are already two ink-decision systems, with different rules

Worth naming before a third is added by accident:

| helper | where | threshold | returns |
|---|---|---|---|
| `skyInkAt(frame, y)` | `skyModel.ts:390` | luminance < **0.18** | pure `#FFFFFF` / `#000000`, plus muted/track/fill |
| `readableOn(hex)` | `appPalette.ts:219` | luminance < **0.45** | `#FFFFFF` / `#1A1814` |

They disagree because they answer different questions. `skyInkAt` is
ink over a *drawn gradient* at a given height, where pure black and pure
white are correct and anything softer muddies. `readableOn` picks a
label colour to sit *on the accent*, whose lightness is unknown under
Material You, and its comment explains the 0.45: white on a mid-tone
reads better than the arithmetic midpoint suggests at small weights.

**This plan adds no third threshold.** The sky palette's light/dark
decision reuses `INK_SWITCH_LUMINANCE`, the hero's own constant, so the
app and the hero agree about when the day has turned dark.

---

## 2. The rule

The redesign this app just finished explicitly removed colour: *"reduced
to one accent: the cyan, the gold and the second greens that had
accumulated… are gone."* A plan that puts colour back has to answer for
that, and "it looks nice" is not an answer.

> **Colour may move where it carries information, and must not move
> where it does not.**

The app's entire subject is where the sun is. A ground derived from the
sun's actual position is data, not decoration — which is also what tells
us where to stop. Three consequences, and they are the whole scope:

1. **Chrome and navigation may move.** Backgrounds, cards, borders, the
   tab bar, the settings list. These are the surfaces whose job is to be
   the room, and a room may have a time of day.
2. **Long-form reading may not.** A dua, an ayah translation, a tafsir
   passage, the muṣḥaf. Somebody reads these for minutes at a stretch and
   the ground shifting under them is hostile, however slowly it shifts.
3. **Data may not.** A time, a countdown, a graph, a status. If a number
   changes colour, the colour must mean something about the number.

### 2.1 What the accent does — nothing

The sky drives the **ground**. `appAccentId` stays exactly as the user
set it, and so does the brand green for everyone who never touched it.

Two reasons, one of them structural. The soft one: people picked from six
swatches deliberately and taking that away to replace it with a colour
that changes hourly is not personalisation, it is confiscation. The hard
one: accent-on-ground contrast is a product of two values, and if both
move it is a product of two moving values — which is how a plan like this
ends up with an unreadable button for forty minutes a day, twice a year,
in a way nobody can reproduce. One moves; one holds.

---

## 3. The architecture: a base, and a wash

Sky is **not a third palette engine** sitting beside `buildAppPalette` and
`buildDynamicSystemPalette`. Three engines is one more than anybody can
keep in step, and the existing two already diverge enough that
`appAccentId` is silently ignored down the dynamic path.

Instead, Sky is a **modulation of the existing light and dark bases**:

```
skyMoment(timings, now)         → passage + t
  → passage decides  isDark     (§5, and it is NOT continuous)
  → buildAppPalette(isDark, …)  ← unchanged, every guarantee intact
  → washPalette(base, skyHue, strength)
      ground tokens only: bg, card, controlBg, border, accentBg
      ink tokens untouched: text, muted, textSolid, mutedSolid, onAccent
      accent untouched
```

`resolveAppPalette` gains one optional input and one branch:

```ts
export function resolveAppPalette(input: {
  appearance: AppearancePreference;      // now includes 'sky'
  useSystemDynamicTheme: boolean;
  systemScheme: ColorSchemeName | null | undefined;
  pureBlackDark: boolean;
  appAccentId: AppAccentId;
  appAccentCustomHex: string;
  /** Absent when there is no location yet, or the user is not on Sky. */
  sky?: SkyPaletteInput;
}): AppPalette
```

`SkyPaletteInput` is deliberately tiny — `{ passage: SkyPassage; tint: string }`
— because the palette must not import the drawing model. The hero owns
the gradient; the palette owns a hue and a name for the time of day. The
adapter that turns a `SkyFrame` into that pair lives beside the sky, not
beside the palette.

### 3.1 What the wash is

A mix toward the sky's colour, at a strength that stops well short of
carrying the ground across the ink threshold:

```ts
const WASH = { bg: 0.10, card: 0.07, controlBg: 0.07, border: 0.14, accentBg: 0.05 };
```

`mixHex` already exists in `skyModel.ts` and already does exactly this.
The numbers are a starting point to be tuned against the five passages on
a real device, not a result.

Three rules the wash obeys, each of which is a bug if broken:

- **It never touches ink.** `text`, `muted`, `textSolid`, `mutedSolid`
  and `onAccent` come through the base untouched. Ink is decided by the
  base flip (§5) and by nothing else.
- **It never touches the accent.** §2.1.
- **It is skipped entirely when the base cannot take it** — under
  `pureBlackDark` (somebody asked for black; a tinted black is not black)
  and under the dynamic-system palettes, which are `PlatformColor` objects
  and cannot be mixed at all. Which brings us to:

### 3.2 Sky and dynamic colours are mutually exclusive, for free

`shouldUseDynamicSystemColors()` already requires `appearance === 'system'`.
Because Sky is a distinct value of the same field, choosing it turns
Material You and Liquid Glass off without a line of new logic — the same
way choosing Light or Dark already does. The Appearance card's existing
rule ("only answerable while the theme follows the system") extends to
cover it unchanged.

This also sidesteps the one genuinely unsolvable case: under Liquid Glass
`border` is literally `'transparent'` and `bg` is a `DynamicColorIOS`
object. There is nothing to wash.

---

## 4. What the passages look like when you walk a whole day

Worth stating plainly, because it is the strongest argument for the idea
and it also caps the risk.

| passage | bounds | ground | base |
|---|---|---|---|
| night | ʿIshāʾ → Fajr | deep indigo | **dark** |
| dawn | Fajr → sunrise | indigo → rose → pale gold | dark → **light** |
| day | sunrise → ʿAṣr | near-white, faint blue | **light** |
| sunset | ʿAṣr → Maghrib | gold → amber → red | **light** |
| dusk | Maghrib → ʿIshāʾ | red → violet → indigo | light → **dark** |

For most of the daylight hours the ground is a barely-tinted white —
which is light mode. For most of the night it is a deep indigo — which is
dark mode. The genuinely *coloured* passages are dawn and dusk, and they
are roughly forty minutes each.

So the app is calm nearly all the time and briefly beautiful, and those
two windows sit exactly on Fajr/sunrise and Maghrib/ʿIshāʾ — which is
when somebody opens a prayer app. **The colour peaks when the app matters
most, and is nearly absent the rest of the time.** Nobody is being asked
to read a settings list on saturated amber for eight hours; they are
being asked to for about forty minutes, twice.

---

## 5. The ink — the load-bearing decision

43% of the app's colour reads are `text` or `muted`. Get this wrong and
nothing else matters.

### 5.1 The flip is bound to the passage, not to the luminance

The obvious design is to track the sky's luminance continuously and flip
ink at `INK_SWITCH_LUMINANCE`. **Do not do that.** Two failures:

- **It flips mid-glance.** The luminance crosses 0.18 at one particular
  minute of dusk; a user reading a settings row at that minute watches
  every word on screen invert. A change that carries no information and
  cannot be predicted is the definition of a distracting animation.
- **It can flip twice.** The sunset passage is not monotonic in every
  season and latitude — a sky that dips, recovers and dips again crosses
  the threshold three times, and the app strobes.

So: **the base is a property of the passage.** `night` and the second
half of `dusk` are dark; `day`, `dawn` after first light and `sunset` are
light. The two flips happen at a defined point inside `dawn` and `dusk`
respectively — the point where the passage's own gradient crosses
`INK_SWITCH_LUMINANCE`, computed once per passage rather than sampled
continuously, and then held.

At most two flips a day. Both inside a passage that is already visibly
changing. Both adjacent to a prayer time.

### 5.2 The flip cross-fades, and it is the only animation this adds

240ms cross-fade of the whole window — the same duration the onboarding
progress rule uses, for the same reason. Under Reduce Motion it is a
straight swap.

Nothing else in this plan animates. The wash drifts between quantised
steps (§6) and those steps are close enough together to be invisible;
the flip is the one moment that is meant to be noticed, because it is the
one moment that means something.

### 5.3 The ink is never washed, ever

Stated again because it is the rule most likely to be "improved" later: a
tinted ink on a tinted ground is two variables solving for one contrast
ratio, and the app already has a place where that is done properly — the
hero, over a drawn gradient, with `skyInkAt`. In the palette, ink comes
from the base and the base alone.

---

## 6. The tick, and the cost of it

`useAppPalette()` today memoises on
`[appearance, useSystemDynamicTheme, pureBlackDark, appAccentId, appAccentCustomHex, systemScheme, bump]`.
There is no clock anywhere in `src/theme/` or in the settings context —
verified, that grep is empty. Adding time is the one genuinely invasive
part of this plan, because a new palette object identity re-renders every
one of those 107 files.

### 6.1 Quantise the key, not the clock

The fix is to memoise on a **quantised sky key** rather than on `now`:

```ts
const skyKey = `${passage}:${Math.floor(minutesIntoPassage / QUANTUM)}`;
```

with `QUANTUM = 5` minutes. The hook may be *called* as often as React
likes; the palette object only changes identity when the key does — at
most twelve times an hour, and in practice far less, since a five-minute
step of a forty-minute gradient is a colour difference of a percent or
two.

The tick itself is a single interval owned by one provider, running
**only when `appearance === 'sky'`**, and stopped when the app is
backgrounded — the same discipline `docs/design/background-power.md`
already imposes on the home watchdog, and for the same reason: a timer
that runs in the background to change a colour nobody is looking at is
work nobody asked for.

### 6.2 Where the tick lives

Not in `useAppPalette` — a hook cannot own a shared interval without
every consumer starting its own. A small `SkyPaletteProvider` above
`AppNavigationRoot` holds the interval and publishes `SkyPaletteInput`;
`useAppPalette` reads it from context. One timer, one re-render fan-out,
and it is trivially disabled by returning `undefined` when the user is
not on Sky.

### 6.3 The honest re-render number

Twelve palette changes an hour × a full tree re-render is not free, but
it is the same order as a theme toggle, which the app already survives.
The thing to measure before widening `QUANTUM` downward is not frame time
on a new phone; it is battery on an old one, over a day.

---

## 7. Reading surfaces

Hassan's second request, and the one that makes the whole thing viable:
*"in the dua and quran translate view we can make the card with the text
shift the color to make it more readable."*

### 7.1 A new pair of tokens

```ts
/** An opaque, un-washed surface for text somebody reads at length. */
readingSurface: ColorValue;   // the base card, no wash, no translucency
readingInk: ColorValue;       // the base text, no wash
```

Under every appearance except Sky these are exactly `card` and `text`, so
nothing changes for anybody who never turns Sky on. Under Sky they are
the **un-washed** base values — so the card shifts with the day (it is
light by day and dark by night, which is the "shift the colour" being
asked for) while never taking the hue that the room around it does.

The result is a page whose chrome carries the time of day and whose
reading matter sits in a clean, high-contrast panel on top of it. That is
also the oldest trick in print — a tinted spread with white text blocks —
and it works for the same reason.

### 7.2 Which surfaces take it

| surface | file | what changes |
|---|---|---|
| Dua card | `src/screens/DuasScreen.tsx` (`styles.card`, ~line 368) | `palette.card` → `palette.readingSurface` |
| Ayah card | `src/screens/quran/TranslationSurahScreen.tsx` (`styles.ayahCard`, style at 858) | same; keep `accentBg` for the playing row |
| Ayah sheet | `src/quran/mushaf/AyahActionSheet.tsx` (~line 356) | same — it is the tafsir reader in practice |
| Surah header card | `TranslationSurahScreen.tsx` (610, 678) | same, so the page does not read as two materials |

### 7.3 One inconsistency to fix while we are here

The dua translation is drawn in `palette.text` (`DuasScreen.tsx:466`) and
the Qur'an translation in `palette.muted`
(`TranslationSurahScreen.tsx:598`). Same kind of text, two weights, and
`muted` is the weaker of the two for the longer read. They should agree,
and they should agree on `readingInk`. Which one is *correct* is a call
for Hassan — my reading is that a translation somebody is reading is body
text, not a caption, so `text` is right and the Qur'an view is the one
that changes.

---

## 8. The muṣḥaf stays out — and what `auto` should mean

Hassan: *"not in the reader"*. Agreed, and the reader is already built to
be left alone: `src/quran/mushafTone.ts` is `// tokens-ok`, owns its own
`TONE_PAGE_BG` / `TONE_CHROME` tables, and stores its preference in
`quranState.prefs` (`mushafNightMode`, `mushafPaperTone`, `mushafToneAuto`)
rather than in app settings. The page never takes a wash. Nothing in §3
touches it.

**But there is a coupling nobody has noticed**, and it needs a decision
rather than a default. `mushafTone(prefs, appDark)` resolves `auto` as
`appDark ? 'night' : 'paper'` — and `appDark` comes from
`useAppPalette().isDark`. So the moment the app palette starts flipping
with the sun, **a reader on `auto` follows it**, which means a page can
go from paper to night under somebody's eyes at Maghrib.

Two defensible answers, and the first is better:

1. **Resolve the reader's tone once per reader mount and hold it.** A
   flip never happens mid-page; it takes effect the next time the reader
   is opened. `auto` then means what it should have meant all along —
   *paper when you read by day, night when you read at night* — which
   under Sky is more truthful than following the OS ever was.
2. Pin `auto` to the OS scheme even under Sky. Safer, and it throws away
   the one place the sky genuinely improves the reader.

Either way the page colours themselves remain `TONE_PAGE_BG`. The sky
never reaches the muṣḥaf.

---

## 9. When there is no sky

Three cases, and all three must resolve to something before a line of
this ships, because two of them are the app's normal state for a while.

**No location yet.** The sky is computed from prayer times, and prayer
times need coordinates. The first-launch flow has none until its second
screen, and a user who skips location never gets any. `SkyPaletteInput`
is `undefined` in that state and `resolveAppPalette` falls through to the
ordinary base — so Sky silently behaves as System until there is a sky to
follow. It is never an error state and never a message.

**High latitude — and this is Hassan's own market.** The app is tuned for
Sweden. Above roughly 60°N the passages compress hard in June and in
December: for weeks the sky model sits on `day` almost around the clock,
or on `night`. That is not a bug and must not be treated as one — it is
what the sky actually does there — but it means the feature is least
expressive for a large share of the user base for months at a time, and
anybody proposing to make Sky the default should read that sentence
twice.

The degenerate handling is simply: a passage with zero or negative
duration is skipped, and the base holds whatever it last was. No
interpolation across a passage that did not happen.

**Before hydration.** `MushafSurahScreen` already has the pattern —
`backgroundColor: !quranHydrated ? palette.bg : TONE_PAGE_BG[tone]`. The
palette does the same: no sky until settings and prayer times have
loaded, so the app never opens on a colour it then corrects.

---

## 10. Accessibility

- **Reduce Motion** — the ink flip is a straight swap, no cross-fade.
- **Increase Contrast / Reduce Transparency** — the wash strength drops
  to zero and the base flip stays. Sky then means "light by day, dark by
  night" and nothing else, which is a perfectly good version of the
  feature and the right one for somebody who asked the OS for maximum
  legibility.
- **The contrast floor is a test, not a hope.** §14.
- **The flip is announced to nothing.** It is not a state change the user
  made; a screen reader must not narrate it, and no `accessibilityLiveRegion`
  goes anywhere near it.

---

## 11. What has to be swept before this ships

A palette that changes exposes every place that quietly assumed it would
not. There are three classes and they need different treatment.

### 11.1 Hardcoded colours in style props — roughly 45–50, in ~33 files

`src/` holds 287 hex literals across 47 files, but most are legitimate:

- **80 are the definitions themselves** — `appPalette.ts` (38),
  `tokens.ts` (33), `widgetAccent.ts` (7), `settings/types.ts` (2).
- **45 are deliberately theme-independent drawn scenes** — `skyModel.ts`
  (24), `mushafTone.ts` (16), `MushafTextPageSurface.tsx` (4),
  `sunnahTheme.ts` (1), all already carrying `tokens-ok`.
- **41 are off-palette render targets** — the share images and the
  pairing QR (`ShareTable` 13, `ShareBanner` 11, `ShareAyahModal` 6,
  `ShareFooter` 4, `ShareMonthScreen` 4, `PairingQr` 3). A shared PNG
  should look the same on the recipient's phone as on the sender's; these
  are correct as they are.

What is left is the problem: **`'#fff'` and `'#000'` on spinners, icon
defaults and on-accent labels**, spread across roughly thirty-three files
— `icons.tsx` alone has fifteen `'#000'` default props,
`LocationSetup.tsx` three `'#fff'`, plus singles in `Button.tsx`,
`Card.tsx`, `Banner.tsx`, `BackToTop.tsx`, `ConfirmModal.tsx`,
`MiniPlayer.tsx`, `TimePickerSheet.tsx` and the rest. A white spinner on
a pale dawn ground is invisible; a black icon default on a night ground
is too.

These are already wrong today under Material You — this plan just makes
it obvious. The sweep: `onAccent` for anything sitting on the accent,
`text`/`muted` for anything sitting on a surface, and an icon whose
colour was never passed gets the palette rather than a default. Then
extend `scripts/tokens-audit.js` with a rule that fails a bare `'#fff'`
or `'#000'` in a style prop outside the `tokens-ok` set, so the class
cannot come back.

### 11.2 Two bugs found while mapping this

Neither is caused by this plan; both are made worse by it.

- **`MushafSpreadReader.tsx:622,639`** paints the page-turn chevrons
  `nightMode ? '#1d1d1d' : '#f4efe4'`, bypassing `TONE_CHROME` entirely.
  On **sepia** they are the paper colour on a sepia page — a pale grey
  smudge. It should read `TONE_CHROME[tone]` like everything else in that
  file.
- **`QiblaChip.tsx`** sits in the hero's top row beside `LocationChip`
  and, unlike it, takes no `ink` prop — it paints itself from
  `palette.accentSolid` / `palette.card` / `palette.border` while its
  neighbour correctly takes the sky's ink. Today that is a small
  mismatch against a drawn gradient. It should take the same optional
  `ink` prop `LocationChip` already has (`LocationChip.tsx:71`), which is
  the cleanest existing example of the dual-surface pattern in the repo.

### 11.3 The navigation theme

`buildNavigationTheme(palette, isDark)` in `src/theme/navigationTheme.ts`
maps the palette into React Navigation's own `Theme`. It is a pure
function of the palette, so it follows for free — but it must be rebuilt
when the palette identity changes, and the `isDark` it is handed must be
the *sky's* base, not `resolveEffectiveDark`'s. Easy to miss; it is the
one consumer that takes `isDark` as a separate argument.

---

## 12. How anybody finds it

A fourth value on the existing Theme control in
`src/screens/settings/AppearanceCard.tsx` — **System · Light · Dark ·
Sky** — which is a `SegmentedControl` already, so this is one more
segment and one more string. Four segments is the most that fits on a
narrow phone without truncating; there is no room for a fifth, which is
a useful constraint to have discovered now.

Under Sky the card should say what it does in its footer, once: the times
of day it follows and the fact that the muṣḥaf keeps its own tone. The
existing `settings.themeHelp` footer is the place.

**Offer it in first-launch too.** The shelf built in
`docs/design/onboarding-remake.md` §3.5 has a Theme row that is already a
three-segment control; making it four is free and is the difference
between a feature nobody finds and a feature people choose. It stays
opt-in either way — see §15.

---

## 13. Phases

Four, and the first is worth shipping even if the rest never happens.

### Phase 0 — the sweep

§11 entirely: the `'#fff'` / `'#000'` audit and its new lint rule, the
`MushafSpreadReader` chevrons, the `QiblaChip` ink prop. No new feature,
no new setting, and the app is more correct under Material You afterwards
whatever happens to this plan.

### Phase 1 — the engine, without the wash

`appearance` gains `'sky'` (additive migration, unknown values coerce to
`'system'`). `SkyPaletteProvider`, the quantised key, the passage-bound
base flip and its cross-fade. **Wash strength zero.** So Sky at this
point means exactly "light by day, dark by night, turning at dawn and
dusk" — which is already a real feature, is the version that survives
Increase Contrast, and proves the tick and the flip in isolation before
any colour is at stake.

### Phase 2 — the wash, and the reading surfaces

`washPalette`, the five strengths tuned on a device across a real day,
and `readingSurface` / `readingInk` with the four call sites in §7.2. The
two land together because the wash without the reading surface is the
version that makes a dua harder to read.

### Phase 3 — the reader's `auto`, and the edges

§8's decision, the Appearance card copy, the onboarding shelf segment,
and the high-latitude behaviour verified against a Kiruna coordinate in
June and December rather than reasoned about.

---

## 14. Tests

The point of testing this is not that a colour is a particular hex. It is
that **no combination of time, passage and setting produces text you
cannot read.** That is a property, it is cheap, and the repo already has
the shape of it — `heroSkyEdgeCases.test.ts` sweeps the hero minute by
minute.

- **The contrast floor.** For each of a year's worth of sampled days at
  three latitudes (Stockholm, Casablanca, Kiruna), step the day in
  five-minute quanta; at every step build the palette and assert
  `contrastRatio(text, bg) ≥ 4.5` and `≥ 3.0` for `muted` against both
  `bg` and `card`. `contrastRatio` already exists in `src/theme/themeMap.ts`.
- **The flip happens at most twice a day**, and never more than once per
  passage. This is the assertion that catches the non-monotonic sunset.
- **The wash never crosses the threshold.** For every passage, the washed
  `bg` stays on the same side of `INK_SWITCH_LUMINANCE` as its base. If
  this fails, §5.1's guarantee is void.
- **Ink is never washed.** A structural test: `washPalette` output equals
  its input for `text`, `muted`, `textSolid`, `mutedSolid`, `onAccent`,
  `accent`, `accentSolid`.
- **No sky, no change.** With `sky: undefined`, `resolveAppPalette`
  returns exactly what it returns today — byte-for-byte, for all four
  appearance values and both `pureBlackDark` states. This is the test
  that lets everyone who never turns Sky on ignore this document.
- **The quantised key is stable.** Two calls within the same quantum
  produce a referentially equal palette. Without this the re-render
  budget in §6 is fiction.
- **`readingSurface` is un-washed** under Sky and identical to `card`
  under every other appearance.

---

## 15. What this deliberately does not do

- **It does not become the default.** Not on a fresh install, not on
  upgrade. §9's high-latitude paragraph is the reason: a feature that is
  inert for months for a large share of the user base is a strange thing
  to impose, and a moving interface is a strong opinion to hand somebody
  who did not ask for one.
- **It does not touch the muṣḥaf.** §8.
- **It does not touch the widgets or the Live Activity.** They have their
  own colour path (`syncLiveActivity.ts`, `widgetAccent.ts`) and the Sky
  widget already samples the sky independently. Two systems that agree by
  coincidence are worse than two that are openly separate; if they should
  share, that is its own plan.
- **It does not touch the share images or the QR.** §11.1 — a shared PNG
  must look the same to the person receiving it.
- **It does not add a third ink threshold.** §1.2.
- **It does not make the accent move.** §2.1.
- **It does not interpolate continuously.** §6.1 — five-minute quanta,
  and the only thing that moves at human speed is the one flip.
- **It does not add a dependency.** `mixHex`, `luminance`,
  `contrastRatio` and the whole sky model are already in the repo.
