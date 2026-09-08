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

**Hassan's ruling, 2026-09-08:** the principles document is guidance for
contributors and for anyone outside the project suggesting things — it is not
a constraint on him, and it can be changed, *as long as the change does not go
against the religion*. That settles the question and also relocates it. The
ceiling on this feature is not `principles.md`. The ceiling is §2 and §10
below: what may be depicted, and how sacred text is handled. A design document
can be amended by its author; those cannot.

So the principle is right about the *default* and wrong about the *choice*.
What it protects against is the app deciding, on the user's behalf, that every
screen should have a mosque behind it. That stays forbidden. What it does not
need to forbid is a user, in Settings, electing to see the Dome of the Rock
behind their prayer times, at a strength they picked, with a legibility floor
the app enforces on their behalf.

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

Amendment accepted 2026-09-08; it lands with Phase 1.

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
| Walters Art Museum — **`art.thewalters.org` only** | **CC0** | yes | not required (we do it anyway) |
| Smithsonian Open Access (~2.8M) | **CC0** | yes | not required (we do it anyway) |
| Cleveland Museum of Art Open Access | **CC0** | yes | not required (we do it anyway) |
| Rijksmuseum | **Public Domain Mark 1.0** | yes | not required (we do it anyway) |
| Library of Congress — Matson Collection | "no known restrictions on publication" | yes, with the age check in §9 | not required (we do it anyway) |
| NYPL Digital Collections public-domain sets | public domain | yes | not required (we do it anyway) |
| Wikimedia Commons | mixed CC BY / CC BY-SA / PD | per file, verified individually | **TASL** for CC BY |
| `thedigitalwalters.org` and its Commons mirror | CC BY-SA 3.0 + GFDL | **no** | — |
| **Unsplash / Pexels / Pixabay** | own platform licence | **no — see below** | — |
| Qatar Digital Library | no licence identifier, disclaims warranty | reference only | — |
| David Collection Copenhagen | no CC licence; commercial use unaddressed | **no** | — |
| Khalili Collections | CC BY-SA on their Commons uploads | **no** | — |

Three things worth knowing that decided the shape of this plan:

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

**The stock sites are not a fallback — they are excluded, and the reason is
AGPL.** This was the biggest correction the research made to the first draft.
None of the three is CC0; each grants a **non-sublicensable, non-transferable**
platform licence:

- **Pexels** forbids redistributing its photos "on other stock photo or
  **wallpaper** platforms" — a curated set of phone backgrounds is close to
  the centre of what that clause aims at.
- **Unsplash** forbids compiling its images "to replicate a similar or
  competing service", and disclaims model and property releases.
- **Pixabay's** Content License is the same shape.

Mihrab is AGPL: every recipient of the binary gets the right to redistribute
and modify the whole work. We cannot pass on rights we were granted
non-transferably. Bundling stock imagery would either misstate our own licence
or quietly produce a mixed-licence binary — the exact failure those clauses
describe. **CC0, Public Domain, or CC BY only.** Not a preference; a
constraint the app's own licence imposes.

**The Walters trap.** The Walters Art Museum publishes the same manuscripts
under two contradictory licences: `art.thewalters.org` (current) is **CC0**,
while `thedigitalwalters.org` (legacy) is **CC BY-SA 3.0 + GFDL** — and the
Wikimedia Commons copies were bulk-uploaded from the legacy project, so they
carry the ShareAlike tag. Same folio, same pixels, two licences. **Take
Walters images from `art.thewalters.org` and nowhere else**, and record the
URL in `docs/data-sources.md` so nobody later "helpfully" re-sources it from
Commons.

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

**Phase 0 — the principle.** Amend `principles.md` §2 as in §1. Update
`.claude/agents/designer.md` in the same commit so the designer agent stops
rejecting the thing the app now supports, and add a line to `principles.md`
saying what it is for — guidance for contributors and outside suggestions,
amendable by the author, bounded by §10's rules rather than by itself. That
line is why the rest of the file can move.

**Phase 1 — plumbing, zero assets.** `bgScene`, the sceneStore, the backdrop,
the scrim maths, the settings page, the contrast-test extension. Ship with
gradient-only scenes so the whole mechanism is exercised and reversible with
nothing to license. This is the phase where the 96 call sites get sorted, and
it is most of the engineering risk.

