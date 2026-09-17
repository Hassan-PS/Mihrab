import type { ColorSchemeName, ColorValue } from 'react-native';
import {
  DynamicColorIOS,
  Platform,
  PlatformColor,
} from 'react-native';
import { getResolvedAccentHex } from '../native/SystemTheme';
import { legibleAccent } from '../settings/accentColors';
import { hexToOklch, oklchToHex } from './oklch';
import type { AppAccentId, AppearancePreference } from '../settings/types';

export type AppPalette = {
  bg: ColorValue;
  card: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  accent: ColorValue;
  accentBg: ColorValue;
  danger: ColorValue;
  overlay: ColorValue;
  /**
   * System dynamic theme: stronger layered backgrounds, no box borders;
   * segments use filled selection instead of accent outlines.
   */
  flatChrome: boolean;
  /**
   * iOS "Liquid Glass" mode — surfaces should render as translucent blurred
   * material (via GlassSurface / BlurView) instead of a solid `card` colour.
   * Only true on iOS under the system (Liquid Glass) palette.
   */
  glass: boolean;
  /**
   * Solid hex string version of the accent color — task #104.
   *
   * `accent` itself can be a PlatformColor / DynamicColorIOS object so
   * RN can resolve native theme attributes. SVG icons (react-native-svg)
   * can't always consume those non-string `ColorValue`s as fills/strokes,
   * which is why icons disappear under Material You. `accentSolid` is a
   * plain "#RRGGBB" string that callers can hand directly to icon
   * components.
   */
  accentSolid: string;
  /**
   * Solid hex version of `muted`, for the same reason `accentSolid` exists.
   *
   * Under Liquid Glass `muted` is `PlatformColor('secondaryLabel')`, and an
   * SVG cannot consume one: hand it to a `react-native-svg` fill and the
   * icon draws NOTHING. That is what emptied the tab bar — five labelled
   * tabs with no glyphs above them, the sixth (active, on `accentSolid`)
   * the only one that showed. Anything that colours a drawn icon takes
   * this; text and native views can keep the semantic colour.
   */
  mutedSolid: string;
  /**
   * `text`, as a colour an SVG can parse — the same bargain as
   * `mutedSolid`, for the drawn icons that carry the app's text colour
   * rather than its muted one. Under Liquid Glass `text` is
   * `PlatformColor('label')`, and a `react-native-svg` stroke given one
   * draws nothing at all: the header's back arrow simply would not be
   * there. Text and native views keep the semantic colour.
   */
  textSolid: string;
  /**
   * Filled control surface — the design review's one caveat (2f).
   *
   * Chips, steppers and secondary row actions are FILLED, not outlined: a
   * selected chip used to carry a tinted background AND a coloured border
   * AND coloured text — three signals for one bit — and
   * `StyleSheet.hairlineWidth` borders disappear outright at some Android
   * densities. A fill never does. Two tokens, defined once here, so the
   * pair does not get re-derived in six files.
   */
  controlBg: ColorValue;
  /** Text/glyph colour that sits on `accentSolid` (a filled control). */
  onAccent: string;
  /**
   * Effective dark-mode flag baked into the palette so style helpers
   * (e.g. `cardEdgeStyle`'s light-only shadow) can branch without every
   * caller threading `isDark` through separately.
   */
  isDark: boolean;
  /**
   * Verdant theme mode (storage key `tintedSurfaces`) — Appearance →
   * "Verdant". A curated theme built from the chosen preset accent, with
   * distinct light / dark surface profiles (not a faint wash of parchment).
   * Custom hex is barred; the six presets remain. Mutually exclusive with
   * system dynamic colours. When OFF, every accent-surface token collapses
   * to its neutral counterpart.
   *
   * The drawn time-of-day hero (`HeroSky`) is deliberately NOT driven by
   * this — it is a clock, not a theme — so its own colours never route
   * through these tokens.
   */
  tintedSurfaces: boolean;
  /**
   * A calm accent wash for a chrome band (per-tab header strip, grouped
   * surface). Equals `bg` when `tintedSurfaces` is off.
   */
  accentSurface: ColorValue;
  /**
   * A stronger accent wash for the app's structural chrome (tab bar band).
   * Equals `card` when `tintedSurfaces` is off.
   */
  accentSurfaceStrong: ColorValue;
  /**
   * Text/glyph colour that reads on `accentSurface` / `accentSurfaceStrong`.
   * The washes stay close to `bg`, so this is `text` — exposed as a token so
   * a caller does not have to know that. `textSolid`-safe (a plain hex).
   */
  onAccentSurface: string;
  /** A divider on a tinted surface. Equals `border` when the mode is off. */
  accentHairline: ColorValue;
};

