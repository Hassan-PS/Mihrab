import type { ColorSchemeName } from 'react-native';
import type { AppearancePreference } from '../settings/types';

export type AppPalette = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentBg: string;
  danger: string;
  overlay: string;
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
};

export function buildAppPalette(
  isDark: boolean,
  pureBlackDark: boolean,
): AppPalette {
  if (!isDark) {
    return LIGHT;
  }
  return pureBlackDark ? DARK_PURE_BLACK : DARK;
}
