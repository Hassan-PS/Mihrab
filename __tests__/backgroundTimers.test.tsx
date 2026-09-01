/**
 * Timers stop when nobody is looking.
 *
 * Three screens ran repeating timers gated on `useIsFocused()` — or on
 * nothing at all — and every one of them kept firing with the app in the
 * user's pocket, because navigation focus is not app foreground. The worst
 * was the Home countdown: a state update and a hero re-render once a second,
 * indefinitely, on the app's default tab (docs/design/background-power.md).
 *
 * `useIsActive()` is focus AND foreground. These tests pin the behaviour that
 * makes it worth having: the timer stops on background, and comes back
 * CAUGHT UP rather than a tick behind, because a countdown that resumes
 * showing the time it was at when you pocketed the phone is worse than one
 * that stopped.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';

let mockAppState = 'active';
const mockListeners = new Set<(s: string) => void>();
let mockFocused = true;

// Mock the AppState MODULE, not all of react-native: `react-native`'s index
// re-exports it through a lazy getter, so this is enough — and spreading
// requireActual('react-native') eagerly touches every native module in the
// package, which throws before a single test runs.
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  // `__esModule` + `default`: react-native's index reaches this module through
  // `require(...).default`, so a bare object arrives as undefined.
  __esModule: true,
  default: {
    get currentState() {
      return mockAppState;
    },
    addEventListener: (_type: string, cb: (s: string) => void) => {
      mockListeners.add(cb);
      return { remove: () => mockListeners.delete(cb) };
    },
  },
}));

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));

import { useIsActive } from '../src/hooks/useIsActive';

function setAppState(next: string) {
  mockAppState = next;
  for (const cb of mockListeners) cb(next);
}

/** Ticks once a second while active, exactly like the Home countdown. */
const ticks: number[] = [];
function Probe() {
  const active = useIsActive();
  React.useEffect(() => {
    if (!active) return undefined;
    ticks.push(Date.now());
    const id = setInterval(() => ticks.push(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAppState = 'active';
  mockFocused = true;
  mockListeners.clear();
  ticks.length = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

test('the timer stops when the app goes to the background, focused or not', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe />);
  });
  expect(ticks).toHaveLength(1); // the immediate one

  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(ticks).toHaveLength(4);

  // Pocketed. The route is STILL focused — this is the exact condition the
  // old `useIsFocused()` gate got wrong.
  await act(async () => {
    setAppState('background');
  });
  const atSleep = ticks.length;

  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  expect(ticks).toHaveLength(atSleep); // a full minute, not one tick

  tree.unmount();
});

test('coming back to the foreground catches up immediately', async () => {
  await act(async () => {
    create(<Probe />);
  });
  await act(async () => {
    setAppState('background');
  });
  const atSleep = ticks.length;

  await act(async () => {
    setAppState('active');
  });
  // One extra tick straight away, before any interval has elapsed.
  expect(ticks.length).toBe(atSleep + 1);
});

test("iOS's transitional 'inactive' does not stop the clock", async () => {
  // The app switcher, Control Centre, a permission sheet. Treating these as
  // background would stop and restart the countdown every time someone
  // glanced at the top of the screen.
  await act(async () => {
    create(<Probe />);
  });
  await act(async () => {
    setAppState('inactive');
  });
  const atInactive = ticks.length;
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(ticks.length).toBeGreaterThan(atInactive);
});

test('losing navigation focus stops it too', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe />);
  });
  mockFocused = false;
  await act(async () => {
    tree.update(<Probe />);
  });
  const atBlur = ticks.length;
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(ticks).toHaveLength(atBlur);
});

describe('the screens that had the bug use the hook', () => {
  const read = (p: string) =>
    fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

  test.each([
    ['src/screens/home/TodayCard.tsx', 'the 1 Hz Home countdown'],
    ['src/screens/HomeScreen.tsx', 'the 30 s day/timezone watchdog'],
    ['src/screens/home/RamadanCountdownCard.tsx', 'the 30 s Ramadan card'],
    ['src/screens/CompassScreen.tsx', 'the 10 Hz magnetometer'],
  ])('%s — %s', file => {
    const src = read(file);
    expect(src).toMatch(/useIsActive/);
    // And none of them IMPORTS navigation focus any more, which is what
    // gating on it alone required. (Prose about the old bug is fine.)
    expect(src).not.toMatch(/import \{[^}]*\buseIsFocused\b/);
  });
});

test('the compass sensor is gated on being on screen, not just set up', () => {
  // `sensorEnabled` decided whether to subscribe the magnetometer at 10 Hz
  // and run a 600 ms watchdog. It used to be `hydrated && !needsGpsPrime` —
  // true forever once the tab had been opened, because the hook only tears
  // down on unmount and `enableFreeze(false)` means the screen never
  // unmounts. So the sensor ran in the user's pocket overnight.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src/screens/CompassScreen.tsx'),
    'utf-8',
  );
  expect(src).toMatch(/const sensorEnabled =[^;]*compassActive/s);

  // And the hook still keys its whole effect on that flag, which is what
  // makes the teardown happen at all.
  const hook = fs.readFileSync(
    path.join(__dirname, '..', 'src/screens/compass/useCompassSensor.ts'),
    'utf-8',
  );
  expect(hook).toMatch(/if \(!enabled\) return undefined;/);
  // The deps grew coordinates when Android started correcting magnetic
  // north to true north, and the point of the assertion is `enabled` —
  // that is what tears the subscription down. Moving location must
  // restart it too, so extra deps are correct, not a regression.
  expect(hook).toMatch(/\}, \[enabled(?:, [a-zA-Z]+)*\]\);/);
});
