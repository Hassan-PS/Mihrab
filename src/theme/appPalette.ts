import type { ColorSchemeName, ColorValue } from 'react-native';
import {
  DynamicColorIOS,
  Platform,
  PlatformColor,
} from 'react-native';
import { getResolvedAccentHex } from '../native/SystemTheme';
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
   * Both are opt-in via the same toggle and only apply under the "System"
   * appearance (so an explicit Light/Dark choice still uses brand accents).
   */
  return (
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    (appearance ?? 'system') === 'system' &&
    !!useSystemDynamicTheme
  );
}

// accentSolid, like accent/accentBg, is layered on by withBrandAccents() — so
// the base palette objects below don't (and shouldn't) declare it.
type PaletteBase = Omit<AppPalette, 'accent' | 'accentBg' | 'accentSolid'>;

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
 * Resolve the accent triple for the chosen app-accent id.
 *
 * For 'custom', the user-typed hex is the accent; we derive a softly
 * tinted background by mixing the hex with white (light mode) or black
 * (dark mode). For the named ids, we use the static swatch table.
 */
function brandAccents(
  isDark: boolean,
  accentId: AppAccentId,
  customHex: string,
): { accent: ColorValue; accentBg: ColorValue; accentSolid: string } {
  if (accentId === 'custom') {
    const valid = /^#[0-9a-fA-F]{6}$/.test(customHex.trim());
    const hex = valid ? customHex.trim() : '#22c55e';
    const accentBg = isDark ? shiftHex(hex, -0.7) : shiftHex(hex, 0.82);
    return { accent: hex, accentBg, accentSolid: hex };
  }
  const sw = ACCENT_SWATCHES[accentId] ?? ACCENT_SWATCHES.green;
  if (isDark) {
    return { accent: sw.dark, accentBg: sw.darkBg, accentSolid: sw.dark };
  }
  return { accent: sw.light, accentBg: sw.lightBg, accentSolid: sw.light };
}

function withBrandAccents(
  base: PaletteBase,
  isDark: boolean,
  accentId: AppAccentId,
  customHex: string,
): AppPalette {
  const { accent, accentBg, accentSolid } = brandAccents(
    isDark,
    accentId,
    customHex,
  );
  return { ...base, accent, accentBg, accentSolid };
}

/**
 * Standard dark theme — warm "ink-blue" night (task #36).
 *
 * Migrated off the old cold blue-greys (#0f1419/#1a2230) to the deeper,
 * slightly warmer ink tones the design tokens (`tokens.ts`) always intended.
 * Reads as reverent and quiet; the emerald accent does the colour work.
 */
const DARK_BASE: PaletteBase = {
  bg: '#0E1218',
  card: '#161B23',
  text: '#E8E5DE',
  muted: '#8A8780',
  border: '#1F2530',
  danger: '#F87171',
  overlay: 'rgba(0,0,0,0.6)',
  flatChrome: false,
  glass: false,
};

const DARK_PURE_BLACK_BASE: PaletteBase = {
  bg: '#000000',
  card: '#0E1218',
  text: '#E8E5DE',
  muted: '#8A8780',
  border: '#171C24',
  danger: '#F87171',
  overlay: 'rgba(0,0,0,0.75)',
  flatChrome: false,
  glass: false,
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
  card: '#FFFFFF',
  text: '#1A1814',
  muted: '#6B6660',
  border: '#EDE8DF',
  danger: '#B91C1C',
  overlay: 'rgba(26,24,20,0.45)',
  flatChrome: false,
  glass: false,
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
    // iOS systemBlue is the typical tintColor when no override; matches
    // the live PlatformColor tint closely enough for SVG icons.
    accentSolid: isDark ? '#0A84FF' : '#007AFF',
  };
}

function androidDynamicPalette(
  isDark: boolean,
  pureBlackDark: boolean,
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
  return { ...base, accent: hex, accentBg, accentSolid: hex };
}

function buildDynamicSystemPalette(
  isDark: boolean,
  pureBlackDark: boolean,
): AppPalette {
  if (Platform.OS === 'ios') {
    return iosDynamicPalette(isDark, pureBlackDark);
  }
  if (Platform.OS === 'android') {
    return androidDynamicPalette(isDark, pureBlackDark);
  }
  return buildAppPalette(isDark, pureBlackDark, 'green', '#22c55e');
}

export function buildAppPalette(
  isDark: boolean,
  pureBlackDark: boolean,
  accentId: AppAccentId,
  accentCustomHex: string,
): AppPalette {
  if (!isDark) {
    return withBrandAccents(LIGHT_BASE, false, accentId, accentCustomHex);
  }
  return withBrandAccents(
    pureBlackDark ? DARK_PURE_BLACK_BASE : DARK_BASE,
    true,
    accentId,
    accentCustomHex,
  );
}

export function resolveAppPalette(input: {
  appearance: AppearancePreference;
  useSystemDynamicTheme: boolean;
  systemScheme: ColorSchemeName | null | undefined;
  pureBlackDark: boolean;
  appAccentId: AppAccentId;
  appAccentCustomHex: string;
}): AppPalette {
  const isDark = resolveEffectiveDark(input.appearance, input.systemScheme);
  if (shouldUseDynamicSystemColors(input.appearance, input.useSystemDynamicTheme)) {
    return buildDynamicSystemPalette(isDark, input.pureBlackDark);
  }
  return buildAppPalette(
    isDark,
    input.pureBlackDark,
    input.appAccentId,
    input.appAccentCustomHex,
  );
}
