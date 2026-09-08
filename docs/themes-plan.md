# Themes — a background layer for the whole app

Written 2026-09-08, at Hassan's request, against v2.18.0 (264).

The ask, in his words: *"proper themes connected to islamic sites,
personalities, and other that makes peoples faith stronger seeing them… a
custmized background of the whole ui with mybe a custmized looped video or a
picture… my competitors offer [this] for paid subscriptions which is just
disgusting… make the vision better than my competitors so no one needs to pay
them for something i can make better."*

This document is the plan. It answers four questions in order, because the
later ones are meaningless if the earlier ones are answered wrong:

1. Are we allowed to do this at all, given what `docs/design/principles.md`
   already says? (There is a direct conflict. §1.)
2. What can a theme honestly *be*, given that one of the three named
   categories cannot be depicted? (§2.)
3. Where do the pictures come from, and under what licence? (§3.)
4. How is it built, and what does it cost? (§4–§8.)

---

## 1. The conflict, stated plainly

`docs/design/principles.md` §2 currently reads:

> Islamic motifs (geometric patterns, calligraphy, crescents) appear as quiet
> accents. **Never as wallpaper. Never as decoration.**
>
> - No mosque silhouettes as decorative wallpaper. They appear only in
>   onboarding and empty states, intentionally.

And the `designer` subagent's brief rejects "geometric patterns as
backgrounds" outright.

That is the app's own written law, and the feature being asked for is
literally the thing it forbids. Two dishonest ways out exist and both are
refused here: quietly building it and hoping nobody re-reads the principles,
or building it and calling it something other than wallpaper.

The honest way out is that the principle is right about the *default* and
wrong about the *choice*. What it protects against is the app deciding, on
the user's behalf, that every screen should have a mosque behind it. That
remains forbidden. What it does not need to forbid is a user, in Settings,
electing to see the Dome of the Rock behind their prayer times, at a strength
they picked, with a legibility floor the app enforces on their behalf.

**Proposed amendment to `principles.md` §2**, to be made in the same commit as
Phase 1 and not after it:

> Islamic motifs appear as quiet accents **wherever the app chooses them**.
> The app never decorates on its own initiative: shipped defaults have no
> imagery behind them, and no update turns one on.
>
> A **user-chosen scene** is different in kind: it is the user's own
> preference for their own device, off unless they turn it on, reversible in
> one tap, and bound by the legibility floor in §3 — the app never lets a
> chosen scene make a prayer time harder to read. Calm remains the default;
> it is no longer the only thing permitted.

If Hassan does not accept that amendment, the feature does not get built, and
that is a legitimate answer. Everything below assumes he does.

Three parts of §2 survive untouched and constrain the design below:

- **Calligraphy is reserved for Quran ayahs and dua text, never UI labels.**
  So a "calligraphy theme" is a manuscript page behind the UI, not the word
  *Settings* rendered in thuluth.
- **Contextual accents belong to contextually appropriate days.** Which is
  the hook Phase 4 uses, rather than inventing a new mechanism.
- **The app does not shout.** So the default scene strength is the quietest
  of the three stops, not the loudest.

---

## 2. What a theme can honestly be

Hassan named three categories. They are not equally buildable.

### Sites — yes, and this is the strongest one

Photographs and historical drawings of the Haramayn, al-Aqsa and the Dome of
the Rock, Quba, the Prophet's Mosque, the Umayyad Mosque, Córdoba, Sultan
Ahmed, Sheikh Zayed, Djenné, the Registan, Fatehpur Sikri. These are places,
they are photographed constantly, and much of what exists of them is public
domain or CC0. No consent problem, no depiction problem.

### Personalities — no, and this needs saying out loud

There is no honest version of a theme that depicts the Prophet ﷺ, his family,
the companions, or the four imams. Not stylised, not faceless, not "light
where the face would be". A large share of the app's users would consider a
faceless silhouette an offence rather than a compromise, and the app has no
business taking a side in that.

What *can* carry a personality, truthfully:

- **Their words**, as manuscript. A page of Sahih al-Bukhari in the Yusuf Agha
  copy; a hadith in muhaqqaq. The text is the subject.
- **Their places.** A theme called "Uhud" is the mountain. A theme called
  "Madinah" is the city.
- **Their objects and era.** A 9th-century Kufic Qur'an folio; an astrolabe
  by al-Khujandi; the ceiling of a madrasa that carries a name.

