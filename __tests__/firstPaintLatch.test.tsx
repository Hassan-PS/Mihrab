/**
 * The boot-time bookkeeping waits for the first frame, and nothing else
 * changes about it.
 *
 * A cold start measured 87 ms between the Today card's first ready
 * commit and the next animation frame, with the JS thread spent on the
 * alert schedule, two reminder sets, the widget payload and the Live
 * Activity — none of it visible, all of it in the frame the reader was
 * waiting for. `src/boot/firstPaint.ts` is the latch that moves it one
 * frame later. These pin the latch's contract and who is behind it.
 */
import * as React from 'react';
import { act } from 'react';
import { create } from 'react-test-renderer';
import { readFileSync } from 'fs';
import path from 'path';

import {
  _resetFirstPaintForTests,
  afterFirstPaint,
  FIRST_PAINT_FALLBACK_MS,
  firstPaintDone,
  markFirstPaint,
  useAfterFirstPaint,
} from '../src/boot/firstPaint';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

beforeEach(() => {
  jest.useFakeTimers();
  _resetFirstPaintForTests();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the latch', () => {
  it('resolves when the first paint is marked, and stays resolved', async () => {
    let resolved = false;
    void afterFirstPaint().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(firstPaintDone()).toBe(false);
    markFirstPaint();
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(firstPaintDone()).toBe(true);
    // A second mark is nothing; a late waiter is answered at once.
    markFirstPaint();
    let late = false;
    void afterFirstPaint().then(() => {
      late = true;
    });
    await Promise.resolve();
    expect(late).toBe(true);
  });

  it('gives up waiting on its own if no first paint ever comes', async () => {
    // Onboarding, a location error, a Mac with nothing set — launches
    // that never reach a ready Today card. The alerts must still be
    // scheduled on those launches, just as they were before the latch.
    let resolved = false;
    void afterFirstPaint().then(() => {
      resolved = true;
    });
    jest.advanceTimersByTime(FIRST_PAINT_FALLBACK_MS - 1);
    await Promise.resolve();
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('arms the fallback only once somebody waits', () => {
    // A module that starts a timer when it loads owns a timer in every
    // process that imports it — headless tasks, tests. This one starts
    // when it is first asked, and not before.
    expect(jest.getTimerCount()).toBe(0);
    void afterFirstPaint();
    expect(jest.getTimerCount()).toBe(1);
    void afterFirstPaint();
    expect(jest.getTimerCount()).toBe(1);
  });
});

describe('the hook', () => {
  function Probe({ seen }: { seen: boolean[] }) {
    seen.push(useAfterFirstPaint());
    return null;
  }

  it('is false, then true once, then never re-renders for it', async () => {
    const seen: boolean[] = [];
    act(() => {
      create(<Probe seen={seen} />);
    });
    expect(seen).toEqual([false]);
    await act(async () => {
      markFirstPaint();
      await Promise.resolve();
    });
    expect(seen).toEqual([false, true]);
  });

  it('is true at once for something that mounts after the paint', () => {
    markFirstPaint();
    const seen: boolean[] = [];
    act(() => {
      create(<Probe seen={seen} />);
    });
    expect(seen).toEqual([true]);
  });
});

describe('what is behind it', () => {
  const home = src('src/screens/HomeScreen.tsx');
  const root = src('src/AppNavigationRoot.tsx');

  it('is marked by the Today card one frame after its first ready commit', () => {
    // Committed is not painted. The mark waits an animation frame and a
    // tick past the commit, so "after the first paint" means after it.
    expect(home).toMatch(
      /const frame = requestAnimationFrame\(\(\) => \{[\s\S]*?timer = setTimeout\(markFirstPaint, 0\);/,
    );
  });

  it('holds the alert schedule, the widget payload and the Live Activity', () => {
    // Four gates in HomeScreen: the effect that reschedules alerts and
    // reminders, the widget publish, the Live Activity sync, and the
    // focus-time resync. Each returns before doing anything until the
    // paint has happened, and each lists the latch in its deps so it
    // runs when it does.
    expect(home.match(/if \(!afterFirstPaint\) return;/g)).toHaveLength(4);
    expect(home.match(/^\s+afterFirstPaint,$/gm)).toHaveLength(4);
  });

  it('holds the widget-queue drain and the daily reminder rebuild at launch', () => {
    expect(root).toContain('void afterFirstPaint().then(drain);');
    expect(root).toMatch(/void afterFirstPaint\(\)\.then\(\(\) => \{\s*if \(live\) sync\(true\);/);
  });

  it('does not hold the foreground paths', () => {
    // Coming back to the app is not a cold start: the card is already
    // drawn, and the resync on foreground runs at once, as it always did.
    expect(root).toMatch(/if \(state === 'active'\) drain\(\);/);
    expect(root).toMatch(/if \(state === 'active'\) sync\(false\);/);
  });
});
