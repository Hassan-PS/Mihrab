import type { ColorSchemeName, ColorValue } from 'react-native';
import {
  DynamicColorIOS,
  Platform,
  PlatformColor,
} from 'react-native';
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
  return (appearance ?? 'system') === 'system' && !!useSystemDynamicTheme;
}

/** Standard dark greys (current app look). */
const DARK: AppPalette = {
  bg: '#0f1419',
  card: '#1a2230',
  text: '#e8ecf1',
  muted: '#8b95a5',
  border: '#2a3444',
  accent: '#5b9fd4',
  accentBg: '#1e3a52',
  danger: '#f87171',
  overlay: 'rgba(0,0,0,0.65)',
  flatChrome: false,
};

/** OLED-style: true black base, slightly lifted surfaces. */
const DARK_PURE_BLACK: AppPalette = {
  bg: '#000000',
  card: '#0d0d0d',
  text: '#e8ecf1',
  muted: '#8b95a5',
  border: '#262626',
  accent: '#5b9fd4',
  accentBg: '#142536',
  danger: '#f87171',
  overlay: 'rgba(0,0,0,0.75)',
  flatChrome: false,
};

const LIGHT: AppPalette = {
  bg: '#f5f6f8',
  card: '#ffffff',
  text: '#1a1a1a',
  muted: '#5c6570',
  border: '#e2e5ea',
  accent: '#1e6bb8',
  accentBg: '#e8f1fb',
  danger: '#b91c1c',
  overlay: 'rgba(0,0,0,0.4)',
  flatChrome: false,
};

function iosDynamicPalette(isDark: boolean, pureBlackDark: boolean): AppPalette {
  const oled = pureBlackDark && isDark;
  return {
    // Grouped stack reads clearly on Dynamic / tinted wallpapers.
    bg: oled ? '#000000' : PlatformColor('systemGroupedBackground'),
    card: oled ? '#0d0d0d' : PlatformColor('secondarySystemGroupedBackground'),
    text: PlatformColor('label'),
    muted: PlatformColor('secondaryLabel'),
    border: 'transparent',
    accent: PlatformColor('tintColor'),
    accentBg: oled
      ? '#142536'
      : PlatformColor('tertiarySystemGroupedBackground'),
    danger: PlatformColor('systemRed'),
    overlay: DynamicColorIOS({
      light: 'rgba(0,0,0,0.4)',
      dark: 'rgba(0,0,0,0.65)',
      highContrastLight: 'rgba(0,0,0,0.5)',
      highContrastDark: 'rgba(0,0,0,0.75)',
    }),
    flatChrome: true,
  };
}

function androidDynamicPalette(
  isDark: boolean,
  pureBlackDark: boolean,
): AppPalette {
  const oled = pureBlackDark && isDark;
  return {
    bg: oled ? '#000000' : PlatformColor('?attr/colorSurface'),
    // Strongest container tint so Material You / dynamic color is obvious on cards.
    card: oled ? '#0d0d0d' : PlatformColor('?attr/colorSurfaceContainerHighest'),
    text: PlatformColor('?attr/colorOnSurface'),
    muted: PlatformColor('?attr/colorOnSurfaceVariant'),
    border: 'transparent',
    accent: PlatformColor('?attr/colorPrimary'),
    accentBg: oled
      ? '#142536'
      : PlatformColor('?attr/colorPrimaryContainer'),
    danger: PlatformColor('?attr/colorError'),
    overlay: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
    flatChrome: true,
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
    return LIGHT;
  }
  return pureBlackDark ? DARK_PURE_BLACK : DARK;
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
