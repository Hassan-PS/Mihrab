# Material Design: how far to go

Question asked 2026-09-08 (Hassan): *"How about taking a completely different
route and go for material design all out as if Google would if they developed
a prayer app for muslims."*

Researched against the repo at v2.18.0 (264) and against the state of Material
in September 2026. This is a decision record, not a plan — the plan follows
whichever option is chosen.

---

## The short answer

**Don't go all out. Take the one part of Material that is genuinely better
than what we have, and leave the look alone.**

Three findings, in descending order of how much they should move the decision:

1. **The brief contradicts itself.** If Google built a prayer app, its iOS
   version would not be Material. Google put its iOS Material libraries in
   maintenance mode in **July 2021** with the note "We recommend that you
   follow Apple's Human Interface Guidelines", and in 2026 Chrome and Gemini
   on iOS ship Liquid Glass, with YouTube and YouTube Music preparing it.
   Nobody — including Google — is betting on Material reading well on iOS 27.
2. **The signature parts are not buildable in React Native.** As of May 2026
   Android UI development is officially Compose-first and the Views-based
   Material library is in maintenance mode. Material's canonical
   implementation is Compose, exclusively. `react-native-paper` 6.0.0-alpha.0
   ships the M3 Expressive *tokens and motion springs* but still the v5
   *component set* — none of the fifteen Expressive components, and no shape
   morphing anywhere in the RN ecosystem. "All out, as Google would" means
   hand-building the recognisable parts with no reference implementation.
3. **The cost here is a rewrite, not a repaint:** ~100–120 of 395 source
   files, ~15,000–20,000 lines, 3–5 months, and the app is visually
   unshippable for most of it. §3 has the breakdown.

But there **is** something in Material worth taking, and it is not the look.
See §6.

---

## 1. What Material actually is in 2026

Still Material 3; "Expressive" is its current expression; there is no
Material 4.

- **M3 Expressive** announced May 2025, shipped in Android 16 QPR1 (Sept
  2025), primary design language in Android 17 (June 2026). Two-track spring
  motion (`spatial` underdamped, `effects` critically damped), 35 shapes with
  morphing between them, Google Sans Flex (SIL OFL — legally bundleable), and
  corner tokens extended to 20 / 32 / 48.
- **Google's research claim:** 46 studies, 18,000+ participants, key elements
  spotted "up to four times faster." Read it as first-party marketing
  research — no published methodology, no effect sizes, no peer review, and
  "up to" figures are ceilings, not averages. Evidence that Google believes
  this, not evidence that it is true.
- **The backlash is real and documented.** 9to5Google called the app rollout
  "Material 3.5" — over-containerisation, inconsistent top navigation,
  disproportionately large buttons, minimal functional improvement. Reader
  complaints call the font "a comic sans clone" and the icons "drawn by
  someone with a sharpie." In August 2026 Google's own M3E sample app,
  "Achieve", was widely criticised over proportions and hierarchy.
- **Google deliberately did not follow Apple.** Asked about a glassy Android
  17, Android ecosystem president Sameer Samat replied: "Not happening."

The direction of travel matters for a prayer app: Expressive is *louder* —
bouncier springs, bigger radii, heavier containers. That is the opposite
direction from a screen someone opens at 5 a.m.

---

## 2. What is already here

Less Material than it looks, and more than has been admitted.

**The Material we have** is one hex. `android/app/.../styles.xml:19` sets
`Theme.Material3.DynamicColors.DayNight.NoActionBar`, `SystemThemeModule.kt`
reads `colorPrimary` off the theme, and `androidDynamicPalette()`
(`appPalette.ts:355`) overrides exactly four fields: `accent`, `accentBg`,
`accentSolid`, `onAccent`. Everything else is the standard palette.

**And the fuller version was already tried and reverted.** The comment at
`appPalette.ts:359-364` is the most useful thing in this whole investigation:

> System colours on Android keep the STANDARD theme's design (surfaces, text,
> dividers, bordered chrome) and ONLY recolour the accent to the live Material
> You wallpaper colour. **Previously this swapped the whole Material 3 tonal
> surface hierarchy, which changed the app's look far more than the user
> wants** — now it's an accent-only override.

So the "go further into Material" experiment has been run once, at the
surface-hierarchy level, and was rolled back on taste. That is worth
remembering before running it again at ten times the scope.

