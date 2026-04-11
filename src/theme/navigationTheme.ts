import {
  DarkTheme,
  DefaultTheme,
  type Theme,
} from '@react-navigation/native';
import type { AppPalette } from './appPalette';

export function buildNavigationTheme(
  palette: AppPalette,
  isDark: boolean,
): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      background: palette.bg,
      card: palette.card,
      text: palette.text,
      border: palette.border,
      notification: palette.accent,
    },
  } as Theme;
}
