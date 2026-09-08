/**
 * The fade behind the floating tab bar — the fix for content colliding with
 * the pill on every scrolling tab (2026-09-08).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Animated } from 'react-native';
import { act } from 'react';
import { create } from 'react-test-renderer';
import { scrimColor, TabBarScrim } from '../src/navigation/TabBarScrim';
import { SPRING, resolveSpring } from '../src/theme/motion';

jest.mock('../src/navigation/tabBarInset', () => ({
  FLOATS_OVER_CONTENT: true,
  TAB_BAR_HEIGHT: 60,
  useTabBarBottom: () => 12,
}));

const mainTabs = readFileSync(
  join(__dirname, '../src/navigation/MainTabs.tsx'),
  'utf8',
);

describe('TabBarScrim', () => {
  it('builds a gradient from the page colour to transparent', () => {
    const slide = new Animated.Value(0);
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(<TabBarScrim bg="#FAF7F2" slide={slide} />);
    });
    expect(r.root.findByProps({ testID: 'tab-bar-scrim' })).toBeTruthy();
    const tree = JSON.stringify(r.toJSON());
    // react-native-svg compiles the stops to [offset, argb, …]. Both ends
    // of the fade are the page's own colour: alpha 0 at the top, opaque at
    // the bottom.
    const m = /"gradient":\[([^\]]+)\]/.exec(tree);
    expect(m).not.toBeNull();
    const stops = m![1].split(',').map(Number);
    const rgb = 0xfaf7f2;
    expect(stops[0]).toBe(0);
    expect(stops[1] >>> 0).toBe(rgb); // alpha 0
    expect(stops[stops.length - 2]).toBe(1);
    expect(stops[stops.length - 1] >>> 0).toBe((0xff000000 | rgb) >>> 0);
  });

  it('draws nothing it cannot colour — a PlatformColor has no channels', () => {
    const slide = new Animated.Value(0);
    const platformColor = { semantic: ['systemGroupedBackground'] };
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(<TabBarScrim bg={platformColor as never} slide={slide} />);
    });
    expect(r.toJSON()).toBeNull();
    expect(scrimColor(platformColor as never)).toBeNull();
    expect(scrimColor('#0E1218')).toBe('#0E1218');
    expect(scrimColor('rgba(0,0,0,0.5)')).toBeNull();
  });

  it('is mounted under every tab, on the same slide value as the bar', () => {
    // In `screenLayout`, after the screen, so it paints over the page and
    // under the bar.
    expect(mainTabs).toMatch(
      /\{children\}[\s\S]{0,300}<TabBarScrim bg=\{palette\.bg\} slide=\{slide\}/,
    );
  });
});

describe('the tab bar spring', () => {
  it('moves the bar on the spatial track, not a timing', () => {
    expect(mainTabs).toContain("resolveSpring('spatial'");
    expect(mainTabs).not.toMatch(/Animated\.timing\(slide/);
  });

  it('is critically damped for effects and settles for space', () => {
    // damping = ratio × 2 × √(stiffness × mass)
    const ratio = (s: { stiffness: number; damping: number; mass: number }) =>
      s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
    expect(ratio(SPRING.effects)).toBeCloseTo(1.0, 2);
    expect(ratio(SPRING.spatial)).toBeCloseTo(0.9, 2);
  });

  it('lands in a frame under Reduce Motion', () => {
    const calm = resolveSpring('spatial', true);
    expect(calm.stiffness).toBeGreaterThan(SPRING.spatial.stiffness * 5);
    expect(calm.useNativeDriver).toBe(true);
    expect(resolveSpring('spatial', false)).toMatchObject(SPRING.spatial);
  });
});