**Phase 2 — generated geometry.** `build-patterns.mjs`, 12–16 patterns, all
bundled. Free, infinite, offline, and already better than a paid pack of
twelve JPEGs.

**Phase 3 — the three scenes.** Al-Quds, then Madinah, then Makkah, in that
order and for the reasons in §9: the first two are unclaimed by every
competitor, the third is crowded. One flagship each, with the prayer-keyed
light states of §9.1, the sacred-text rules of §10, and an "About this scene"
sheet naming maker, date, collection, accession number, licence and link.
Provenance recorded in `docs/data-sources.md` per repo convention. Ship the
three before adding a fourth: three done properly beats thirty done thinly,
and it is exactly what the competitors got wrong.

**Phase 4 — off the app boundary.** The unclaimed gap (§11): the scene, in
its current light state, on the Android home-screen widget and the iOS lock
screen. The widget already draws a bitmap, so it is the same bitmap and the
same computed scrim. Plus export-to-camera-roll as a matched home/lock pair
with the credit in the image metadata. This is where the imagery is seen
dozens of times a day instead of only on open.

**Phase 5 — context.** Bind scenes to what the app already computes: the
prayer-time hue of `principles.md` §5, Ramadan, Eid, **Friday** (nobody does
Friday), the Tahajjud window, Laylat al-Qadr, the Dhul-Hijjah count. Opt-in,
under the existing "Seasonal touches" setting rather than a new one. Sajda's
trick from §11 lands here too: a contextual scene is tappable and opens the
day's content, so the background becomes an entry point rather than
decoration.

**Phase 6 — motion, only if.** Parallax and the breathing gradient first
(§4). Video reconsidered only after Phases 1–5 have shipped and been lived
with, and only under the constraints listed there.

Stretch, unscheduled: the Quran reader takes a scene independent of the app's
— `mushafTone.ts` already establishes that the reader has its own tone.

---

## 9. The first three scenes

Hassan's choice, and the right one: **Makkah, Madinah, Al-Quds**. Three
subjects done properly beats thirty done thinly, and the research says two of
the three are *unclaimed*.

Verified across Muslim Pro, Athan Pro, Athan by IslamicFinder, Muslim App,
Pillars, Sajda, Quran Majeed, Quran.com, Tarteel, Prayer Now, Muslim Mate,
Umma and Al-Moazin: **no mainstream app ships an in-app theme of Al-Aqsa or
the Dome of the Rock.** The only Al-Quds imagery found anywhere in the
category is a paid, *AI-generated* wallpaper sold off thepillarsapp.com's
store. Madinah is nearly as thin — it exists as a live video stream (Muslim
Mate, Quran Majeed, Sajda) but not as a theme. The whole category's imagery is
Kaaba-plus-generic-mosque.

So the ordering of effort is: **Al-Quds first** (entirely unclaimed, and the
research found the best free source material of the three), Madinah second
(unclaimed as a theme), Makkah third (crowded, but the one everyone expects,
and ours will be better sourced than any of them).

### 9.1 One place, five lights