export function resolveEffectiveDark(
  appearance: AppearancePreference | undefined,
  systemScheme: ColorSchemeName | null | undefined,
): boolean {
  const mode = appearance ?? 'system';
  if (mode === 'light') {
    return false;
  }
  if (mode === 'dark') {
    return true;
  }
  return systemScheme === 'dark';
}

export function shouldUseDynamicSystemColors(
  appearance: AppearancePreference | undefined,
  useSystemDynamicTheme: boolean | undefined,
): boolean {
  /**
   * System-driven palette:
   *  • Android → Material You dynamic colours (wallpaper-derived).
   *  • iOS     → "Liquid Glass": native semantic system colours + the
   *    translucent blurred chrome iOS provides, so the app reads as part of
   *    the OS and adapts to light/dark automatically.
   * Both are opt-in via the same toggle, and it applies under ANY
   * appearance. It used to be answerable only under "System", on the
   * reasoning that there is nothing dynamic to follow once Light or Dark
   * is pinned — which confused two different things. What the appearance
   * preference pins is WHICH MODE is drawn; where the colours come from
   * is this toggle's business. Somebody who keeps the app dark all day
   * has no way to say "dark, in my wallpaper's colours", and that is a
   * reasonable thing to want. `buildDynamicSystemPalette` takes `isDark`
   * from the resolved mode either way, so pinning one simply stops that
   * mode tracking the OS — the palette is still the system's.
   *
   * `appearance` stays in the signature: callers pass it, and it is what
   * a future rule about a particular mode would key on.
   */
  void appearance;
  return (
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    !!useSystemDynamicTheme
  );
}

// accentSolid, like accent/accentBg, is layered on by withBrandAccents() — so
// the base palette objects below don't (and shouldn't) declare it.
type PaletteBase = Omit<
  AppPalette,
  | 'accent'
  | 'accentBg'
  | 'accentSolid'
  | 'mutedSolid'
  | 'textSolid'
  | 'isDark'
  | 'onAccent'
  // Layered on by withBrandAccents / the dynamic palettes (from the accent
  // and the tintedSurfaces flag), so the base surface objects don't state
  // them.
  | 'tintedSurfaces'
  | 'accentSurface'
  | 'accentSurfaceStrong'
  | 'onAccentSurface'
  | 'accentHairline'
>;

/**
 * Hex swatches for each selectable app accent — task #127.
 *
 * Each id gives a (light, dark, lightBg, darkBg) tuple so the accent
 * stays readable in both modes (saturated swatch on the light card,
 * brighter swatch on the dark card; backgrounds are tinted to match).
 *
 * 'green' is the historical brand accent; the rest are the same swatches
 * the widget already exposed so users get visual parity between the app
 * and widget when they pick a color.
 */
const ACCENT_SWATCHES: Record<
  Exclude<AppAccentId, 'custom'>,
  { light: string; dark: string; lightBg: string; darkBg: string }
