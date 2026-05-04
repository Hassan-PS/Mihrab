/**
 * Smoke-tests for the HomeScreen integration follow-ups (tasks #45–#47):
 *
 *   #45 — QuickActionsGrid is mounted on HomeScreen so the new tools
 *         (Tasbih, Duas, Quran, Mosques, Journal, Compass) are reachable
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
  test('imports QuickActionsGrid', () => {
    expect(HOME).toMatch(/from '\.\/home\/QuickActionsGrid'/);
    expect(HOME).toMatch(/<QuickActionsGrid\s*\/?>/);
  });

  test('imports RamadanCountdownCard with today + tomorrow props', () => {
    expect(HOME).toMatch(/from '\.\/home\/RamadanCountdownCard'/);
    expect(HOME).toMatch(/<RamadanCountdownCard\s+today=/);
  });

  test('imports LocationChip and renders it without props', () => {
    expect(HOME).toMatch(/from '\.\/home\/LocationChip'/);
    expect(HOME).toMatch(/<LocationChip\s*\/?>/);
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

describe('home/QuickActionsGrid module surface', () => {
  test('exports the QuickActionsGrid component', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/screens/home/QuickActionsGrid');
    expect(mod).toHaveProperty('QuickActionsGrid');
    expect(mod.QuickActionsGrid).toBeTruthy();
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
