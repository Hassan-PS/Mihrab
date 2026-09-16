/**
 * The page bar's colours, from the selected theme rendered for the PAGE's
 * mode rather than the app's.
 *
 * A night page is dark whatever the app is doing; its scrubber needs the
 * theme's dark accent and dark surfaces. A paper page is light; it needs
 * the light accent over its own chrome. Reading the app's current palette
 * gave the night page a deep light-mode accent (invisible) and unthemed
 * surfaces whenever the app was in light — which is where the surah bubble
 * used to fall apart.
 */
import { useMemo } from 'react';
import { useAppearanceSettings } from '../context/PrayerSettingsContext';
import { resolveThemePaletteForMode, type AppPalette } from '../theme/appPalette';
import { scrubberChrome, toneIsDark, type MushafTone, type ToneChrome } from './mushafTone';

/** The selected theme, rendered for this page's mode. */
export function usePagePalette(tone: MushafTone): AppPalette {
  const { slice } = useAppearanceSettings();
  const {
    appearance,
    useSystemDynamicTheme,
    pureBlackDark,
    appAccentId,
    appAccentCustomHex,
    tintedSurfaces,
  } = slice;
  return useMemo(
    () =>
      resolveThemePaletteForMode(
        {
          appearance,
          useSystemDynamicTheme,
          pureBlackDark,
          appAccentId,
          appAccentCustomHex,
          tintedSurfaces,
        },
        toneIsDark(tone),
      ),
    [
      tone,
      appearance,
      useSystemDynamicTheme,
      pureBlackDark,
      appAccentId,
      appAccentCustomHex,
      tintedSurfaces,
    ],
  );
}

export function useScrubberChrome(tone: MushafTone): ToneChrome {
  const pagePalette = usePagePalette(tone);
  return useMemo(() => scrubberChrome(tone, pagePalette), [tone, pagePalette]);
}
