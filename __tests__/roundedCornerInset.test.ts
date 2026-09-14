/**
 * The tab bar keeps clear of the display's rounded corners — #42.
 *
 * Reported as the outer tab labels running into the bottom corners of a
 * Huawei Nova 11i, with a screenshot that looked perfectly fine: a
 * screenshot is the framebuffer, and the rounded mask is physical glass
 * applied after it. It took a photograph of the phone to see.
 *
 * The app had never asked. A rounded corner is not a display cutout, so it
 * is not in `displayCutout`, and it is not in the safe-area insets either
 * — the window really does extend into the corner and the display simply
 * does not light it. Android has answered since 12; nothing here asked
 * until now.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { cornerInsetAt, SQUARE_CORNERS } from '../src/native/DisplayCutout';

const read = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('what a rounded corner eats', () => {
  it('is nothing at all on a square display', () => {
    expect(cornerInsetAt(0, 0)).toBe(0);
    expect(cornerInsetAt(0, 24)).toBe(0);
    expect(SQUARE_CORNERS.bottomLeft).toBe(0);
  });

  it('is the whole radius right at the edge', () => {
    // The corner's lowest row is a single point: at the very bottom of the
    // window the lit area does not begin until a full radius in.
    expect(cornerInsetAt(40, 0)).toBeCloseTo(40, 6);
  });

  it('is nothing again once the edge is straight', () => {
    expect(cornerInsetAt(40, 40)).toBe(0);
    expect(cornerInsetAt(40, 41)).toBe(0);
    expect(cornerInsetAt(40, 400)).toBe(0);
  });

  it('is a few dp where the tab labels actually sit', () => {
    // A 40dp corner with a 24dp gesture strip below the labels: the curve
    // has nearly run out by the time it reaches them, which is why this
    // reserves three dp and not forty. Reserving the radius itself would
    // shove the outer tabs inward for nothing visible.
    expect(cornerInsetAt(40, 24)).toBeCloseTo(3.34, 2);
    // A rounder corner over a shallower strip is the case that hurts.
    expect(cornerInsetAt(60, 16)).toBeCloseTo(19.21, 2);
  });

  it('shrinks as the content sits higher', () => {
    let last = Infinity;
    for (let h = 0; h <= 40; h += 4) {
      const bite = cornerInsetAt(40, h);
      expect(bite).toBeLessThanOrEqual(last);
      last = bite;
    }
  });

  it('treats a negative height as the edge itself', () => {
    expect(cornerInsetAt(40, -10)).toBeCloseTo(40, 6);
  });
});

describe('the bar reserves it', () => {
  const inset = read('src', 'navigation', 'tabBarInset.ts');
  const tabs = read('src', 'navigation', 'MainTabs.tsx');

  it('measures the bite where the labels are, not at the window edge', () => {
    // `useSystemNavigationReserve` is already "what anything anchored to
    // the bottom must keep clear" — the strip or the button bar the labels
    // sit above. Measuring at zero would reserve the whole radius.
    expect(inset).toMatch(
      /export function useTabBarCornerInset[\s\S]{0,400}?useSystemNavigationReserve\(\)/,
    );
    expect(inset).toMatch(/cornerInsetAt\(corners\.bottomLeft, above\)/);
    expect(inset).toMatch(/cornerInsetAt\(corners\.bottomRight, above\)/);
  });

  it('takes the wider of the two corners, so the six stay even', () => {
    expect(inset).toMatch(
      /return Math\.max\(\s*cornerInsetAt\(corners\.bottomLeft/,
    );
  });

  it('pads the bar rather than insetting it', () => {
    // The band still runs the full width and bleeds into the corners; a
    // surface stopping short of the glass is what a mistake looks like.
    expect(tabs).toMatch(/paddingHorizontal: cornerInset/);
    expect(tabs).toMatch(/const cornerInset = useTabBarCornerInset\(\)/);
    expect(tabs).not.toMatch(/marginHorizontal: cornerInset/);
  });
});

describe('the platform is the one that knows', () => {
  const kt = read(
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'prayer_times',
    'DisplayCutoutModule.kt',
  );
  const js = read('src', 'native', 'DisplayCutout.ts');

  it('asks Android rather than guessing a radius', () => {
    expect(kt).toMatch(/getRoundedCorner\(position\)\?\.radius/);
    for (const corner of [
      'POSITION_TOP_LEFT',
      'POSITION_TOP_RIGHT',
      'POSITION_BOTTOM_LEFT',
      'POSITION_BOTTOM_RIGHT',
    ]) {
      expect(kt).toContain(`RoundedCorner.${corner}`);
    }
  });

  it('answers square below Android 12, where there is no API', () => {
    expect(kt).toMatch(
      /SDK_INT < Build\.VERSION_CODES\.S[\s\S]{0,120}?squareCorners\(\)/,
    );
  });

  it('reports dp, like everything else the app lays out in', () => {
    expect(kt).toMatch(/radius \?: 0\) \/ density\.toDouble\(\)/);
  });

  it('answers square off Android, where the insets already say it', () => {
    expect(js).toMatch(
      /Platform\.OS !== 'android'[\s\S]{0,80}?return SQUARE_CORNERS/,
    );
  });
});
