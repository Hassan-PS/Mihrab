/**
 * The tab bar gets out of the way while you read, and comes back when you
 * look like you want it. Asked for on 2026-08-27.
 *
 * The rules are pinned here rather than left to a scroll handler, because
 * every one of them is there to stop a specific kind of flicker and none
 * of them is obvious from the code that calls this.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { nextTabBarState } from '../src/navigation/tabBarVisibility';

const step = (
  y: number,
  prev: { hidden: boolean; anchor: number; last: number },
) => {
  const next = nextTabBarState({
    y,
    last: prev.last,
    anchor: prev.anchor,
    hidden: prev.hidden,
  });
  return { hidden: next.hidden, anchor: next.anchor, last: y };
};

/** Run a sequence of offsets from a fresh, visible bar. */
function scroll(...offsets: number[]) {
  let state = { hidden: false, anchor: 0, last: 0 };
  for (const y of offsets) state = step(y, state);
  return state;
}

describe('reading down the page', () => {
  it('hides the bar once a downward scroll is sustained', () => {
    expect(scroll(80, 120, 200).hidden).toBe(true);
  });

  it('leaves it alone near the top', () => {
    // A list that has barely moved is settling, not scrolling.
    expect(scroll(10, 30, 50).hidden).toBe(false);
  });

  it('ignores a twitch', () => {
    // Below the threshold, a few points of movement is a thumb resting on
    // a list, not a decision. Measured from a settled position: the first
    // jump from the top to 100 IS a real scroll and does hide the bar.
    const settled = { hidden: false, anchor: 100, last: 100 };
    expect(step(104, settled).hidden).toBe(false);
    expect(step(96, settled).hidden).toBe(false);
  });
});

describe('coming back up', () => {
  it('shows the bar again on a sustained scroll up', () => {
    const down = scroll(80, 140, 260);
    expect(down.hidden).toBe(true);
    const up = step(200, step(240, down));
    expect(up.hidden).toBe(false);
  });

  it('always shows it at the top, whatever happened before', () => {
    const down = scroll(80, 140, 260);
    expect(down.hidden).toBe(true);
    // Arriving back at the beginning is the clearest "I am done" there is.
    expect(step(20, down).hidden).toBe(false);
  });

  it('shows it on an over-scroll past the top', () => {
    const down = scroll(80, 140, 260);
    expect(step(-40, down).hidden).toBe(false);
  });
});

describe('the flicker cases', () => {
  it('does not flap when the direction keeps changing', () => {
    // A shaking hand around one point. The bar should end where it began
    // rather than strobing.
    let state = scroll(80, 140, 220);
    const started = state.hidden;
    for (const y of [218, 220, 217, 221, 219, 222]) state = step(y, state);
    expect(state.hidden).toBe(started);
  });

  it('re-anchors on a turn, so the threshold measures from the turn', () => {
    // Without re-anchoring, a long scroll down would make even a large
    // scroll back up look like a small movement from the original anchor.
    const down = scroll(100, 400, 800);
    expect(down.hidden).toBe(true);
    const up = step(700, step(780, down));
    expect(up.hidden).toBe(false);
  });
});

describe('the bar can always be got back', () => {
  /**
   * A tab screen is NOT unmounted when you leave it, so the unmount
   * cleanup inside `useTabBarScroll` never runs on a tab change. Scroll
   * Today down, open Tasbih — which has no list, and so no way to ask for
   * the bar back — and the navigation would be hidden with nothing on
   * screen able to restore it. The navigator's own focus listener is what
   * makes that impossible, and it is one line that nothing else would
   * notice going missing.
   */
  it('the tab navigator shows the bar on every focus', () => {
    const src = readFileSync(
      path.join(__dirname, '..', 'src', 'navigation', 'MainTabs.tsx'),
      'utf8',
    );
    expect(src).toMatch(/screenListeners=\{\{\s*focus:\s*showTabBar\s*\}\}/);
    expect(src).toMatch(/import \{[^}]*showTabBar[^}]*\} from '\.\/tabBarVisibility'/);
  });

  it('every tab that scrolls is wired to move it', () => {
    // Today, Quran, Duas, Log and Settings. Tasbih is deliberately absent:
    // it is a counter, not a reading surface, and hiding the bar under a
    // thumb that is tapping is the opposite of what was asked for.
    for (const screen of [
      'HomeScreen',
      'QuranScreen',
      'DuasScreen',
      'LogScreen',
      'SettingsScreen',
    ]) {
      const src = readFileSync(
        path.join(__dirname, '..', 'src', 'screens', `${screen}.tsx`),
        'utf8',
      );
      expect(src).toContain('useTabBarScroll');
      // Computed AND spread — a hook whose result is dropped is the
      // failure this whole audit exists to catch.
      expect(src).toContain('{...tabBarScroll}');
    }
  });
});