> = {
  // Reverent deep/lifted emerald (task #36) — replaces the old neon tailwind
  // green. `light` is a deep emerald that reads as ink on warm paper; `dark`
  // is a lifted emerald tuned to ~5.9:1 on the ink-blue bg so small accent
  // text stays legible. Backgrounds are soft, low-saturation tints used only
  // for gentle highlights (active row, countdown chip) — never a full block.
  green: { light: '#1F5F4A', dark: '#46A081', lightBg: '#E2EEE9', darkBg: '#152F25' },
  teal: { light: '#0d9488', dark: '#5eead4', lightBg: '#ccfbf1', darkBg: '#134e4a' },
  blue: { light: '#2563eb', dark: '#7dd3fc', lightBg: '#dbeafe', darkBg: '#0c2a52' },
  amber: { light: '#b45309', dark: '#fbbf24', lightBg: '#fef3c7', darkBg: '#3f2a05' },
  // Task: look-and-feel upgrade — two quieter jewel tones rounding out the
  // picker. Both tuned like the emerald: deep ink-like in light mode,
  // lifted (≥4.5:1 on ink-blue) in dark mode, with soft low-sat tints.
  rose: { light: '#9F2D4D', dark: '#E58FA6', lightBg: '#F7E3E9', darkBg: '#3A1622' },
  violet: { light: '#5B4B9E', dark: '#B4A6E8', lightBg: '#E9E4F6', darkBg: '#241D40' },
};

/**
 * Lighten/darken a #RRGGBB hex by a percentage — used to derive a
 * tinted background from a custom accent. Positive `amount` lightens
 * (toward #fff), negative darkens (toward #000). Returns a #RRGGBB.
 */
function shiftHex(hex: string, amount: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  r = Math.round(r + (target - r) * k);
  g = Math.round(g + (target - g) * k);
  b = Math.round(b + (target - b) * k);
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  );
}

/**
 * Verdant — a tonal theme for DARK mode; light mode is the release look.
 *
 * ── WHY LIGHT IS LEFT ALONE ─────────────────────────────────────────────
 *
 * Every light version of a tinted page was tried — a whisper, pronounced,
 * tinted paper, vibrant — and none of them was the app. A light page that
 * carries the accent reads as pastel, mint or a slab; the app's light
 * identity is warm parchment with the accent as ink and as a few soft
 * highlights (`accentBg`), which is exactly what the shipped release does.
 * So under Verdant, light surfaces collapse to their neutral counterparts
 * and the accent keeps doing what it always did. The toggle still holds
 * (the flag is true, native hints still route), it simply has no surface
 * work to do until the sun goes down.
 *
 * ── DARK: A TONAL LADDER IN OKLCH ───────────────────────────────────────
 *
 * A deep tinted ground reads as coloured night ink, which IS in character.
 * The ladder lifts toward light — bg → chrome → card → controlBg → strong
 * → border — one hue (the accent's own, held by OKLCH so RGB mixing cannot
 * drift it), chroma rising with lift, the accent the most saturated thing
 * on screen, and `controlBg` under the AA ceiling for muted ink (#95918A
 * needs ≲ L 0.29). One formula for all six presets, no per-accent table.
 * `__tests__/tintedSurfaces.test.ts` pins the ladder, the hierarchy, the
 * contrast floors and the light collapse.
 */
type Tone = { L: number; C: number };
type SurfaceTones = {
  bg: Tone;
  card: Tone;
  controlBg: Tone;
  border: Tone;
  accentSurface: Tone;
  accentSurfaceStrong: Tone;
  accentHairline: Tone;
};

const DARK_TONES: SurfaceTones = {
  bg: { L: 0.19, C: 0.035 },
  accentSurface: { L: 0.225, C: 0.045 },
  card: { L: 0.235, C: 0.04 },
  controlBg: { L: 0.265, C: 0.045 },
  accentSurfaceStrong: { L: 0.3, C: 0.065 },
  border: { L: 0.34, C: 0.05 },
  accentHairline: { L: 0.46, C: 0.09 },
};