So the category is renamed in the product: not *personalities* but
**"Words and places"**. The emotional target Hassan is aiming at — *seeing
this makes my faith stronger* — is met better by a Kufic folio from 900 CE
that the user can tap and read the provenance of, than by any illustration
could have met it.

### "Other that makes peoples faith stronger" — yes, three families

- **Geometry.** Girih, zellij, muqarnas projections, star-and-polygon
  tilings. Generated, not photographed (§3.2), so unlimited and free of
  licence risk.
- **Nature the Qur'an names.** Night sky and the stars of 6:97; rain; the
  date palm; the two seas that do not mix; dawn.
- **The user's own photograph.** Their masjid, their journey, their mihrab.
  Costs nothing, is legally spotless, and is the single feature the paid
  competitors cannot match on quality because it is not their picture to beat.

---

## 3. Where the pictures come from

### 3.1 The licence table

Verified 2026-09-08. Anything marked **verify** must be re-checked at the
moment of use and recorded in `docs/data-sources.md` per repo convention.

| Source | Licence | Bundling in an AGPL app | Attribution |
|---|---|---|---|
| The Met Open Access (~406k works) | **CC0** | yes | not required (we do it anyway) |
| Smithsonian Open Access (~2.8M) | **CC0** | yes | not required (we do it anyway) |
| Cleveland Museum of Art Open Access | **CC0** | yes | not required (we do it anyway) |
| Rijksmuseum public-domain set | public domain | yes | **verify** API terms before first use |
| Wikimedia Commons | mixed CC BY / CC BY-SA / PD | yes, per file | **TASL required** for CC BY/BY-SA |
| Unsplash / Pexels / Pixabay | own licence | yes, but see below | not required |
| Khalili Collections, most museum "hi-res on request" sets | not free | **no** | — |

Two things worth knowing that decided the shape of this plan:

**CC BY-SA in a collection does not infect the app.** ShareAlike attaches to
*adaptations*, not to *collections*. A CC BY-SA photograph shipped unmodified
alongside the app, credited, is a collection; the app does not become
CC BY-SA because of it. Cropping or recolouring it, however, makes an
adaptation, and then ShareAlike does bite. **Therefore: any CC BY-SA asset is
shipped byte-identical or not at all.** Since the pipeline in §5 re-encodes
and scrims everything, in practice this means *we do not take CC BY-SA
assets*. CC0 and public domain only. It is a one-line rule that removes an
entire category of future legal argument, and there is enough CC0 Islamic art
that we lose nothing.

**The stock sites are the weakest option, not the strongest.** Unsplash,
Pexels and Pixabay all require no attribution and grant irrevocable use — but
all three disclaim model releases and property releases, forbid
redistribution "on a competing platform", and put the legal risk on us. A
photo of a mosque interior with recognisable worshippers in it is exactly the
case their licence does not cover. They are the fallback for generic nature,
not the source for the flagship themes.

The museum route is better on every axis that matters: CC0 rather than a
platform licence, provenance we can display, and imagery no competitor is
using because it takes work to find. **This is the actual answer to "make it
better than the paid ones."** They ship a stock-photo pack. We ship a folio
with an accession number.

### 3.2 Generated geometry — the free, infinite tier

Existing work, all permissively licensed, all read before adopting:

- `amehina/islamic_svg_pattern_generator` — MIT, SVG output, girih family.
- `TheBeachLab/islamic-geometry` — construction-line approach, the closest to
  how the patterns are actually drawn historically.
- `cookmom/tenfold` — tenfold rosette systems.
- `jasonlong/geo_pattern` (Ruby) and `btmills/geopattern` (JS) — generic, not
  Islamic, but the deterministic seed→pattern API is the right shape.

**Recommendation: take the algorithms, not the dependency.** These generate
SVG at build time in a script (`scripts/design/build-patterns.mjs`), and the
app ships the resulting SVG — a few kB each, vector, scales to any screen, no
runtime dependency added, no F-Droid question. A generated pattern theme costs
~2 kB where a photograph costs ~300 kB, so this tier can be large and
bundled while the photographic tier is downloaded.

Licence hygiene: whichever project's construction we adapt gets credited in
`docs/data-sources.md` and its MIT notice carried in `NOTICE`, exactly as the
mushaf font pipeline credits `nuqayah/qpc-fonts`.

---

## 4. Looped video: no, and here is the arithmetic

Hassan asked "mybe a custmized looped video". The recommendation is **no**,
for Phase 1–4, and probably permanently. Four independent reasons, any one of
which would be enough:

1. **There is no video dependency in the app and adding one is not small.**
   `react-native-video` pulls ExoPlayer on Android and AVFoundation on iOS,
   adds several MB to the APK, and has to clear F-Droid's build (arm64-only
   CI, 1-hour timeout) — the same CI that already takes most of its hour.
2. **The measured cost of continuous work is known and it is bad.**
   `docs/design/background-power.md` measured the Live Activity's 1 Hz
   notification re-post at **5.83 s of CPU per 180 s** versus 0.29 s once it
   was fixed — twenty times. A looped video decode on the Today screen is
   that class of continuous work, on the screen that document already names
   as the hottest surface (item 2: a 1 Hz countdown re-render that runs even
   backgrounded). Adding a video decoder behind it is moving in the wrong
   direction on the app's single worst power path.
3. **Reduce Motion makes a still fallback mandatory anyway.** iOS and Android
   both expose the preference, the repo already honours it in
   `src/theme/motion.ts`, and any user who has it on must get a still frame.
   So a still image has to exist and be beautiful regardless. Build that
   first; it is most of the value.
4. **A loop behind text is a legibility problem that cannot be solved once.**
   The scrim maths in §6 computes a fixed opacity from a fixed image. A
   moving image has a different worst case in every frame, so either the
   scrim is set for the darkest frame (and the video is invisible) or it is
   not (and the prayer times shimmer).

If it is ever revisited, the only version worth building is **≤3 s, ≤2 MB,
looping, muted, paused whenever the app is not foregrounded and focused, off
under Reduce Motion or Low Power Mode**, on the Qibla or the splash — never
behind the prayer grid. Phase 5, and only after Phases 1–4 have shipped and
been lived with.

There is a cheaper 80% available: **slow parallax and a breathing gradient**.
A still scene that drifts 8–12 px against scroll, and a light layer whose hue
crosses the prayer-time hue the app already computes (`principles.md` §5),
reads as "alive" at effectively zero cost, and satisfies Reduce Motion by
simply not moving.

---

## 5. The layer model

A theme is called a **scene** in code, to keep the word "theme" meaning what
it already means in this repo (`src/theme/themeMap.ts` — light / dark / OLED
semantic palettes, task #35). A scene sits *under* a theme; both are active at
once. Choosing "Kufic folio" does not stop you being in dark mode.

```
  ┌─────────────────────────────────────┐
  │  content: text, cards, controls     │  palette.text / palette.card
  ├─────────────────────────────────────┤
  │  scrim: solid palette.bg @ α        │  α computed per scene (§6)
  ├─────────────────────────────────────┤
  │  scene: image or generated SVG      │  new
  ├─────────────────────────────────────┤
  │  base: palette.bg, always opaque    │  unchanged
  └─────────────────────────────────────┘
```

### 5.1 The trap, and the way around it

`palette.bg` appears **96 times across 45 files**, and a meaningful number of
those are load-bearing *opaque*:

- `ShareMonthScreen.tsx` and `ShareAyahModal.tsx` capture a view with
  `react-native-view-shot`. A transparent background there produces a share
  image with a black or garbage backing.
- Modal sheets and `Card variant="subtle"` rely on `bg` reading as a
  *surface*, not as "the void behind everything".
- `TextInput` fills need a real colour or the caret sits on the photograph.
- `translucentSurface()` already bails out when handed a `PlatformColor`, so
  the Material You and Liquid Glass paths cannot simply be alpha-composited.

So the change is **not** "make `palette.bg` transparent". It is:

1. Add `palette.bgScene: ColorValue` to `AppPalette` — equal to `palette.bg`
   when no scene is active, `'transparent'` when one is.
2. Migrate only the ~20 call sites that genuinely mean *the screen behind
   everything*: the `RootNavigator` seam, each tab screen's outermost
   `View`/`ScrollView`, `navigationTheme.ts`'s `colors.background`.
3. Leave the other ~76 on `palette.bg`, unchanged and opaque.
4. Add a test that fails if `bgScene` ever appears in a view-shot capture
   subtree. That test is the guard rail; without it someone "tidies up" the
   two spellings into one in six months and silently breaks sharing.

`src/navigation/systemBarSurface.ts` is the precedent for publishing a
surface upward from a screen, and `src/quran/mushafTone.ts` is the precedent
for a per-context tone that is independent of the app theme — the scene
plumbing should look like those, not invent a third pattern.

### 5.2 New modules

| File | What |
|---|---|
| `src/theme/scenes.ts` | the `Scene` type, the catalogue, `sceneById()` |
| `src/theme/sceneStore.ts` | active scene + strength, module store à la `systemBarSurface` |
| `src/theme/SceneBackdrop.tsx` | the `ImageBackground`/SVG + scrim, mounted once at the root |
| `src/theme/sceneScrim.ts` | pure: (scene, palette, strength) → scrim alpha |
| `src/screens/settings/pages/ScenesSettingsScreen.tsx` | the picker |
| `scripts/design/build-scenes.mjs` | asset pipeline: encode, measure, emit manifest |
| `scripts/design/build-patterns.mjs` | generated geometry → SVG |

`Scene` carries, per entry: `id`, `kind: 'pattern' | 'photo' | 'user'`,
`assetUrl` or generator seed, `bytes`, `measuredLuminance` (§6), `credit`
(title, maker, date, collection, accession, licence, source URL), and
`context?: 'ramadan' | 'eid' | 'friday' | 'laylatalqadr' | 'night'`.

`credit` is required, non-optional, for every non-user scene — the same
discipline `docs/data-sources.md` already imposes on religious content.

---

## 6. Legibility is computed, not eyeballed

This is the part that decides whether the feature is good or embarrassing.

The repo already gates contrast: `__tests__/featureModulesPart2.test.ts`
proves six semantic pairings at ≥4.5:1 body / ≥3.0:1 large over `tokens.ts`'s
`SemanticPalette`, using `themeMap.ts`'s pure contrast helper. (`themeMap.ts`'s
header comment points at a `__tests__/themeContrast.test.ts` that does not
exist — the check was folded into `featureModulesPart2`. Worth fixing that
comment while in there.) A new background layer gets **none of that coverage
for free** — the tokens are unchanged and the test still
passes while the prayer grid sits on a photograph of a chandelier.

