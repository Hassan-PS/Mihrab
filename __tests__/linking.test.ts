/**
 * The widget → screen route table.
 *
 * These are the URLs the Swift and Kotlin widget code hard-codes. A rename on
 * either side is silent — the link is accepted, the app comes to the front,
 * and it opens on the wrong screen — so the strings are pinned here.
 */
import { readFileSync } from 'fs';
import path from 'path';

import { getStateFromPath } from '@react-navigation/native';

import { linking, MIHRAB_SCHEME } from '../src/navigation/linking';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

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

  // ── issue #25 ──────────────────────────────────────────────────────

  it('carries a play position alongside the page, not instead of it', () => {
    // The muṣḥaf still has to open on its page. `playFromAyah` says what
    // to recite, which is a different question from what to draw.
    expect(params('mihrab://read/2?initialPage=3&playFromAyah=5')).toMatchObject(
      { surahNumber: 2, initialPage: 3, playFromAyah: 5 },
    );
  });

  it('carries it alongside the ayah in the translation reader too', () => {
    expect(
      params('mihrab://read/7?scrollToAyah=22&playFromAyah=22'),
    ).toMatchObject({ surahNumber: 7, scrollToAyah: 22, playFromAyah: 22 });
  });

  it('leaves a plain read link silent', () => {
    // Every link that existed before this one still opens a page and says
    // nothing. Silence is what a tap has always meant.
    expect(params('mihrab://read/2?initialPage=3')).not.toHaveProperty(
      'playFromAyah',
    );
  });

  it('refuses a play position that is not an ayah', () => {
    // Same guard as every other number in this table: zero is not an
    // ayah, and neither is "abc". A forged link should open a page, not
    // reach the audio queue with a nonsense index.
    for (const bad of ['0', '-3', 'abc', '']) {
      expect(
        params(`mihrab://read/2?initialPage=3&playFromAyah=${bad}`)
          .playFromAyah,
      ).toBeUndefined();
    }
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

  // ── the khatmah's doors, outside the app ───────────────────────────

  it('carries sessionKhatmah as a boolean, not the string "1"', () => {
    // The screen branches on it to claim the visit for the plan. A
    // truthy "0" would make every door the khatmah's.
    const p = params('mihrab://read/3?initialPage=42&sessionKhatmah=1');
    expect(p.sessionKhatmah).toBe(true);
    expect(params('mihrab://read/3?initialPage=42&sessionKhatmah=0').sessionKhatmah)
      .toBe(false);
  });

  it('and a link without it leaves the visit to the marker', () => {
    // The trap this table's own comment warns about: a query key that is
    // not listed in `parse` is dropped in silence. That is what made the
    // widget and the reminder behave unlike the home card.
    expect(params('mihrab://read/2?initialPage=3')).not.toHaveProperty(
      'sessionKhatmah',
    );
  });

  it('both widgets send it, and only with a plan running', () => {
    // The payload carries `khatmah` exactly when the card's position is
    // the plan's own page, so its presence IS the question — and the
    // "play from here" link is the same destination, out loud.
    const kotlin = src(
      'android/app/src/main/java/com/prayer_times/PrayerWidgetReadingProvider.kt',
    );
    expect(kotlin).toMatch(
      /optJSONObject\("khatmah"\) != null\) "&sessionKhatmah=1" else ""/,
    );
    expect(kotlin.match(/\$\{sessionParam\(r\)\}/g) ?? []).toHaveLength(2);
    const swift = src('ios/PrayerWidgetExtension/ReadingWidget.swift');
    expect(swift).toMatch(/r\.khatmah != nil \? "&sessionKhatmah=1" : ""/);
    expect(swift.match(/\\\(sessionParam\(r\)\)/g) ?? []).toHaveLength(2);
  });
});
