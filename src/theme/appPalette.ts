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

/** Material / tint primary + container — matches wallpaper & dynamic color on Android 12+ and iOS accent. */
function nativeThemeAccents(): { accent: ColorValue; accentBg: ColorValue } {
  if (Platform.OS === 'android') {
    return {
      accent: PlatformColor('?attr/colorPrimary'),
      accentBg: PlatformColor('?attr/colorPrimaryContainer'),
    };
  }
  if (Platform.OS === 'ios') {
    return {
      accent: PlatformColor('tintColor'),
      accentBg: PlatformColor('tertiarySystemGroupedBackground'),
    };
  }
  return { accent: '#0a84ff', accentBg: '#e3f2fd' };
}

type PaletteBase = Omit<AppPalette, 'accent' | 'accentBg'>;

function withNativeAccents(base: PaletteBase): AppPalette {
  const { accent, accentBg } = nativeThemeAccents();
  return { ...base, accent, accentBg };
}

/** Standard dark greys. Accent always follows theme primary (Material You / tint). */
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
    accentBg: PlatformColor('?attr/colorPrimaryContainer'),
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
    return withNativeAccents(LIGHT_BASE);
  }
  return withNativeAccents(
    pureBlackDark ? DARK_PURE_BLACK_BASE : DARK_BASE,
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