**The mechanism.** `scripts/design/build-scenes.mjs` samples each candidate
image and records, per scene, the worst-case luminance in the regions where
text actually sits (top third for the hero, the vertical band the prayer rows
occupy, the tab bar strip). It then solves for the minimum scrim alpha at
which every semantic pairing still clears the existing thresholds, at each of
the three strength stops, and writes those numbers into the scene manifest.

**The gate.** Extend the contrast test so that it iterates every scene in the
manifest × every theme × every strength stop, composites `palette.bg` at the
recorded alpha over the recorded worst-case luminance, and asserts the same
≥4.5 / ≥3.0 it asserts today. A scene whose numbers do not clear cannot be
added to the manifest — the build script refuses to emit it. Per repo
convention this test is verified by breaking the thing it watches: drop one
scene's alpha by 0.1 in the manifest and confirm it goes red.

**The floor.** Even at the strongest stop, the scrim never goes below the
computed minimum. "Full" means the scene is as visible as legibility allows,
not more.

**The control.** Three stops — *Subtle* / *Balanced* / *Full* — not a slider.
A slider lets a user build an unreadable app and then report it as a bug.
Default is *Subtle*, per §1.

**The other accessibility inputs**, all of which force the scene off or to
scrim-only: iOS Reduce Transparency, Increase Contrast, and any system
high-contrast setting; and `scripts/theme-scenarios.sh`, which classifies
screenshots by mean luminance, needs a `SCENE=none` env guard or it starts
mis-classifying every shot.

---

## 7. Delivery: what ships in the APK and what arrives later

The mushaf font pipeline already proves the shape:
`src/quran/mushafFontStore.ts` + `src/quran/quranDownloadManager.ts` +
`src/screens/QuranDownloadsScreen.tsx`, with a deadline registered in
`CONTENT_DEADLINES` (`src/quran/contentNetwork.ts`) — and
`quranContentDeadlines.test.ts` fails if a new download path skips it.

Scenes reuse it exactly:

- **Bundled, ~40 kB total:** every generated pattern (≤2 kB of SVG each), the
  gradient scenes, and one photographic scene at low resolution as the
  "here's what this does" example. No download needed to try the feature.
- **Downloaded on demand:** photographic and manuscript packs, hosted on a
  GitHub release like `mushaf-fonts-v2`. Budget **≤400 kB per scene** (AVIF
  with WebP fallback, sized to the largest supported screen, not larger), and
  **≤6 MB per pack**. A row appears in `QuranDownloadsScreen` — renamed, or
  given a sibling section — so scenes are deletable like everything else.
