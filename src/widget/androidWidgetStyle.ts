import type { AndroidWidgetHighlightId } from '../settings/types';

export const ANDROID_WIDGET_HIGHLIGHT_OPTIONS: readonly AndroidWidgetHighlightId[] =
  ['green', 'teal', 'blue', 'amber'] as const;

/** Matches Kotlin `PrayerWidgetProvider` highlight presets. */
export function androidWidgetHighlightHex(id: AndroidWidgetHighlightId): string {
  switch (id) {
    case 'green':
      return '#6BC98A';
    case 'teal':
      return '#4EC9B0';
    case 'blue':
      return '#6BA3F5';
    case 'amber':
      return '#E5C07B';
    default:
      return '#6BC98A';
  }
}

/** Neutral widget background base (RGB only); alpha comes from `androidWidgetBackgroundOpacity`. */
export const ANDROID_WIDGET_BASE_BG = { r: 28, g: 28, b: 30 };
