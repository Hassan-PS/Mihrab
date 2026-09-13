/**
 * The reader's chosen text size, and the three things a screen does with
 * it: style some text, step it, put it back.
 *
 * Kept beside the other settings-reading hooks rather than in `theme/`,
 * which is where the arithmetic lives — `theme/readingText.ts` is pure and
 * testable without a provider, and this is the twelve lines that join it
 * to the store.
 */
import { useCallback, useMemo } from 'react';
import { usePrayerSettingsOrDefaults } from '../context/PrayerSettingsContext';
import {
  canGrowReading,
  canShrinkReading,
  clampReadingScale,
  DEFAULT_READING_SCALE,
  readingTextStyle,
  stepReadingScale,
  type ReadingTextStyle,
} from '../theme/readingText';

export type ReadingText = {
  /** The multiplier, snapped to a rung. */
  scale: number;
  /** A base `{fontSize, lineHeight?}` at that size. */
  style: (base: ReadingTextStyle) => ReadingTextStyle;
  grow: () => void;
  shrink: () => void;
  /** Back to the size the app ships with. */
  reset: () => void;
  canGrow: boolean;
  canShrink: boolean;
  isDefault: boolean;
};

/**
 * `…OrDefaults`, not `usePrayerSettings`: this hook is reached from the
 * middle of a dua card and an āyah row, and the size of a paragraph is
 * not a reason for either to throw where a provider is missing — a test
 * harness mounting a screen on its own, most often. There it reads the
 * shipped size and the stepper is inert, which is the truthful state.
 */
export function useReadingText(): ReadingText {
  const { settings, updateSettings } = usePrayerSettingsOrDefaults();
  const scale = clampReadingScale(settings.readingTextScale);

  const style = useCallback(
    (base: ReadingTextStyle) => readingTextStyle(base, scale),
    [scale],
  );

  return useMemo(
    () => ({
      scale,
      style,
      grow: () =>
        updateSettings({ readingTextScale: stepReadingScale(scale, 1) }),
      shrink: () =>
        updateSettings({ readingTextScale: stepReadingScale(scale, -1) }),
      reset: () => updateSettings({ readingTextScale: DEFAULT_READING_SCALE }),
      canGrow: canGrowReading(scale),
      canShrink: canShrinkReading(scale),
      isDefault: scale === DEFAULT_READING_SCALE,
    }),
    [scale, style, updateSettings],
  );
}
