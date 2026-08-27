/**
 * The widget always has a colour control, and an older build's "dynamic"
 * lands somewhere sane.
 *
 * Removing dynamic colour from the Android widget broke an assumption the
 * unified accent picker was built on (#127): turning Material You on used
 * to send BOTH the app and the widget to the OS palette, which is why the
 * Appearance card hides its picker in that mode — there was nothing left
 * to choose. The widget does not follow Material You any more, so in that
 * mode the widget had a colour, no picker in Appearance, and none in the
 * Widget card either.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import path from 'path';
import { loadSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import {
  APP_ACCENT_SWATCHES,
  widgetPatchForAccent,
  widgetSwatchSelected,
} from '../src/settings/widgetAccent';

const KEY = 'prayerapp.settings.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('an older build stored "dynamic"', () => {
  it('loads as the default colour, not as an unknown id', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, widgetHighlightId: 'dynamic' }),
    );
    const loaded = await loadSettings();
    // Green — which is exactly what that build was already DRAWING, since
    // the widget resolved an unknown id to green. Nothing visibly changes;
    // the setting just stops lying about what it is.
    expect(loaded.widgetHighlightId).toBe('green');
  });

  it('leaves a real choice alone', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, widgetHighlightId: 'blue' }),
    );
    expect((await loadSettings()).widgetHighlightId).toBe('blue');
  });
});

describe('picking a swatch for the widget', () => {
  it('sends the four ids the native widget knows straight through', () => {
    for (const id of ['green', 'teal', 'blue', 'amber'] as const) {
      expect(widgetPatchForAccent(id)).toEqual({ widgetHighlightId: id });
    }
  });

  it('mirrors rose and violet as a custom hex', () => {
    // The Kotlin/Swift swatch tables only know four names. Newer app
    // accents reach the widget as a colour rather than a name, so the
    // widget matches without a native change for every new swatch.
    for (const id of ['rose', 'violet'] as const) {
      const patch = widgetPatchForAccent(id);
      expect(patch.widgetHighlightId).toBe('custom');
      expect(patch.widgetHighlightCustomHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('keeps a custom hex when one is given', () => {
    expect(widgetPatchForAccent('custom', '#123456')).toEqual({
      widgetHighlightId: 'custom',
      widgetHighlightCustomHex: '#123456',
    });
  });
});

describe('the picker shows what the widget is using', () => {
  it('selects the swatch whose id is stored', () => {
    const teal = APP_ACCENT_SWATCHES.find(s => s.id === 'teal')!;
    expect(widgetSwatchSelected(teal, 'teal')).toBe(true);
    expect(widgetSwatchSelected(teal, 'blue')).toBe(false);
  });

  it('selects rose and violet through the hex they are stored as', () => {
    // Identity alone would leave the row with NOTHING selected after
    // picking rose, because rose is stored as a custom hex.
    for (const id of ['rose', 'violet'] as const) {
      const sw = APP_ACCENT_SWATCHES.find(s => s.id === id)!;
      const patch = widgetPatchForAccent(id);
      expect(
        widgetSwatchSelected(sw, 'custom', patch.widgetHighlightCustomHex),
      ).toBe(true);
    }
  });

  it('does not select a preset swatch for an unrelated custom hex', () => {
    const green = APP_ACCENT_SWATCHES.find(s => s.id === 'green')!;
    expect(widgetSwatchSelected(green, 'custom', '#ABCDEF')).toBe(false);
    expect(widgetSwatchSelected(green, 'custom', undefined)).toBe(false);
  });
});

describe('the Widget card carries the picker in the one case it must', () => {
  const src = readFileSync(
    path.join(__dirname, '..', 'src', 'screens', 'settings', 'WidgetCard.tsx'),
    'utf8',
  );

  it('shows it exactly when Appearance hides its own', () => {
    // The two conditions must stay each other's mirror image: one picker
    // on screen, always, never two and never none.
    expect(src).toMatch(
      /appearance\.appearance === 'system' &&\s*appearance\.useSystemDynamicTheme/,
    );
    expect(src).toContain('needsOwnPicker ?');
  });

  it('writes through the same mapping the Appearance card uses', () => {
    expect(src).toContain('widgetPatchForAccent');
    const appearance = readFileSync(
      path.join(
        __dirname, '..', 'src', 'screens', 'settings', 'AppearanceCard.tsx',
      ),
      'utf8',
    );
    expect(appearance).toContain('widgetPatchForAccent');
    // Neither card may keep its own copy of the swatch table.
    expect(appearance).not.toMatch(/light: '#1F5F4A'/);
    expect(src).not.toMatch(/light: '#1F5F4A'/);
  });
});
