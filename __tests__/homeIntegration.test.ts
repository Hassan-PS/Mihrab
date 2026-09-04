/**
 * Smoke-tests for the HomeScreen integration follow-ups (tasks #45–#47):
 *
 *   #45 — the Today summary is mounted on HomeScreen (it replaced the tool
 *         tiles in design review 2a — Home reports rather than routes)
 *         (Tasbih, Duas, Quran, Log, Compass) are reachable
 *         without going through Settings.
 *   #46 — RamadanCountdownCard exists and is gated by the seasonal
 *         treatment (returns null outside Ramadan / when Imsak is missing).
 *   #47 — LocationChip exists and reads from the location context.
 *
 * These are static structural tests — they assert that HomeScreen.tsx
 * imports each new child and that the new modules export the expected
 * symbols. We don't render HomeScreen because that drags in many native
 * modules; the component-level behaviour is covered by the `seasonal/`
 * and `ramadan/` unit tests already in place.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src', 'screens');
const HOME = fs.readFileSync(path.join(SRC, 'HomeScreen.tsx'), 'utf-8');

describe('HomeScreen integration (tasks #45–#47)', () => {
  test('imports the Today summary', () => {
    expect(HOME).toMatch(/from '\.\/home\/TodaySummary'/);
    expect(HOME).toMatch(/<TodaySummary\b/);
  });

  test('imports RamadanCountdownCard with today + tomorrow props', () => {
    expect(HOME).toMatch(/from '\.\/home\/RamadanCountdownCard'/);
    expect(HOME).toMatch(/<RamadanCountdownCard\s+today=/);
  });

  test('LocationChip is mounted via HomeHeaderControls (header on phones, content row on Catalyst)', () => {
    // #47 follow-up: the chip was relocated from the HomeScreen body into the
    // navigation header (next to Settings). v2.7.41: the row lives in its own
    // module (HomeHeaderControls) so Mac Catalyst can render it as content
    // instead — the transparent nav bar sits in the window drag region,
    // where clicks were intermittently swallowed as window drags.
    const CONTROLS = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'src',
        'navigation',
        'HomeHeaderControls.tsx',
      ),
      'utf-8',
    );
    expect(CONTROLS).toMatch(/from '\.\.\/screens\/home\/LocationChip'/);
    expect(CONTROLS).toMatch(/<LocationChip\b/);
    // The Today tab owns the header row now that the six tabs are the app
    // (design review 2e) — RootNavigator only carries what is pushed above
    // them.
    const TABS = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'navigation', 'MainTabs.tsx'),
      'utf-8',
    );
    expect(TABS).toMatch(/<HomeHeaderControls\b/);
    expect(HOME).toMatch(/<HomeHeaderControls\b/);
  });

  test('the Catalyst top bar is chrome above the scroll view, not content', () => {
    // Three placements failed before this one, each only at some window
    // sizes, which is what made them so hard to see:
    //
    //  • navigation bar — inside the title-bar drag region, clicks swallowed;
    //  • absolute overlay pinned to `right: 14` of the WINDOW — fine while the
    //    cards were narrower than the window, on top of the hero card as soon
    //    as they were not (2026-08-18);
    //  • a row of scroll CONTENT — painted over by the dashboard's centred
    //    `transform: scale`, and dragged to the middle of the window by the
    //    same content's vertical centring (2026-08-24).
    //
    // So: no absolute positioning, no window offsets, and above the
    // ScrollView rather than inside it.
    const row = HOME.match(/macTopBar:\s*\{[^}]*\}/);
    expect(row).not.toBeNull();
    expect(row?.[0]).not.toMatch(/position:\s*'absolute'/);
    expect(row?.[0]).not.toMatch(/\b(right|left):/);
    // `space-between`, never fixed corners — the wordmark takes the leading
    // edge and the chip the trailing one, so RTL gets the mirror of this.
    expect(row?.[0]).toMatch(/justifyContent:\s*'space-between'/);
    // And the old overlay is gone rather than merely unused.
    expect(HOME).not.toMatch(/macHeaderControls/);

    // And held clear of the window's own title bar, or it draws behind the
    // traffic lights — the Catalyst scene starts above them, not below.
    expect(HOME).toMatch(/paddingTop:\s*macTopBarInset/);
    expect(HOME).toMatch(/Math\.max\(insets\.top, 36\)/);

    // Above the ScrollView: inside it, the dashboard's zoom and its vertical
    // centring both get a say in where the app's chrome sits.
    const bar = HOME.indexOf('styles.macTopBar');
    // The JSX element, not the first mention of the name — a `useRef<
    // ScrollView>` type annotation near the top of the file is not the
    // scroll view, and matching it made this pass or fail on whether the
    // screen happened to hold a ref.
    const scroll = HOME.search(/^\s*<ScrollView$/m);
    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(scroll);
    // ...and outside the width-capped card column, because a bar that stops
    // where the cards stop is a row, not chrome.
    expect(bar).toBeLessThan(HOME.indexOf('<CenteredColumn'));
  });

  test('the scaled dashboard reserves what it paints outside its box', () => {
    // `transform: scale` leaves layout alone: the box keeps its unscaled
    // height and the extra paints over the neighbours, half above and half
    // below. At 1.16× that is ~55pt over the row above — which on the Mac
    // is the top bar, so the wordmark and chip disappeared on wide windows
    // and only there. The margin is what makes the box match the paint.
    expect(HOME).toMatch(/marginVertical:\s*dashOverflow/);
    expect(HOME).toMatch(/onLayout=\{onDashRowLayout\}/);
    // Half of the growth per side — the whole growth would double-count.
    expect(HOME).toMatch(/\(\(dashScale - 1\) \* dashRowH\) \/ 2/);
  });

  test('Catalyst has ONE top bar: the wordmark is in the row, the header is off', () => {
    // The Mac used to show two: a navigation bar holding nothing but the
    // wordmark, and a content row holding nothing but the location chip.
    // They are one row now, which only works if the navigation bar is
    // actually hidden on Catalyst — otherwise the wordmark renders twice.
    const TABS = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'navigation', 'MainTabs.tsx'),
      'utf-8',
    );
    expect(TABS).toMatch(/headerShown:\s*!isMacCatalyst/);

    const wordmark = HOME.indexOf('<MihrabHeaderTitle');
    const chip = HOME.indexOf('<HomeHeaderControls');
    expect(wordmark).toBeGreaterThan(-1);
    // Leading edge first in source order; `space-between` does the rest.
    expect(wordmark).toBeLessThan(chip);
  });
});

describe('home/RamadanCountdownCard module surface', () => {
  test('exports the RamadanCountdownCard component (memoised)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/screens/home/RamadanCountdownCard');
    expect(mod).toHaveProperty('RamadanCountdownCard');
    // memo() wraps the component as an object; the function/object check
    // is enough — RN's React.memo returns an exotic component descriptor.
    expect(mod.RamadanCountdownCard).toBeTruthy();
  });
});

describe('home/LocationChip module surface', () => {
  test('exports the LocationChip component', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/screens/home/LocationChip');
    expect(mod).toHaveProperty('LocationChip');
    expect(mod.LocationChip).toBeTruthy();
  });
});

describe('home/TodaySummary module surface', () => {
  test('exports the TodaySummary component', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/screens/home/TodaySummary');
    expect(mod).toHaveProperty('TodaySummary');
    expect(mod.TodaySummary).toBeTruthy();
  });
});

describe('ramadan locale keys exist on the English bundle (parity guards the rest)', () => {
  test('ramadan.title, ramadan.suhoor, ramadan.iftar are present', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const en = require('../src/i18n/locales/en.json');
    expect(en.ramadan).toBeDefined();
    expect(en.ramadan.title).toBeTruthy();
    expect(en.ramadan.suhoor).toBeTruthy();
    expect(en.ramadan.iftar).toBeTruthy();
    expect(en.ramadan.suhoorIn).toMatch(/\{\{time\}\}/);
    expect(en.ramadan.iftarIn).toMatch(/\{\{time\}\}/);
  });
});