**Two pieces of drift found while looking:**

- `flatChrome`'s docstring (`appPalette.ts:21-23`) says "System dynamic
  theme", but `flatChrome: true` appears **only** at line 334, inside
  `iosDynamicPalette`. On Android the system dynamic theme leaves it `false`.
  The flag is now iOS-only in practice and the comment is stale.
- `docs/index.html:402` already tells the public the app offers "the
  platform's own palette when you want it: **Material You on Android**". That
  promise is currently kept by one accent colour. Option C below is what makes
  it true.

**What is genuinely invested in, on the other side:** `SUPPORTS_MACCATALYST =
YES` on all four configs, a 39 KB maintained Catalyst build script, 384 lines
of `src/responsive/`, iPad screenshots in fastlane, WidgetKit, ActivityKit,
Dynamic Island, Lock Screen accessories, and `GlassSurface` + `iosDynamicPalette`
+ 32 `PlatformColor`/`DynamicColorIOS` references. Roughly a third to a half of
the app's platform surface is Apple, and a meaningful part of it is Apple
*desktop*. Material has no story for any of it — `responsive-scan.js` literally
enforces a `({ hovered })` style on every `Pressable` for iPad and Mac pointer
support, which is a pointer-first Apple desktop rule.

---

## 3. What all-out MD3 would cost

| Workstream | Scale |
|---|---|
| Tonal colour: 17 palette fields → ~26 MD3 roles | 92 consumer files, **1,354 `palette.*` sites** |
| Type: 9 Apple-scale tokens → 15 MD3 tokens | **505 raw `fontSize` sites**, 780 `<Text>` |
| Shape: per-component shape mapping | **244 `borderRadius` sites**, 26 distinct literals |
| Components: ~25 MD3 components, or adopt paper and rewrite every screen | ~4,000 new lines + 274 `<Pressable>`, 33 `<Modal>`, 26 `<TextInput>` rewired |
| State layers + ripple (currently **zero** `android_ripple`) | 274 sites |
| Motion: MD3 springs → almost certainly `react-native-reanimated`, a new dependency with an F-Droid build cost | `motion.ts` + 7 files |
| Navigation: MD3 nav bar caps at **5 destinations**; we ship 6 | `MainTabs.tsx` + `tabBarInset.ts` (254 lines that exist *because* the bar floats) |
| Elevation model **inverts** — MD3 dark mode lightens surfaces tonally; we use shadows in light and surface lifts in dark | every card |
| iOS: delete `GlassSurface` + `iosDynamicPalette`, or maintain two complete design systems | ~300 deleted, or ~5,000 duplicated |
| QA scripts: `tokens-audit.js` and `responsive-scan.js` rewritten | — |

**~100–120 files, ~15,000–20,000 lines, 17–23% of the codebase — and it is the
17% every screen depends on.** 3–5 months, visually unshippable for most of it.

The hardest ten: `appPalette.ts` (the keystone), `LogScreen.tsx` (1,988),
`QuranScreen.tsx` (1,844), `TilawahScreen.tsx` (1,551), `HomeScreen.tsx`
(1,322), `PracticeHeatmap.tsx` (1,304 — dense SVG data-viz MD3 has no answer
for), the mushaf renderer pair (2,090), `MainTabs.tsx` + `tabBarInset.ts`
(where every line documents a prior regression), `chrome.ts` (116 lines,
**151 call sites** — highest leverage and easiest to break), and
`AppearanceCard.tsx` (which owns both Material You and Liquid Glass).

---

## 4. The precedent, and it is uncomfortably close

**Al-Azan** (`com.github.meypod.al_azan`) is an AGPL-3.0 prayer-times app on
F-Droid and Play, no trackers, no internet permission, 13+ languages. It was
a React Native app on `native-base`.

Its repository is now archived. The README: *"Development continues at
meypod/al-azan-compose."* The new repo: *"built natively for Android with
Jetpack Compose. This is a rewrite of the original al-azan (React Native)
app."* The rewrite gained Material You dynamic colours.

**It dropped iOS entirely to get there.**

That is the trade in its clearest form, made by the closest neighbour we have:
real Material fidelity cost them the cross-platform app. (`native-base` having
been dead since March 2023 is likely part of why — inference, not stated.)

