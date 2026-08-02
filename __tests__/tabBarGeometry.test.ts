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
    // pill sits inside the strip and still clears the handle.
    expect(tabBarBottomFor(34)).toBe(24);
    // Android gesture bar.
    expect(tabBarBottomFor(24)).toBe(14);
    // iPad.
    expect(tabBarBottomFor(20)).toBe(12);
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
});