/**
 * The OKLCH hue Verdant paints its dark surfaces in: the accent's own, as
 * shown in dark. Exported so the test pins it rather than guessing.
 */
export function verdantTintHue(accentId: AppAccentId, isDark: boolean): number {
  const sw =
    ACCENT_SWATCHES[accentId === 'custom' ? 'green' : accentId] ??
    ACCENT_SWATCHES.green;
  return hexToOklch(isDark ? sw.dark : sw.light).h;
}

/**
 * How far OLED elevates sink toward black, as a lightness factor. On a
 * pure-black page a card at the mid-dark tone floats like a lit slab;
 * scaling its lightness keeps the hue and the lift while sitting it back
 * on the page.
 */
const OLED_SINK = 0.78;

/**
 * The surface fields + the four accent-surface tokens for Verdant
 * (`tintedSurfaces`). Dark: the tone ladder above. Light, mode off, or a
 * non-hex base (iOS Liquid Glass `PlatformColor`s): every token collapses
 * to its neutral counterpart, so callers can reference the accent-surface
 * tokens unconditionally. Custom hex never reaches here (coerced to green
 * upstream); the guard is belt and braces.
 */
function tintedSurfaceFields(
  base: PaletteBase,
  tintedSurfaces: boolean,
  accentId: AppAccentId,
  isDark: boolean,
): {
  bg: ColorValue;
  card: ColorValue;
  controlBg: ColorValue;
  border: ColorValue;
  accentSurface: ColorValue;
  accentSurfaceStrong: ColorValue;
  accentHairline: ColorValue;
} {
  const bgHex = typeof base.bg === 'string' ? base.bg : null;

  if (!tintedSurfaces || bgHex == null || !isDark) {
    return {
      bg: base.bg,
      card: base.card,
      controlBg: base.controlBg,
      border: base.border,
      accentSurface: base.bg,
      accentSurfaceStrong: base.card,
      accentHairline: base.border,
    };
  }

  return darkTonalSurfaces(base, verdantTintHue(accentId, true));
}

/** The seven surface tokens the dark ladder produces. */
type DarkSurfaces = {
  bg: ColorValue;
  card: ColorValue;
  controlBg: ColorValue;
  border: ColorValue;
  accentSurface: ColorValue;
  accentSurfaceStrong: ColorValue;
  accentHairline: ColorValue;
};

/**
 * The dark tonal ladder, painted in one OKLCH hue.
 *
 * Shared by the two things that theme dark mode: Verdant (hue from the
 * chosen preset) and system colours (hue from the live Material You
 * accent), so a wallpaper colour is pronounced on every surface exactly
 * the way a chosen accent is. `base` supplies the OLED decision: a
 * pure-black base keeps `bg` at absolute black and sinks every elevate.
 */
export function darkTonalSurfaces(base: PaletteBase, h: number): DarkSurfaces {
  const bgHex = typeof base.bg === 'string' ? base.bg : '#000000';
  const pureBlack = bgHex.toLowerCase() === '#000000';
  const tone = (t: Tone, sinks: boolean): string =>
    oklchToHex({ L: pureBlack && sinks ? t.L * OLED_SINK : t.L, C: t.C, h });

  return {
    // OLED keeps absolute black for the page; every elevate sinks one step.
    bg: pureBlack ? '#000000' : tone(DARK_TONES.bg, false),
    card: tone(DARK_TONES.card, true),
    controlBg: tone(DARK_TONES.controlBg, true),
    border: tone(DARK_TONES.border, true),
    accentSurface: tone(DARK_TONES.accentSurface, true),
    accentSurfaceStrong: tone(DARK_TONES.accentSurfaceStrong, true),
    accentHairline: tone(DARK_TONES.accentHairline, true),
  };
}

