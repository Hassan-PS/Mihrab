/**
 * The mushaf must not paint a page colour it is about to contradict.
 *
 * `mushafNightMode` defaults to false, and the stored blob is read
 * asynchronously. Anything that derives a colour from that preference before
 * the read lands paints pure white and then swaps to near-black once the real
 * value arrives — a frame nobody notices on a phone, and a full-window white
 * flash on a 5K Mac Catalyst window, which is how this was reported.
 */
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetQuranStateForTests,
  hydrateQuranState,
  isQuranHydrated,
  useQuranHydrated,
  useQuranState,
} from '../src/quran/quranState';

const STORAGE_KEY = 'mihrab.quran.v1';

/** What `mushafReaderCore` and `QuranSurahScreen` both compute. */
function pageBg(hydrated: boolean, nightMode: boolean): string {
  return !hydrated ? 'transparent' : nightMode ? '#101010' : '#ffffff';
}

describe('mushaf page colour vs. store hydration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetQuranStateForTests();
  });

  it('reports "not hydrated" before the stored blob is read', () => {
    expect(isQuranHydrated()).toBe(false);
  });

  it('never yields white for a user whose stored preference is night mode', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, prefs: { mushafNightMode: true } }),
    );

    const seen: string[] = [];
    function Probe() {
      const hydrated = useQuranHydrated();
      const quran = useQuranState();
      const bg = pageBg(hydrated, quran.prefs.mushafNightMode);
      seen.push(bg);
      return null;
    }

    act(() => {
      create(<Probe />);
    });
    await act(async () => {
      await hydrateQuranState();
    });

    // The whole point: '#ffffff' must never have been on screen.
    expect(seen).not.toContain('#ffffff');
    expect(seen[0]).toBe('transparent');
    expect(seen[seen.length - 1]).toBe('#101010');
  });

  it('still ends on white for a user who has not turned night mode on', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, prefs: { mushafNightMode: false } }),
    );

    const seen: string[] = [];
    function Probe() {
      const hydrated = useQuranHydrated();
      const quran = useQuranState();
      seen.push(pageBg(hydrated, quran.prefs.mushafNightMode));
      return null;
    }

    act(() => {
      create(<Probe />);
    });
    await act(async () => {
      await hydrateQuranState();
    });

    expect(seen[0]).toBe('transparent');
    expect(seen[seen.length - 1]).toBe('#ffffff');
  });

  it('guards the naive version: deriving colour without the flag does flash', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, prefs: { mushafNightMode: true } }),
    );

    const naive: string[] = [];
    function Probe() {
      const quran = useQuranState();
      // The pre-fix expression, kept here so the test proves the flash is
      // real rather than merely asserting the fixed code agrees with itself.
      naive.push(quran.prefs.mushafNightMode ? '#101010' : '#ffffff');
      return null;
    }

    act(() => {
      create(<Probe />);
    });
    await act(async () => {
      await hydrateQuranState();
    });

    expect(naive[0]).toBe('#ffffff');
    expect(naive[naive.length - 1]).toBe('#101010');
  });
});