Meanwhile `quran_android`'s Material redesign issue has been open since **April
2016** with no replies.

---

## 5. What the principles say, and whether it matters

`docs/design/principles.md` §4: *"Color is a tool of last resort. Use
typography and space to carry the design… One accent color. No multi-color
palettes."* An MD3 tonal palette **is** a multi-colour palette —
primary/secondary/tertiary containers, surface tiers 1–5. §1: *"If you're
tempted to add an animation 'for delight,' ask whether it survives a 5 a.m.
Fajr check."* M3 Expressive is delight-forward by design.

Per Hassan's ruling of 2026-09-08 that document is amendable and does not bind
him. But the *judgement* inside it is not a rule to be waived — it is a
product position: calm, quiet, legible, at Fajr. Adopting Expressive means
reversing that position deliberately, not incidentally. Worth doing only if the
position was wrong.

---

## 6. The one part of Material worth taking

**The tonal colour system, and it has nothing to do with how Material looks.**

In HCT, tone is perceptual lightness, so contrast is a function of tone
difference alone, independent of hue. Measured across every valid placement:

| Tone difference | Worst-case WCAG ratio |
|---|---|
| 40 | 3.17 (clears 3:1) |
| 50 | **4.48** — *just under* 4.5:1 |
| 60 | 6.46 |
| 80 | 12.34 |

(Note the correction to the folk rule: Δ50 does **not** guarantee 4.5:1. Δ60
is the safe gap for AA body text. The standard M3 pairs use Δ80.)

The stronger mechanism is `DynamicColor`'s contrast curves: each role solves
at runtime for the tone that hits a target ratio against its actual
background — `onSurface` targets **7:1 (AAA)** at the default contrast level,
not merely 4.5:1, and the whole thing tracks Android's system contrast slider
for free.

Measured end to end, with an Islamic-green seed (`#1B6C4A`), `SchemeTonalSpot`:

| Pair | light | dark | light @ max contrast |
|---|---|---|---|
| onSurface / surface | 16.30 | 14.32 | 19.99 |
| onPrimary / primary | 6.49 | 7.75 | 13.89 |
| onPrimaryContainer / primaryContainer | 7.21 | 7.21 | 9.02 |
| onSecondaryContainer / secondaryContainer | 7.25 | 7.25 | 8.97 |

Every text-bearing pair clears AA and nearly all clear AAA, **from an
arbitrary seed**, in both themes. A green seed and Google's default purple
produce near-identical ratios — the guarantee is structural, not tuned.

Against a hand-tuned palette: ours is exactly as accessible as whoever tuned
it was careful, degrades the moment anyone adds a colour, and must be re-tuned
by hand for dark, OLED and high-contrast. This cannot silently regress.

**Caveats, honestly:** the guarantee holds only for `onX`-on-`X` pairs — put
`onSurface` on `primaryContainer` and it is gone. Non-text roles target 3:1,
not 4.5:1. And it covers none of our actual content: Arabic Quranic text,
tajweed colouring, mushaf fidelity are all outside the role system.

### The library

`@material/material-color-utilities`, Apache-2.0, v0.4.0 (Jan 2026),
maintained lumpily — 0.2.7 (2023) → 0.3.0 (2024) → 0.4.0 (2026). Three traps
worth knowing before adopting:

1. **`sourceColorFromImage()` will not work in React Native** — it calls
   `document.createElement('canvas')`. But `QuantizerCelebi.quantize()` +
   `Score.score()` are pure math and run headless; verified against a
   synthetic ARGB array. Decode pixels yourself and feed the array in.
2. **`themeFromSourceColor()` returns the legacy 2021 static scheme**, not a
   `DynamicScheme`. For contrast curves and the newer specs, construct
   `SchemeTonalSpot` and read roles off `MaterialDynamicColors`.
3. **The published 0.4.0 build has 10 extensionless ESM imports** and declares
   `"type": "module"` — it throws `ERR_MODULE_NOT_FOUND` in Node 22. Metro
   will likely resolve it; **Jest will not**. Budget for a moduleNameMapper
   or a patch.

---

## 7. The synthesis nobody else has

`docs/themes-plan.md` §6 spends a whole section hand-building a scrim
calculator: sample the scene's luminance where text sits, solve for the
minimum alpha that clears 4.5:1, bake the numbers into a manifest, gate them
with a test.