/**
 * Resolve the accent triple for the chosen app-accent id.
 *
 * For 'custom', the user-typed hex is the accent; we derive a softly
 * tinted background by mixing the hex with white (light mode) or black
 * (dark mode). For the named ids, we use the static swatch table.
 *
 * The custom hex is held to the same contrast floor the picker offers,
 * against `ground` — the background it will actually sit on. The picker
 * cannot hand back an unusable colour, but a hex can reach here without
 * passing through it: saved before the rule existed, restored from a
 * backup or another device, or chosen in the dark theme and read in the
 * light one. See `legibleAccent`.
 */
function brandAccents(
  isDark: boolean,
  accentId: AppAccentId,
  customHex: string,
  ground: string,
): { accent: ColorValue; accentBg: ColorValue; accentSolid: string } {
  if (accentId === 'custom') {
    const hex = legibleAccent(customHex, ground);
    const accentBg = isDark ? shiftHex(hex, -0.7) : shiftHex(hex, 0.82);
    return { accent: hex, accentBg, accentSolid: hex };
  }
  const sw = ACCENT_SWATCHES[accentId] ?? ACCENT_SWATCHES.green;
  if (isDark) {
    return { accent: sw.dark, accentBg: sw.darkBg, accentSolid: sw.dark };
  }
  return { accent: sw.light, accentBg: sw.lightBg, accentSolid: sw.light };
}

/**
 * Black or white, whichever the eye can actually read on a filled control.
 *
 * Every accent but amber is dark enough for white; amber (#b45309 light,
 * #fbbf24 dark) is not, and a Material You wallpaper accent can be any
 * lightness at all — so this is computed, not assumed. sRGB relative
 * luminance, the same rule WCAG contrast uses.
 */
export function readableOn(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  // 0.45 rather than the midpoint: white-on-mid-tone reads better than
  // black-on-mid-tone at the small weights these controls use.
  return luminance > 0.45 ? '#1A1814' : '#FFFFFF';
}

function withBrandAccents(
  base: PaletteBase,
  isDark: boolean,
  accentId: AppAccentId,
  customHex: string,
  tintedSurfaces: boolean,
): AppPalette {
  // Verdant bars custom hex (absurd free-form washes); the six presets stay.
  const effectiveAccentId: AppAccentId =
    tintedSurfaces && accentId === 'custom' ? 'green' : accentId;
  const { accent, accentBg, accentSolid } = brandAccents(
    isDark,
    effectiveAccentId,
    customHex,
    // The ground the accent will be read against. Every base on this path
    // states it as a hex; the one that does not is the dynamic-colour
    // palette, which never reaches here and has no custom accent to hold
    // to anything.
    typeof base.bg === 'string' ? base.bg : isDark ? '#141210' : '#FAF7F2',
  );
  const surfaces = tintedSurfaceFields(
    base,
    tintedSurfaces,
    effectiveAccentId,
    isDark,
  );
  return {
    ...base,
    ...surfaces,
    accent,
    accentBg,
    accentSolid,
    // Every base palette below states `muted` as a hex string; only the two
    // system palettes need a separate answer, and they give their own.
    mutedSolid: String(base.muted),
    textSolid: String(base.text),
    isDark,
    onAccent: readableOn(accentSolid),
    tintedSurfaces,
    onAccentSurface: String(base.text),
  };
}

/**
 * Standard dark theme — warm "ink-blue" night (task #36).
 *
 * Migrated off the old cold blue-greys (#0f1419/#1a2230) to the deeper,
 * slightly warmer ink tones the design tokens (`tokens.ts`) always intended.
 * Reads as reverent and quiet; the emerald accent does the colour work.
 */
