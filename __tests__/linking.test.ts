/**
 * The widget → screen route table.
 *
 * These are the URLs the Swift and Kotlin widget code hard-codes. A rename on
 * either side is silent — the link is accepted, the app comes to the front,
 * and it opens on the wrong screen — so the strings are pinned here.
 */
import { getStateFromPath } from '@react-navigation/native';

import { linking, MIHRAB_SCHEME } from '../src/navigation/linking';

/** What `linking` hands React Navigation, for a given mihrab:// URL. */
function stateFor(url: string) {
  const path = url.replace(MIHRAB_SCHEME, '');
  return getStateFromPath(path, linking.config);
}

/** The deepest route name in a nested navigation state. */
function leaf(state: ReturnType<typeof getStateFromPath>): string | undefined {
  let cur = state;
  let name: string | undefined;
  while (cur?.routes?.length) {
    const route = cur.routes[cur.routes.length - 1];
    name = route.name;
    cur = route.state as typeof cur;
  }
  return name;
}

/** Params of the deepest route. */
function params(url: string): Record<string, unknown> {
  const state = stateFor(url);
  let cur = state;
  let p: Record<string, unknown> = {};
  while (cur?.routes?.length) {
    const route = cur.routes[cur.routes.length - 1];
    p = (route.params as Record<string, unknown>) ?? {};
    cur = route.state as typeof cur;
  }
  return p;
}

describe('mihrab:// route table', () => {
  it('opens the Log', () => {
    expect(leaf(stateFor('mihrab://log'))).toBe('LogTab');
  });

  it('opens the Quran tab', () => {
    expect(leaf(stateFor('mihrab://quran'))).toBe('QuranTab');
  });

  it('opens a surah at a mushaf page', () => {
    expect(leaf(stateFor('mihrab://read/2?initialPage=3'))).toBe('QuranSurah');
    expect(params('mihrab://read/2?initialPage=3')).toMatchObject({
      surahNumber: 2,
      initialPage: 3,
    });
  });

  it('opens a surah at an ayah in the translation reader', () => {
    expect(params('mihrab://read/4?scrollToAyah=12')).toMatchObject({
      surahNumber: 4,
      scrollToAyah: 12,
    });
  });

  it('parses the numbers as numbers, not strings', () => {
    // The screen indexes arrays with these. "2" would silently miss.
    const p = params('mihrab://read/2?initialPage=3');
    expect(typeof p.surahNumber).toBe('number');
    expect(typeof p.initialPage).toBe('number');
  });

  it('refuses a surah number that is not one', () => {
    expect(params('mihrab://read/0').surahNumber).toBeUndefined();
  });
});