The single best idea in the competitive set is Muslim App's — and it is free
there, not paywalled. Their Kaaba theme is not one image. It is **five views
of the same scene keyed to prayer time**: starry sky at Fajr, clear blue at
Dhuhr, hazy gold at Asr, glowing cloud at Maghrib, deep night at Isha. The
background becomes a clock: the app tells the time visually before the user
reads a number. Athan Pro does a weaker version ("dynamic wallpapers that
change according to the time of the next prayer").

Mihrab takes this and makes it honest, which is where we win rather than
match. Muslim App tints one plate five ways and it reads as tinting. Our
source material lets us do better, differently per scene kind:

- **Monochrome photography (Al-Quds).** The Matson plates are black and
  white. A monochrome negative takes a **duotone** genuinely — five duotones
  from one master, each carrying the prayer-time hue the app *already*
  computes for the HomeScreen hairline (`principles.md` §5). This is not
  faking daylight onto a photograph; it is printing the same negative on five
  papers, which is what a darkroom does. Honest, cheap, and one asset.
- **Colour artwork (Makkah, Madinah).** An Iznik tile is not lit differently
  at Fajr, and pretending it is would be exactly the "tacky fake" failure a
  1★ Athan Pro review names. So the artwork keeps its own colour, untouched,
  and the **field around it and the scrim** carry the prayer-time shift. The
  object is respected; the room it hangs in changes light.

That distinction — *we do not re-light a historical object* — is worth
writing into the scene manifest as a flag (`toneable: boolean`) so it is
enforced rather than remembered.

### 9.2 Al-Quds

**Flagship: "Dome of the Rock. Close-up", Matson Collection, Library of
Congress, `LC-DIG-matpc-04240`.**
<https://www.loc.gov/pictures/item/2019694536/>

- Rights advisory: **"No known restrictions on publication."**
- Master TIFF **23.5 MB** — the re-encode starts from a real master, not an
  upscale.
- Gold and tilework read instantly at lock-screen size, which the Salzmann
  salted-paper prints, beautiful as they are, do not.

The Matson collection covers Jerusalem 1898–1946 and holds ~374 items matching
al-Aqsa, including interiors, the mosaics, and Solomon's columns — enough for
a whole pack, not just one scene.

**Two conditions, both non-negotiable:**

1. **Prefer a pre-1929 exposure.** "No known restrictions" is a rights
   *assertion*, not a licence grant; the LOC states plainly it does not own
   rights to its collections. For pre-1929 material the public domain is
   solid on age alone. For 1930s–40s material it rests on the donation terms.
   Where age and donation both support it, we are done arguing.
2. **Rewrite every caption.** The LOC's own Matson titles use the 19th-century
   misnomer *"Mosque of Omar"* for the Dome of the Rock — e.g. "Jerusalem
   (El-Kouds). The rock in Mosque of Omar [i.e., Dome of the Rock]". Salzmann's
   Met title is "Jérusalem, Mosquée d'Omar". **The archival title belongs only
   in the credits sheet, never in the UI.** Ours reads: *Dome of the Rock,
   Haram al-Sharif, Al-Quds.* Be consistent about "Al-Quds / Jerusalem" and
   "Haram al-Sharif" throughout — inconsistency here reads as carelessness to
   every constituency at once.

*Licence-purity backup:* Auguste Salzmann, 1854, Met `2005.100.373.130`
(objectID 287021) — CC0 rather than a rights assertion, ~17 Salzmann Haram
views available.

### 9.3 Madinah

**Flagship: Dala'il al-Khayrat, W.583 fol. 15b — the double-page composition
of the Madinah mosque compound with the tombs of the Prophet ﷺ, Abu Bakr and
'Umar. Walters Art Museum, Ottoman Turkey, 17th century.**
<https://art.thewalters.org/object/W.583/>

- **CC0 on `art.thewalters.org`.** Not from Commons — see the Walters trap in
  §3.1. This exact folio circulates there under CC BY-SA 3.0.
- Illuminated folios scanned at 600–1200 PPI.
- It is a **double-page spread**, so it is landscape; the right-hand page
  alone is the phone crop, and conveniently the right side carries the mosque
  compound.

Why this over a photograph of the Green Dome: it is the image Muslims have
actually used for four centuries to picture Madinah. A Dala'il al-Khayrat
folio is not an illustration *of* devotion, it is an object *of* devotion.
For this subject that authenticity matters more than for the other two.

*Backup, avoiding the two-licence situation entirely:* Met `2017.301`
(objectID 752280), Dala'il al-Khayrat dated 1035 AH / 1625–26, 49 images,
unambiguous CC0.

### 9.4 Makkah

**Flagship: Ka'ba Tile, Osman Ibn Mehmed, ca. 1720–30, Iznik stonepaste. The
Met, `2012.337` (objectID 457791).**
<https://www.metmuseum.org/art/collection/search/457791>

It wins on every axis at once:

- **CC0.** No ShareAlike, no attribution obligation, no institutional hedging,
  no *Bridgeman* argument to make. The cleanest legal position of any image in
  this research.
- **Natively portrait**, 35 × 26.1 cm — cropping to a phone aspect is a trim,
  not a violent recomposition. Every other candidate is landscape.
- **Flat 2D object shot straight on** — re-encoding, cropping and scrimming
  don't fight perspective or depth of field the way a photograph does.
- Iznik blue-white-red on a dark scrim is beautiful and unmistakable at
  thumbnail size.
- It is aniconic Ottoman devotional art made *for* contemplation of the Kaaba.
  The use is congruent with the object's original purpose, which is the best
  possible answer to anyone who asks whether this is appropriate.

*Backup:* Futuh al-Haramain, Muhi al-Din Lari, mid-16th c., Met `32.131`
(objectID 448692) — 35 images, CC0, and it covers **both** Haramayn in one
object, so it can seed Makkah and Madinah together.

**Deliberately not used as flagship: Muhammad Sadiq Bey's 1880–81
photographs** — the first ever taken of Makkah, the Great Mosque and the
Kaaba. He died in 1902, so the works are public domain by age worldwide, and
under *Bridgeman v. Corel* a flat scan of a public-domain 2D work generates no
new copyright. But the best scans sit with the Khalili Collection under a
CC BY-SA tag, and "legally defensible after an argument" is not the position
this app takes on religious content. Safe, but reputationally awkward. Keep as
a documented option, not a shipped asset.

### 9.5 Sourcing recipes

Recorded so this is reproducible rather than a one-time scavenger hunt, in the
spirit of `scripts/mushaf/build_qcf_assets.py`.

```sh
# Met — verify licence, then take the ORIGINAL, not web-large
curl -s https://collectionapi.metmuseum.org/public/collection/v1/objects/457791 \
  | jq '{isPublicDomain, primaryImage, accessionNumber}'

# Rijksmuseum — the object page serves a downscaled WebP; IIIF has the master
curl -s https://iiif.micr.io/RqvLc/info.json | jq '{width, height}'   # 4668 x 3350
#   then: https://iiif.micr.io/<id>/full/max/0/default.jpg

# Wikimedia Commons — accept CC0 / PDM / CC BY only, reject anything with "SA"
#   .../w/api.php?action=query&format=json&titles=File:X.jpg
#     &prop=imageinfo&iiprop=url|size|extmetadata
#   then read extmetadata.LicenseShortName
```

Note for whoever runs these: `loc.gov/item/...` URLs returned 403 to automated
fetching while `loc.gov/pictures/item/...` worked, and NYPL's search endpoint
403s too — browse its item pages directly.

---

## 10. Sacred text: the rules that are not ours to bend

This is the part of §1 that `principles.md` cannot amend, and the part most
likely to produce a justified complaint if it is got wrong.

Several of the best candidates carry Qur'anic calligraphy. The Met's Sitara
(`2009.59.1`), a kiswa door-curtain, is essentially a textile *of* Qur'anic
verses; the cenotaph covers in the same search (`32.100.460`, `08.178.2`) are
likewise "with Qur'anic Calligraphy"; many Dala'il al-Khayrat folios carry
sacred text around the Haramayn illustrations.

The mainstream position is permissive with conditions: a Qur'anic verse as a
phone background is permissible where it serves reminder and reflection rather
than decoration, the script stays clear and legible, and the text is not
shaped ornamentally into figures — the Islamic Fiqh Council condemned shaping
verses into animal or bird forms as toying with the words of Allah
(<https://islamqa.info/en/answers/300101/>).

Translated into buildable rules:

1. **Prefer frames without Qur'anic text.** The Ka'ba Tile's architectural
   field and the Futuh al-Haramain plans are largely diagrammatic. Sidestep
   the question where sidestepping costs nothing.
2. **Never crop mid-verse.** A 19.5:9 phone crop will slice straight through a
   calligraphic band. The crop box is chosen by hand per scene and recorded in
   the manifest; the build script must refuse a scene whose crop box is absent
   rather than centre-cropping by default.
3. **The scrim is a hazard, not just a legibility tool.** Darkening sacred
   text until it is present but *unreadable* is worse than either showing it
   clearly or excluding it. A scene flagged `sacredText: true` gets a scrim
   ceiling as well as the §6 floor — and if the two cannot both be satisfied,
   the scene is rejected, not compromised.
4. **Nothing sacred under the chrome.** No Qur'anic text may fall under the
   clock, the tab bar, the notification shade, or the gesture bar. That is the
   "beneath the user's finger" objection, and it is the most common complaint
   made about wallpaper apps. Composition must put calligraphy in the safe
   middle band, and this is checkable in the build script from the crop box
   plus the known chrome insets.
5. **Ship a toggle: "Scenes containing Qur'anic text" — default off.** Cheap
   to build, and it turns a complaint vector into a feature. Users who want
   the Sitara can have it; users who would rather not have sacred text behind
   a settings toggle never see it.

**Figuration.** Haramayn depictions are overwhelmingly aniconic, so the usual
objection does not arise — but some Hajj scrolls and Ottoman miniatures *do*
contain human figures, and a minority of users object. Check every plate; flag
`figures: true` in the manifest and keep those out of the default set.

**One rumour to not act on.** The story that Saudi Arabia banned photography
inside the Two Holy Mosques for Hajj 2026 is **false** — no directive from the
Saudi Press Agency, the Ministry of Hajj and Umrah, or the General Authority
for the Care of the Two Holy Mosques. No Saudi copyright or sui-generis claim
over *historical* depictions of the Haramayn was found either; Ottoman tiles,
16th-century manuscripts and 1880s photographs are unencumbered. What the
state does control is official imagery, on-site filming permission and its own
branding — none of which touches a CC0 museum object.

---

## 11. What the competitors do well

Nine apps were examined. Five ideas are worth taking, and one gap is worth
running straight into. Everything here is from published feature lists,
changelogs and reviews.

**1. Prayer-keyed variants of one scene — take it, improve it.** Muslim App's
five-light Kaaba (§9.1). This is the strongest single idea in the category and
it makes the background functional rather than decorative. Our improvement:
duotone a real monochrome master rather than tinting a colour plate, and
never re-light a historical object.

**2. Wallpaper bound to the day's content — take it, generalise it.** Sajda's
Ramadan wallpaper "updates daily to match today's Ramadan lesson, with a
main-screen button to open the content", plus 14 wallpapers across Dhul-Hijjah.
The background stops being decoration and becomes an *entry point*, and the
daily change creates a reason to open the app. Generalise to the day's ayah,
Friday, and the Dhul-Hijjah count. **Nobody does Friday imagery at all** —
that is a free, obvious win, and Phase 4 already has the hook.

**3. Readability machinery — take it, then remove the user from it.** Muslim
App ships a dimming slider, a semi-transparent panel behind the text, and
advice to pick photos with a calm top third. That is the right set of
concerns and the wrong division of labour: it makes legibility the user's
job. §6 computes the scrim from the image's measured luminance and gates it
with a test, so the failure they warn about becomes structurally impossible
instead of documented.

**4. Export to the camera roll — take it as-is, then better it.** Athan Pro
lets users "apply to the app or save to your photo album." It costs almost
nothing and doubles a pack's perceived value — the user puts our Dome of the
Rock on their actual phone wallpaper, which is free distribution of the app.
Improvement: export a matched **pair**, home-screen and lock-screen crops
sized correctly, with the credit line embedded in the image metadata. Nobody
does the pair.

**5. Provenance — take it and weaponise it.** thepillarsapp.com's wallpaper
store is the only source in the entire category that discloses which images
are AI-generated and which are photographs, with a note on where and when each
was shot. Meanwhile a 1★ Athan Pro review reads: *"The wallpapers are cool
though except the tacky fake ones!"* Trust is a live issue here, not a
compliance footnote. Our position — **every scene is a real historical object,
none is AI-generated, each names its maker, date, collection and accession
number** — is defensible in a way no competitor's is, and it is exactly the
right posture for a subject where reverence is the whole point.

**The gap: the theme dies at the app boundary.** Every serious competitor has
widgets, and several have well-praised ones — but **not one carries its
imagery onto the home-screen widget or the iOS lock screen.** Widgets are
uniformly flat colour or gradient; Muslim App tells users outright that themes
change things "inside Muslim App only." That is where a background would
actually be seen dozens of times a day rather than only when the app is
opened. The Android widget already draws a bitmap, so the scene is the same
bitmap with the same computed scrim. This moves from "stretch" in §8 to the
thing worth building right after Phase 3.

**And what to imitate about the business model.** Muslim App ships all of this
free and sells ad-removal and AI features instead — and draws zero theme
complaints. Muslim Pro bundles themes, Quran backgrounds, tasbih beads and
qibla dials into a $34.99/yr "Make it yours" block; Athan Pro charges $6.99
for "Customization" and drew *"now we gotta pay for a dark theme???"*. Pillars
gates "More themes (e.g. Fajr theme)" behind $49.99/yr. The resentment is
specific, quotable and aimed exactly at what Hassan called disgusting. We ship
it free because the app is free — but it is worth knowing that the one
competitor who also ships it free is the one nobody complains about.

**One caution, flagged as inference.** No review anywhere complained about
unreadable text over photos, download size, or battery. That is evidence the
incumbents ship imagery *conservatively*, not that the risks are absent. Going
heavier on full-bleed photography inherits risks they have avoided — which is
the argument for §6's computed scrim and §4's refusal of video, not against
them.

---

## 12. Why this beats the paywall

Muslim Pro Premium's theming, itemised from their own feature list, is: pick
a background image for the Quran; pick a colour theme; pick tasbih beads;
pick a qibla dial. Four pickers behind a subscription.

The rest of the field, from §11: two apps key imagery to prayer time, one
binds it to the day's content, one lets you use your own photo, one exports
to the camera roll — and **not one** carries a theme past the app's own
boundary, credits a source, or themes Al-Aqsa at all.

| | best competitor | Mihrab |
|---|---|---|
| Scene count | a fixed pack | unlimited (generated) + three deep subjects |
| Source | stock photography, some AI-generated | CC0 museums, PD photography, accession numbers |
| Provenance | one paid wallpaper store labels AI vs photo | every scene names maker, date, collection, licence |
| AI imagery | present, and reviews call it "tacky fake" | none, stated plainly |
| Legibility | a dimming slider the user must operate | computed per scene, gated by a test |
| Sacred text | unaddressed | §10: no mid-verse crops, no scrimmed verses, nothing under chrome, opt-in |
| Your own photo | one app | yes, with the same scrim maths |
| Prayer-keyed light | one app, one subject, by tinting | every photographic scene, by duotone from a real master |
| Al-Quds | nobody (one AI wallpaper, sold) | flagship subject |
| Madinah | nobody (live stream only) | flagship subject |
| Where it applies | inside the app only | the app, the home widget, the lock screen |
| Bound to content | one app, Ramadan only | prayer, Ramadan, Eid, Friday, Dhul-Hijjah |
| Offline | download required | patterns and one scene bundled |
| Price | $6.99 IAP → $49.99/yr → $34.99/yr | free, AGPL, forever |

The differentiator that cannot be copied quickly is **provenance**. Anyone can
buy a stock pack or generate one. Assembling a curated set of CC0 Islamic
manuscript and public-domain architectural photography, verifying each
licence, composing the crop so no verse is cut, and showing the accession
number in the app, is research work — and it is what actually serves what
Hassan asked for, which was imagery that strengthens faith rather than imagery
that decorates a phone. A user who taps the Madinah scene and reads *Dala'il
al-Khayrat, Ottoman Turkey, 17th century, Walters Art Museum W.583* is having
a different experience from a user looking at a stock photograph, and it costs
nothing to give them.

---

## 13. What would change this plan

- **The scrim maths cannot clear 4.5:1 on the prayer grid at any usable
  strength.** Then the grid keeps an opaque card and only the space around it
  takes the scene. Measure before assuming; do not ship a compromise
  invented in advance.
- **A sacred-text scene cannot satisfy both the §6 floor and the §10
  ceiling.** Then it is rejected, not compromised. A verse darkened into
  illegibility is worse than no verse.
- **A CC0 claim turns out to be wrong** for a specific object. Then that
  object is dropped, not "credited harder". CC0/PD/CC BY-only is the rule
  (§3.1) precisely so this is a one-file deletion rather than a licensing
  audit.
- **The chosen Matson plate turns out to be post-1929.** Then swap to a
  pre-1929 exposure, or fall back to the Salzmann (Met, CC0). "No known
  restrictions" is an assertion, not a grant, and the age check is what makes
  it solid — do not skip it because the flagship looks better.
- **The Walters folio gets re-sourced from Commons by someone helpful.**
  Then the app is shipping CC BY-SA in a modified form. Guard it: the
  `docs/data-sources.md` entry names `art.thewalters.org` explicitly and says
  why, and the build script should refuse a Walters asset whose recorded
  source URL is not that host.
- **The APK grows past what F-Droid and the arm64-only CI tolerate.** Then
  more of the bundled tier moves to download; the pattern tier is small
  enough that it never needs to.
- **A competitor ships a credited, free Al-Quds theme first.** Unlikely on
  the evidence, but it would remove the "unclaimed" argument for the Phase 3
  ordering — not the argument for doing it.

---

## Related

- `docs/design/principles.md` — the guidance this feature amends (§1).
- `docs/design/background-power.md` — the measured cost of continuous work,
  which is why §4 says no to video.
- `docs/mushaf-font-rendering-plan.md` — the download pipeline this reuses.
- `docs/data-sources.md` — where every scene's provenance is recorded.