/**
 * Standard dark theme — ink on dark parchment.
 *
 * ── WHY THESE ARE NO LONGER BLUE ──────────────────────────────────────
 *
 * They were: bg #0E1218, card #161B23, border #1F2530 — cool by 10, 13
 * and 17 points of red-minus-blue. The ink on top of them was, and still
 * is, warm by 10 (#E8E5DE, #8A8780). So the one theme in the app whose
 * ground and ink disagreed about temperature was this one: ivory text on
 * slate, which is what made it read slightly dingy beside the light
 * theme's warm paper.
 *
 * Warmed to agree, at the same lightness — every value here is within a
 * point of the lightness it replaced, so nothing about the elevation
 * ladder or the contrast ratios moved (text/bg 14.93 → 14.86, muted/bg
 * 5.24 → 5.21). The card's lift over the ground is (9, 8, 7) instead of
 * (8, 9, 11), which is the other half of the fix: the lift itself used
 * to tilt blue.
 *
 * The identity this lands on is the one the light theme already had and
 * the one the app's name argues for — ink on parchment, at night.
 */
const DARK_BASE: PaletteBase = {
  bg: '#141210',
  card: '#1D1A17',
  text: '#E8E5DE',
  // #8A8780 until 2026-09-12, where it read 4.29:1 on the old controlBg
  // and 4.19:1 on the warmed one — a WCAG AA miss for normal text that
  // predates the warming and was never caught, because the contrast test
  // in themeMap.ts checks `contentSecondary` against the GROUND and never
  // against a control's own background. Lifted rather than darkening
  // controlBg: one value fixes muted on bg, on card and on a control at
  // once, where chasing it down the elevation ladder would have left the
  // control indistinguishable from the card it sits on (1.05:1).
  // 4.79:1 on controlBg now, and still 2.49:1 below `text`, so muted
  // still reads as muted.
  muted: '#95918A',
  border: '#2A2622',
  danger: '#F87171',
  overlay: 'rgba(0,0,0,0.6)',
  flatChrome: false,
  glass: false,
  controlBg: '#2A2622',
};

/**
 * OLED variant — true black ground, everything above it warmed with
 * DARK_BASE so the two dark themes do not disagree about temperature.
 * `bg` alone stays absolute: that is the whole point of the setting, and
 * a tinted black is not black.
 */
const DARK_PURE_BLACK_BASE: PaletteBase = {
  bg: '#000000',
  card: '#141210',
  text: '#E8E5DE',
  muted: '#95918A',
  border: '#211D19',
  danger: '#F87171',
  overlay: 'rgba(0,0,0,0.75)',
  flatChrome: false,
  glass: false,
  controlBg: '#211D19',
};

/**
 * Standard light theme — warm "paper" daylight (task #36).
 *
 * Warm off-white paper instead of the old cool grey (#f5f6f8); ink-brown
 * text instead of flat near-black; warm grey dividers. The deep emerald
 * accent reads as ink on this surface.
 */
const LIGHT_BASE: PaletteBase = {
  bg: '#FAF7F2',
  // Not #FFFFFF. Every other value in this theme is warm — the ground by
  // 8 points of red-minus-blue, the ink by 6, the divider by 14 — and a
  // pure-white card was the one neutral surface among them, which made
  // the warm page beside it read dingy rather than making the card read
  // clean. Worse, the lift over the ground was (5, 8, 13): the lift
  // ITSELF tilted blue. At #FFFDF9 it is (5, 6, 7), even, and the card
  // still sits a clear step above the page.
  card: '#FFFDF9',
  text: '#1A1814',
  muted: '#6B6660',
  border: '#EDE8DF',
  danger: '#B91C1C',
  overlay: 'rgba(26,24,20,0.45)',
  flatChrome: false,
  glass: false,
  controlBg: '#F4F0E9',
};