- **User photo:** copied into app storage, downscaled to the screen's needs,
  run through the same luminance measurement on device so it gets the same
  scrim treatment as a shipped scene. Never uploaded anywhere.

F-Droid: nothing here is a proprietary blob, no new native dependency, and
every bundled asset is reproducible from a script in the repo — which is the
standard the mushaf pipeline already meets.

---

## 8. Phases

**Phase 0 — the principle.** Amend `principles.md` §2 as in §1, or stop.
Update `.claude/agents/designer.md` in the same commit so the designer agent
stops rejecting the thing the app now supports. *Needs Hassan.*

**Phase 1 — plumbing, zero assets.** `bgScene`, the sceneStore, the backdrop,
the scrim maths, the settings page, the contrast-test extension. Ship with
gradient-only scenes so the whole mechanism is exercised and reversible with
nothing to license. This is the phase where the 96 call sites get sorted, and
it is most of the engineering risk.

**Phase 2 — generated geometry.** `build-patterns.mjs`, 12–16 patterns, all
bundled. Free, infinite, offline, and already better than a paid pack of
twelve JPEGs.

**Phase 3 — the museum packs.** *Words* (Kufic, muhaqqaq, thuluth folios;
CC0 from the Met, Cleveland, Smithsonian) and *Places* (the Haramayn,
al-Aqsa, Córdoba, Sultan Ahmed, Djenné). Each with an "About this scene"
sheet: maker, date, collection, accession number, licence, link. Provenance
recorded in `docs/data-sources.md` per repo convention.

**Phase 4 — context.** Bind scenes to what the app already computes: the
prayer-time hue of `principles.md` §5, Ramadan, Eid, Friday, the Tahajjud
window, Laylat al-Qadr. Opt-in, under the existing "Seasonal touches"
setting rather than a new one.

**Phase 5 — motion, only if.** Parallax and the breathing gradient first
(§4). Video reconsidered only after Phases 1–4 have shipped and been lived
with, and only under the constraints listed there.

Stretch, unscheduled: the Android widget takes the active scene as its card
background (it draws a bitmap already), and the Quran reader takes a scene
independent of the app's — `mushafTone.ts` already establishes that the
reader has its own tone.

---

## 9. Why this beats the paywall

Muslim Pro Premium's theming, itemised from their own feature list, is: pick
a background image for the Quran; pick a colour theme; pick tasbih beads;
pick a qibla dial. Four pickers behind a subscription.

Against that, shipped free:

| | them | Mihrab |
|---|---|---|
| Scene count | a fixed pack | unlimited (generated) + curated packs |
| Source | stock photography | CC0 museum collections, with accession numbers |
| Provenance | none shown | tap any scene, read who made it and when |
| Legibility | eyeballed | computed per scene, gated by a test |
| Your own photo | no | yes, with the same scrim maths |
| Follows context | no | prayer time, Ramadan, Eid, Friday |
| Where it applies | the Quran reader | the whole app, and the widget |
| Offline | download required | patterns are bundled |
| Price | subscription | free, AGPL, forever |

The differentiator that cannot be copied quickly is **provenance**. Anyone
can buy a stock pack. Assembling a curated set of CC0 Islamic manuscript and
architectural photography, with the credit line attached to each one and
displayed in the app, is research work — and it is the thing that actually
serves what Hassan asked for, which was imagery that strengthens faith rather
than imagery that decorates a phone.

---

## 10. What would change this plan

- **Hassan rejects the §1 amendment.** Then the feature is off, and the
  honest fallback is scenes confined to the Quran reader and the splash,
  where `principles.md` already permits intentional imagery.
- **The scrim maths cannot clear 4.5:1 on the prayer grid at any usable
  strength.** Then the grid keeps an opaque card and only the space around it
  takes the scene. Measure before assuming; do not ship a compromise
  invented in advance.
- **A CC0 claim turns out to be wrong** for a specific object. Then that
  object is dropped, not "credited harder". CC0-only is the rule (§3.1)
  precisely so this is a one-file deletion rather than a licensing audit.
- **The APK grows past what F-Droid and the arm64-only CI tolerate.** Then
  more of the bundled tier moves to download; the pattern tier is small
  enough that it never needs to.

---

## Related

- `docs/design/principles.md` — the law this feature amends (§1).
- `docs/design/background-power.md` — the measured cost of continuous work,
  which is why §4 says no to video.
- `docs/mushaf-font-rendering-plan.md` — the download pipeline this reuses.
- `docs/data-sources.md` — where every scene's provenance is recorded.
