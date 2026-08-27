/**
 * The accent swatches, and how one becomes a widget highlight.
 *
 * Shared by the Appearance card (which sets the APP accent and mirrors it
 * onto the widget, task #127) and the Widget card (which sets the widget's
 * own colour in the one case the app accent cannot — see below). It lives
 * here rather than in either card so the two can never drift apart on what
 * "teal" means.
 */
import type { AppAccentId, WidgetHighlightId } from './types';

/**
 * App accent swatches — kept in sync with `ACCENT_SWATCHES` in
 * src/theme/appPalette.ts, so the preview dot matches the accent that
 * actually gets applied in the current mode (the green default is a
 * refined deep/lifted emerald, not neon).
 */
export const APP_ACCENT_SWATCHES: {
  id: Exclude<AppAccentId, 'custom'>;
  light: string;
  dark: string;
}[] = [
  { id: 'green', light: '#1F5F4A', dark: '#46A081' },
  { id: 'teal', light: '#0d9488', dark: '#5eead4' },
  { id: 'blue', light: '#2563eb', dark: '#7dd3fc' },
  { id: 'amber', light: '#b45309', dark: '#fbbf24' },
  { id: 'rose', light: '#9F2D4D', dark: '#E58FA6' },
  { id: 'violet', light: '#5B4B9E', dark: '#B4A6E8' },
];

/**
 * Accent ids the NATIVE widget modules understand. Newer app accents
 * (rose, violet) are mirrored to the widget as a custom hex instead, so
 * the widget still matches without touching Kotlin/Swift swatch tables.
 */
export const NATIVE_WIDGET_ACCENT_IDS = new Set<string>([
  'green',
  'teal',
  'blue',
  'amber',
  'custom',
]);

export type WidgetAccentPatch = {
  widgetHighlightId: WidgetHighlightId;
  widgetHighlightCustomHex?: string;
};

/**
 * What picking `id` means for the widget.
 *
 * The light-mode swatch is used for the rose/violet fallback: the widget
 * renders on wallpaper, where the deeper ink reads best.
 */
export function widgetPatchForAccent(
  id: AppAccentId,
  customHex?: string,
): WidgetAccentPatch {
  if (NATIVE_WIDGET_ACCENT_IDS.has(id)) {
    const patch: WidgetAccentPatch = {
      widgetHighlightId: id as WidgetHighlightId,
    };
    if (id === 'custom' && customHex) patch.widgetHighlightCustomHex = customHex;
    return patch;
  }
  const sw = APP_ACCENT_SWATCHES.find(s => s.id === id);
  return {
    widgetHighlightId: 'custom',
    widgetHighlightCustomHex: sw?.light ?? '#1F5F4A',
  };
}

/**
 * Whether a swatch is the one the widget is currently using.
 *
 * Rose and violet are stored as a custom hex, so identity alone would show
 * them as "Custom" and leave the row with nothing selected. Comparing the
 * hex as well is what makes the picker reflect what was chosen.
 */
export function widgetSwatchSelected(
  swatch: { id: string; light: string },
  highlightId: string,
  customHex?: string,
): boolean {
  if (highlightId === swatch.id) return true;
  if (highlightId !== 'custom') return false;
  return (customHex ?? '').toLowerCase() === swatch.light.toLowerCase();
}
