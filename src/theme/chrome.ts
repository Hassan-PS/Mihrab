import { StyleSheet, type ViewStyle } from 'react-native';
import type { AppPalette } from './appPalette';

type ChromePalette = Pick<
  AppPalette,
  'flatChrome' | 'border' | 'accent' | 'accentBg'
>;

/** Card / boxed regions: hairline border, or none when using flat dynamic chrome. */
export function cardEdgeStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderWidth: 0, borderColor: 'transparent' };
  }
  return { borderWidth: 1, borderColor: palette.border };
}

/** Segmented control cells: outline, or fill-only when flat. */
export function segmentChromeStyle(
  palette: ChromePalette,
  selected: boolean,
): ViewStyle {
  if (palette.flatChrome) {
    return {
      borderWidth: 0,
      borderColor: 'transparent',
      backgroundColor: selected ? palette.accentBg : 'transparent',
    };
  }
  return {
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? palette.accent : palette.border,
  };
}

/** Text fields: drop outline in flat chrome; rely on fill vs card. */
export function inputChromeStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderWidth: 0, borderColor: 'transparent' };
  }
  return { borderWidth: 1, borderColor: palette.border };
}

export function rowDividerStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderBottomWidth: 0, borderBottomColor: 'transparent' };
  }
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  };
}

/** Small banners (e.g. “applied”) — no outline in flat chrome. */
export function bannerEdgeStyle(palette: ChromePalette): ViewStyle {
  if (palette.flatChrome) {
    return { borderWidth: 0, borderColor: 'transparent' };
  }
  return { borderWidth: 1, borderColor: palette.accent };
}

/** Optional bottom rule between list rows (last row often cleared by caller). */
export function listRowBottomBorder(
  palette: ChromePalette,
  isLast: boolean,
): ViewStyle {
  if (isLast || palette.flatChrome) {
    return { borderBottomWidth: 0, borderBottomColor: 'transparent' };
  }
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  };
}