**The tonal system does that by construction, and better.** Extract a seed
colour from the chosen scene with `QuantizerCelebi` + `Score`, generate the
tonal palette from it, and every text pairing clears AA automatically — in
light, dark, OLED, and at every system contrast level, for a scene we have
never seen, including a photo the user supplied.

That is Material You where **the "You" is the scene you chose** rather than
your wallpaper. Google seeds from the wallpaper; we would seed from a 1720
Iznik Ka'ba tile, or the Dome of the Rock, or the user's own photograph of
their masjid. It is a better version of Google's own idea, it makes the
themes plan simpler rather than more complex, and it takes none of the springs,
the 48 dp corners, or the FAB.

The app's `PERIOD_TINTS` (seven prayer-period hues) become the *contrast
level* and hue nudge rather than a competing colour source — one source of
hue, not two.

---

## 8. The cheap 80%, if the goal is "feels native on Android"

Because `chrome.ts` centralises every borderless/filled decision across **151
call sites in 43 files**, restoring Android tonal surfaces is roughly **one
file, ~60 lines**: flip `androidDynamicPalette` to set `flatChrome: true` and
derive `bg` / `card` / `border` from the Monet neutrals instead of only the
accent. It is gated behind a toggle users already have ("System colors"),
`theme-scenarios.sh` is the regression harness, and it is revertible in one
commit — which matters, because this exact change was reverted once before.

Add `android_ripple` to the `Pressable` wrapper and Material Symbols for the
14 hand-drawn icons and that is most of the "Google built it" *feeling*, on
Android only, for under 2% of the cost of §3 — without touching iOS, iPad,
Mac, or the design position.

It also makes the marketing site's existing claim honest.

---

## 9. The options

**A — All out MD3/Expressive, both platforms.** 3–5 months, ~20k lines, kills
the iOS identity, orphans iPad and Mac, reverses the design position, and the
Expressive parts cannot be built in React Native anyway. **Not recommended.**

**B — All out on Android, keep Apple on Apple.** Two complete design systems
in an app whose current strength is having one. This is the Al-Azan trade
without the compensation of going native — they at least got Compose out of
it. **Not recommended.**

**C — Take the tonal engine, not the look. ← recommended.**
1. Adopt `material-color-utilities` as the palette *generator* behind the
   existing `AppPalette` shape — same 17 fields, computed rather than
   hand-tuned, with the contrast guarantee underneath.
2. Seed it from the chosen scene (§7), which replaces `themes-plan.md` §6's
   hand-rolled scrim maths with something stronger.
3. Ship the cheap Android fidelity from §8 behind the toggle that already
   exists.
4. Leave the components, the type scale, the navigation, the motion and iOS
   exactly where they are.

Cost: roughly 2–3 weeks, mostly in `appPalette.ts` and `tokens.ts`, none of it
visible as a redesign. Reversible.

**D — Nothing.** Fix the two drift items in §2 (the stale `flatChrome`
docstring, and either soften the marketing claim or ship §8 to make it true)
and carry on with the themes plan as written. Legitimate, and cheap.

---

## 10. What would change this

- **Mihrab drops iOS.** Then A becomes reasonable — and the honest version of
  A is Al-Azan's: leave React Native for Compose, where Material is actually
  implemented. Half-Material in RN is the worst of both.
- **`react-native-paper` v6 ships the Expressive component set.** Today it has
  the tokens and springs but the v5 components, and the maintainers have never
  publicly committed to Expressive — [discussion
  #4744](https://github.com/callstack/react-native-paper/discussions/4744) has
  six upvotes and zero replies since May 2025. If that changes, B gets
  cheaper.
- **The tonal engine can't reproduce the current look closely enough.** Then
  C degrades to "use it for contrast verification in tests only" — still worth
  having, since it is the same maths `featureModulesPart2.test.ts` does by
  hand.
- **Users ask for it.** Nothing in the reviews or issues has, so far. Worth
  checking before spending a quarter on it.

---

## Related

- `docs/themes-plan.md` — §6 is the hand-built version of what §7 above
  replaces.
- `docs/design/principles.md` — §4 is the position an Expressive adoption
  would reverse.
- `src/theme/appPalette.ts:359` — where the fuller Material experiment was
  already tried and reverted.
