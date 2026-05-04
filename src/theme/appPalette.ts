import type { ColorSchemeName, ColorValue } from 'react-native';
import {
  DynamicColorIOS,
  Platform,
  PlatformColor,
} from 'react-native';
import { getResolvedAccentHex } from '../native/SystemTheme';
import type { AppearancePreference } from '../settings/types';

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
  /** Material You / dynamic palette — Android only; iOS uses brand accents with System theme. */
  return (
    Platform.OS === 'android' &&
    (appearance ?? 'system') === 'system' &&
    !!useSystemDynamicTheme
  );
}

type PaletteBase = Omit<AppPalette, 'accent' | 'accentBg'>;

/** App brand green when System theme + dynamic colors is off, or when appearance is forced light/dark. */
function brandAccents(isDark: boolean): { accent: ColorValue; accentBg: ColorValue; accentSolid: string } {
  if (isDark) {
    return { accent: '#4ade80', accentBg: '#14532d', accentSolid: '#4ade80' };
  }
  return { accent: '#22c55e', accentBg: '#dcfce7', accentSolid: '#22c55e' };
}

function withBrandAccents(base: PaletteBase, isDark: boolean): AppPalette {
  const { accent, accentBg, accentSolid } = brandAccents(isDark);
  return { ...base, accent, accentBg, accentSolid };
}

/** Standard dark greys. Accent uses brand green unless dynamic system palette is active. */
const DARK_BASE: PaletteBase = {
  bg: '#0f1419',
  card: '#1a2230',
  text: '#e8ecf1',
  muted: '#8b95a5',
  border: '#2a3444',
  danger: '#f87171',
  overlay: 'rgba(0,0,0,0.65)',
  flatChrome: false,
};

const DARK_PURE_BLACK_BASE: PaletteBase = {
  bg: '#000000',
  card: '#0d0d0d',
  text: '#e8ecf1',
  muted: '#8b95a5',
  border: '#262626',
  danger: '#f87171',
  overlay: 'rgba(0,0,0,0.75)',
  flatChrome: false,
};

const LIGHT_BASE: PaletteBase = {
  bg: '#f5f6f8',
  card: '#ffffff',
  text: '#1a1a1a',
  muted: '#5c6570',
  border: '#e2e5ea',
  danger: '#b91c1c',
  overlay: 'rgba(0,0,0,0.4)',
  flatChrome: false,
};

function iosDynamicPalette(isDark: boolean, pureBlackDark: boolean): AppPalette {
  const oled = pureBlackDark && isDark;
  return {
    bg: oled ? '#000000' : PlatformColor('systemGroupedBackground'),
    card: oled ? '#0d0d0d' : PlatformColor('secondarySystemGroupedBackground'),
    text: PlatformColor('label'),
    muted: PlatformColor('secondaryLabel'),
    border: 'transparent',
    accent: PlatformColor('tintColor'),
    accentBg: PlatformColor('tertiarySystemGroupedBackground'),
    danger: PlatformColor('systemRed'),
    overlay: DynamicColorIOS({
      light: 'rgba(0,0,0,0.4)',
      dark: 'rgba(0,0,0,0.65)',
      highContrastLight: 'rgba(0,0,0,0.5)',
      highContrastDark: 'rgba(0,0,0,0.75)',
    }),
    flatChrome: true,
    // iOS systemBlue is the typical tintColor when no override; matches
    // the live PlatformColor tint closely enough for SVG icons.
    accentSolid: isDark ? '#0A84FF' : '#007AFF',
  };
}

function androidDynamicPalette(
  isDark: boolean,
  pureBlackDark: boolean,
): AppPalette {
  const oled = pureBlackDark && isDark;
  return {
    bg: oled ? '#000000' : PlatformColor('?attr/colorSurface'),
    card: oled ? '#0d0d0d' : PlatformColor('?attr/colorSurfaceContainerHighest'),
    text: PlatformColor('?attr/colorOnSurface'),
    muted: PlatformColor('?attr/colorOnSurfaceVariant'),
    border: 'transparent',
    accent: PlatformColor('?attr/colorPrimary'),
    // Use a neutral container to keep text contrast predictable with dynamic palettes.
    accentBg: PlatformColor('?attr/colorSurfaceContainerHigh'),
    danger: PlatformColor('?attr/colorError'),
    overlay: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
    flatChrome: true,
    // SVG icons can't consume PlatformColor; resolve the live system
    // primary to a hex via the SystemTheme native module so tiles
    // stay visible AND match the Material You wallpaper-derived
    // accent that the rest of the app shows. Falls back to the
    // Material 3 baseline if the native bridge is unavailable.
    accentSolid: getResolvedAccentHex() ?? (isDark ? '#D0BCFF' : '#6750A4'),
  };
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
  return buildAppPalette(isDark, pureBlackDark);
}

export function buildAppPalette(
  isDark: boolean,
  pureBlackDark: boolean,
): AppPalette {
  if (!isDark) {
    return withBrandAccents(LIGHT_BASE, false);
  }
  return withBrandAccents(
    pureBlackDark ? DARK_PURE_BLACK_BASE : DARK_BASE,
    true,
  );
}

export function resolveAppPalette(input: {
  appearance: AppearancePreference;
  useSystemDynamicTheme: boolean;
  systemScheme: ColorSchemeName | null | undefined;
  pureBlackDark: boolean;
}): AppPalette {
  const isDark = resolveEffectiveDark(input.appearance, input.systemScheme);
  if (shouldUseDynamicSystemColors(input.appearance, input.useSystemDynamicTheme)) {
    return buildDynamicSystemPalette(isDark, input.pureBlackDark);
  }
  return buildAppPalette(isDark, input.pureBlackDark);
}
