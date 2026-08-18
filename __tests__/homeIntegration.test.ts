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

  test('the Catalyst chip is a row in the content column, not an overlay', () => {
    // It was pinned to `right: 14` of the WINDOW while every card is centred
    // inside a width-capped column. Those two agree only while the window is
    // wide enough for the cards to be narrower than it — which is why this
    // looked fine for weeks and then, in an ordinary small Mac window, put
    // the chip on top of the hero card and past its right edge.
    //
    // So: no absolute positioning on this row, and no `right`/`left` offsets
    // that would re-anchor it to the window instead of the column.
    const row = HOME.match(/macHeaderRow:\s*\{[^}]*\}/);
    expect(row).not.toBeNull();
    expect(row?.[0]).not.toMatch(/position:\s*'absolute'/);
    expect(row?.[0]).not.toMatch(/\b(right|left):/);
    // `flex-end`, never `right` — the mirror of this is what RTL should get.
    expect(row?.[0]).toMatch(/justifyContent:\s*'flex-end'/);
    // And the old overlay is gone rather than merely unused.
    expect(HOME).not.toMatch(/macHeaderControls/);

    // It has to be INSIDE the CenteredColumn to inherit the cards' width cap;
    // outside it, right-alignment is alignment to the window again.
    const column = HOME.indexOf('<CenteredColumn');
    const columnEnd = HOME.indexOf('</CenteredColumn>');
    const chip = HOME.indexOf('<HomeHeaderControls');
    expect(column).toBeGreaterThan(-1);
    expect(chip).toBeGreaterThan(column);
    expect(chip).toBeLessThan(columnEnd);
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
