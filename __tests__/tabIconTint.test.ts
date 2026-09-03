/**
 * The tab bar came out empty under Liquid Glass: five labels with no
 * glyphs above them, and only the active tab's icon drawn.
 *
 * The icons are SVGs, and the colour they are given is the navigator's
 * tint. Under Liquid Glass `palette.muted` is
 * `PlatformColor('secondaryLabel')` — a colour a native view can resolve
 * and `react-native-svg` cannot. It was being passed through `String()`,
 * because react-navigation types the tints as plain strings, and
 * `String(PlatformColor(...))` is "[object Object]": unparseable, so the
 * icon drew nothing. The active tab was fine only because it is tinted
 * with `accentSolid`, which has always been a hex for this exact reason.
 */
import fs from 'fs';
import path from 'path';

import { resolveAppPalette } from '../src/theme/appPalette';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('anything that colours a drawn icon gets a hex', () => {
  it('every palette answers with one', () => {
    for (const appearance of ['light', 'dark', 'system'] as const) {
      for (const useSystemDynamicTheme of [false, true]) {
        const palette = resolveAppPalette({
          appearance,
          useSystemDynamicTheme,
          systemScheme: 'light',
          pureBlackDark: false,
          appAccentId: 'green',
          appAccentCustomHex: '#2E7D32',
        });
        expect(palette.mutedSolid).toMatch(HEX);
        expect(palette.accentSolid).toMatch(HEX);
      }
    }
  });

  it('the tab bar hands the icons that hex, not a stringified PlatformColor', () => {
    const tabs = read('src/navigation/MainTabs.tsx');
    expect(tabs).toContain('tabBarInactiveTintColor: palette.mutedSolid');
    expect(tabs).not.toMatch(/tabBarInactiveTintColor: String\(/);
  });

  // The same trap, one screen over: both of these paint SVG.
  it('and so do the other drawn marks', () => {
    expect(read('src/screens/home/QiblaChip.tsx')).toContain(
      'color={palette.accentSolid}',
    );
    expect(read('src/screens/OnboardingScreen.tsx')).toContain(
      'mutedColor={palette.mutedSolid}',
    );
  });
});