function iosDynamicPalette(isDark: boolean, pureBlackDark: boolean): AppPalette {
  const oled = pureBlackDark && isDark;
  return {
    bg: oled ? '#000000' : PlatformColor('systemGroupedBackground'),
    card: oled ? '#0d0d0d' : PlatformColor('secondarySystemGroupedBackground'),
    text: PlatformColor('label'),
    muted: PlatformColor('secondaryLabel'),
    border: 'transparent',
    // systemBlue is the iOS default tint and always resolves (PlatformColor
    // 'tintColor' is nil without an app-wide UIView tint, which made accent-
    // coloured text render invisible). It adapts to light/dark automatically.
    accent: PlatformColor('systemBlue'),
    accentBg: PlatformColor('tertiarySystemGroupedBackground'),
    danger: PlatformColor('systemRed'),
    overlay: DynamicColorIOS({
      light: 'rgba(0,0,0,0.4)',
      dark: 'rgba(0,0,0,0.65)',
      highContrastLight: 'rgba(0,0,0,0.5)',
      highContrastDark: 'rgba(0,0,0,0.75)',
    }),
    flatChrome: true,
    glass: true,
    isDark,
    // Tinted surfaces is a brand-theme choice; under Liquid Glass the base
    // surfaces are live `PlatformColor`s that cannot be mixed, so the mode
    // is a no-op here and every accent-surface token is its neutral twin.
    tintedSurfaces: false,
    accentSurface: oled ? '#000000' : PlatformColor('systemGroupedBackground'),
    accentSurfaceStrong: oled
      ? '#0d0d0d'
      : PlatformColor('secondarySystemGroupedBackground'),
    accentHairline: 'transparent',
    onAccentSurface: isDark ? '#FFFFFF' : '#000000',
    // Filled controls follow the system's grouped-surface hierarchy here,
    // so they still read as controls under Liquid Glass.
    controlBg: PlatformColor('tertiarySystemGroupedBackground'),
    onAccent: '#FFFFFF',
    // iOS systemBlue is the typical tintColor when no override; matches
    // the live PlatformColor tint closely enough for SVG icons.
    accentSolid: isDark ? '#0A84FF' : '#007AFF',
    /**
     * `secondaryLabel`, resolved. iOS states it as label black/white at
     * 60%, which is a colour a native view can composite and an SVG
     * cannot — see `mutedSolid`. These are the two composites over the
     * grouped backgrounds this palette actually draws on.
     */
    mutedSolid: isDark ? '#98989E' : '#8A8A8E',
    /** `label`, resolved: iOS states it as pure white on black. */
    textSolid: isDark ? '#FFFFFF' : '#000000',
  };
}

function androidDynamicPalette(
  isDark: boolean,
  pureBlackDark: boolean,
  tintedSurfaces: boolean,
): AppPalette {
  // System colours on Android keep the STANDARD theme's design (surfaces,
  // text, dividers, bordered chrome) and ONLY recolour the accent to the
  // live Material You wallpaper colour. Previously this swapped the whole
  // Material 3 tonal surface hierarchy, which changed the app's look far more
  // than the user wants — now it's an accent-only override.
  const base = isDark
    ? pureBlackDark
      ? DARK_PURE_BLACK_BASE
      : DARK_BASE
    : LIGHT_BASE;
  // Live system primary as a hex (SVG icons can't consume PlatformColor, and
  // the rest of the standard palette is hex too). Falls back to the Material 3
  // baseline if the native bridge is unavailable.
  const hex = getResolvedAccentHex() ?? (isDark ? '#D0BCFF' : '#6750A4');
  // Soft tinted accent background, matching how the standard 'custom' accent
  // derives its highlight (light: mix toward white, dark: toward black).
  const accentBg = isDark ? shiftHex(hex, -0.7) : shiftHex(hex, 0.82);
  // Dark mode takes the same tonal ladder Verdant paints, in the live
  // wallpaper hue — so system colours are pronounced on every surface, not
  // only on the accent. Light stays the standard theme's surfaces (the
  // release look), exactly as Verdant does in light.
  const surfaces = isDark
    ? darkTonalSurfaces(base, hexToOklch(hex).h)
    : tintedSurfaceFields(base, false, 'green', false);
  return {
    ...base,
    ...surfaces,
    accent: hex,
    accentBg,
    accentSolid: hex,
    // The standard base's muted, which is already a hex string — this
    // palette overrides the accent and nothing else.
    mutedSolid: String(base.muted),
    textSolid: String(base.text),
    isDark,
    onAccent: readableOn(hex),
    // Truthful: dark surfaces ARE tinted here, and `mushafTone` reads this
    // to follow them.
    tintedSurfaces: tintedSurfaces || isDark,
    onAccentSurface: String(base.text),
  };
}

