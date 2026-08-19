/**
 * The pill tab bar's bottom offset.
 *
 * This has now gone wrong twice in a way no build log can catch: the bar
 * renders, the app runs, and the labels are simply not on the screen. The
 * rule the test exists to pin is that the offset is the WHOLE gap under
 * the bar — @react-navigation/bottom-tabs returns a custom numeric
 * `height` from `getTabBarHeight` verbatim, so once the pill sets its own
 * height the navigator reserves no safe area at all. A negative value
 * here means the bar hangs off the bottom of the window.
 */
import {
  systemNavigationBand,
  TAB_BAR_EDGE_GAP,
  TAB_BAR_HEIGHT,
  tabBarBottomFor,
} from '../src/navigation/tabBarInset';

describe('tabBarBottomFor', () => {
  it('is never negative — a negative offset hangs the bar off-screen', () => {
    for (let inset = 0; inset <= 80; inset += 1) {
      expect(tabBarBottomFor(inset)).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the whole pill inside the window on every inset', () => {
    // The bar's box is exactly TAB_BAR_HEIGHT tall and sits `bottom`
    // above the window edge, so its top is height + bottom above it —
    // which only stays on screen while `bottom` is >= 0.
    for (let inset = 0; inset <= 80; inset += 1) {
      const bottom = tabBarBottomFor(inset);
      expect(TAB_BAR_HEIGHT + bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    }
  });

  it('tucks into a gesture strip rather than clearing it', () => {
    // iPhone home indicator: 34pt of inset, a ~5pt handle ~8pt up. The
    // pill sits inside the strip and still leaves daylight above the
    // handle — at the previous 10pt of overlap the two edges read as
    // touching.
    expect(tabBarBottomFor(34)).toBe(28);
    // Android gesture bar.
    expect(tabBarBottomFor(24)).toBe(18);
    // iPad.
    expect(tabBarBottomFor(20)).toBe(14);
  });

  it('leaves the handle itself clear on every strip', () => {
    // The handle sits about 8pt up and is about 5pt tall, so its top edge
    // is around 13pt. The pill's bottom must stay above that.
    for (const strip of [20, 24, 34]) {
      expect(tabBarBottomFor(strip)).toBeGreaterThan(13);
    }
  });

  it('clears a button navigation bar completely', () => {
    // Android three-button navigation is real chrome, not a handle: the
    // pill has to sit above the whole 48pt of it.
    expect(tabBarBottomFor(48)).toBe(48 + TAB_BAR_EDGE_GAP);
    expect(tabBarBottomFor(48)).toBeGreaterThan(48);
  });

  it('still leaves a gap when there is no inset at all', () => {
    // Mac Catalyst and older Android hardware-key phones report 0.
    expect(tabBarBottomFor(0)).toBe(TAB_BAR_EDGE_GAP);
  });

  it('never decreases as the inset grows', () => {
    let previous = -1;
    for (let inset = 0; inset <= 80; inset += 1) {
      const bottom = tabBarBottomFor(inset);
      expect(bottom).toBeGreaterThanOrEqual(previous);
      previous = bottom;
    }
  });

  it('clears a button bar that DRAWS taller than it reports', () => {
    // Android 14, three-button: the NavigationBar0 window is 48dp and the
    // navigationBars inset it hands out is 24dp, so the glyphs are half
    // inside the inset and half over the app. Trusting the inset put the
    // pill 12pt above a 24pt bar — under the top half of the buttons.
    expect(tabBarBottomFor(24, true)).toBe(24 + TAB_BAR_EDGE_GAP);
    expect(tabBarBottomFor(24, true, 48)).toBe(48 + TAB_BAR_EDGE_GAP);
    // An honest bar — API 36 reports the 48 it draws — must not move.
    expect(tabBarBottomFor(48, true, 48)).toBe(48 + TAB_BAR_EDGE_GAP);
  });

  it('ignores a drawn height that gestures reported', () => {
    // The gesture window is the same 48dp, and tucking the pill above all
    // of it would throw away the strip the design deliberately overlaps.
    expect(tabBarBottomFor(24, false, 48)).toBe(18);
    expect(tabBarBottomFor(24, undefined, 48)).toBe(18);
  });
});

describe('systemNavigationBand', () => {
  it('is the taller of what the bar reports and what it draws', () => {
    expect(systemNavigationBand(24, true, 48)).toBe(48);
    expect(systemNavigationBand(48, true, 48)).toBe(48);
    // A drawn height smaller than the inset is not a reason to shrink.
    expect(systemNavigationBand(48, true, 24)).toBe(48);
  });

  it('is zero without buttons, so nothing paints behind a handle', () => {
    expect(systemNavigationBand(24, false, 48)).toBe(0);
    expect(systemNavigationBand(34, undefined)).toBe(0);
  });
});