function buildDynamicSystemPalette(
  isDark: boolean,
  pureBlackDark: boolean,
  tintedSurfaces: boolean,
): AppPalette {
  if (Platform.OS === 'ios') {
    return iosDynamicPalette(isDark, pureBlackDark);
  }
  if (Platform.OS === 'android') {
    return androidDynamicPalette(isDark, pureBlackDark, tintedSurfaces);
  }
  return buildAppPalette(isDark, pureBlackDark, 'green', '#22c55e', tintedSurfaces);
}

export function buildAppPalette(
  isDark: boolean,
  pureBlackDark: boolean,
  accentId: AppAccentId,
  accentCustomHex: string,
  tintedSurfaces: boolean = false,
): AppPalette {
  if (!isDark) {
    return withBrandAccents(
      LIGHT_BASE,
      false,
      accentId,
      accentCustomHex,
      tintedSurfaces,
    );
  }
  return withBrandAccents(
    pureBlackDark ? DARK_PURE_BLACK_BASE : DARK_BASE,
    true,
    accentId,
    accentCustomHex,
    tintedSurfaces,
  );
}

/**
 * The selected theme — Verdant, system colours, or classic with its accent
 * — rendered for a GIVEN mode, whatever mode the app itself is in.
 *
 * For chrome that belongs to something with its own light and dark: the
 * mushaf page. Its night tone is dark while the app may be in light, and
 * chrome drawn on it must take the theme's DARK colours — the lifted
 * accent, the dark tonal surfaces — not the app's current ones, or a deep
 * light-mode accent lands on a dark page and vanishes. Everything else
 * about which theme is in use is decided exactly as `resolveAppPalette`
 * decides it.
 */
export function resolveThemePaletteForMode(
  input: {
    appearance: AppearancePreference;
    useSystemDynamicTheme: boolean;
    pureBlackDark: boolean;
    appAccentId: AppAccentId;
    appAccentCustomHex: string;
    tintedSurfaces?: boolean;
  },
  isDark: boolean,
): AppPalette {
  if (shouldUseDynamicSystemColors(input.appearance, input.useSystemDynamicTheme)) {
    return buildDynamicSystemPalette(isDark, input.pureBlackDark, false);
  }
  return buildAppPalette(
    isDark,
    input.pureBlackDark,
    input.appAccentId,
    input.appAccentCustomHex,
    input.tintedSurfaces ?? false,
  );
}

export function resolveAppPalette(input: {
  appearance: AppearancePreference;
  useSystemDynamicTheme: boolean;
  systemScheme: ColorSchemeName | null | undefined;
  pureBlackDark: boolean;
  appAccentId: AppAccentId;
  appAccentCustomHex: string;
  tintedSurfaces?: boolean;
}): AppPalette {
  const isDark = resolveEffectiveDark(input.appearance, input.systemScheme);
  // System colours win: Verdant is a brand theme and cannot share the
  // palette with Material You / Liquid Glass. The Appearance card also
  // clears the flag when dynamic colours turn on; this gate covers a
  // storage state that somehow still holds both.
  if (shouldUseDynamicSystemColors(input.appearance, input.useSystemDynamicTheme)) {
    return buildDynamicSystemPalette(isDark, input.pureBlackDark, false);
  }
  const tintedSurfaces = input.tintedSurfaces ?? false;
  return buildAppPalette(
    isDark,
    input.pureBlackDark,
    input.appAccentId,
    input.appAccentCustomHex,
    tintedSurfaces,
  );
}
