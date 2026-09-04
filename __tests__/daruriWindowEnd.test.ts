/**
 * The far end of the Mālikī second window — issue #19.
 *
 * The alert that already existed answers "your preferred time is over";
 * the reporter asked for the one after it, in as many words: *"I would
 * also love to add the end of it as a QOL improvement so I can know when
 * the prayer is considered missed and I should pray qadhaa'."*
 *
 * Nothing is computed for it. `daruriTimes.ts` has said from the start
 * that each window closes on a time the card already carries — Fajr's at
 * sunrise, Ẓuhr's and ʿAṣr's at Maghrib, Maghrib's and Ishāʾ's at the
 * next Fajr. The two things worth pinning are the consequences of that
 * shape: four of the five expire in PAIRS, and two of them expire on a
 * day the cached week may not reach.
 */
import {
  buildDaruriEndEvents,
  daruriWindowEnd,
  DARURI_END_OF,
  DARURI_KEYS,
} from '../src/prayer/daruriTimes';
import type { TimingsMap } from '../src/types/prayer';

const day = (over: Partial<Record<string, string>> = {}) =>
  ({
    Fajr: '04:30',
    Sunrise: '06:10',
    Dhuhr: '13:00',
    Asr: '16:30',
    Maghrib: '19:50',
    Isha: '21:30',
    FajrDaruri: '05:20',
    DhuhrDaruri: '16:30',
    AsrDaruri: '18:40',
    MaghribDaruri: '20:20',
    IshaDaruri: '00:20',
    ...over,
  }) as unknown as TimingsMap;

const BASE = new Date(2026, 8, 4);
const before = new Date(2026, 8, 4, 0, 1);

describe('where each window closes', () => {
  it('names a row the card already has, never a computed angle', () => {
    for (const key of DARURI_KEYS) {
      expect(['Sunrise', 'Maghrib', 'Fajr']).toContain(DARURI_END_OF[key].row);
    }
  });

  it('Fajr ends at sunrise, the same day', () => {
    const at = daruriWindowEnd([day(), day()], BASE, 0, 'FajrDaruri');
    expect(at?.getHours()).toBe(6);
    expect(at?.getMinutes()).toBe(10);
    expect(at?.getDate()).toBe(4);
  });

  it('Dhuhr and Asr both end at Maghrib', () => {
    const week = [day(), day()];
    const d = daruriWindowEnd(week, BASE, 0, 'DhuhrDaruri');
    const a = daruriWindowEnd(week, BASE, 0, 'AsrDaruri');
    expect(d?.getTime()).toBe(a?.getTime());
    expect(d?.getHours()).toBe(19);
    expect(d?.getMinutes()).toBe(50);
  });

  it('Maghrib and Isha end at TOMORROW’s Fajr', () => {
    const week = [day(), day({ Fajr: '04:32' })];
    const m = daruriWindowEnd(week, BASE, 0, 'MaghribDaruri');
    expect(m?.getDate()).toBe(5);
    expect(m?.getHours()).toBe(4);
    expect(m?.getMinutes()).toBe(32);
    expect(daruriWindowEnd(week, BASE, 0, 'IshaDaruri')?.getTime()).toBe(
      m?.getTime(),
    );
  });

  it('says nothing when the answer is off the end of the week', () => {
    // The last cached day cannot answer for Maghrib or Isha, and a
    // "your prayer has expired" placed by guesswork is worse than none.
    expect(daruriWindowEnd([day()], BASE, 0, 'MaghribDaruri')).toBeNull();
    expect(daruriWindowEnd([day()], BASE, 0, 'IshaDaruri')).toBeNull();
    // Fajr's end is on its own day, so one day is enough for it.
    expect(daruriWindowEnd([day()], BASE, 0, 'FajrDaruri')).not.toBeNull();
  });

  it('says nothing when the row it needs is missing', () => {
    const noSunrise = [day({ Sunrise: undefined as unknown as string })];
    expect(daruriWindowEnd(noSunrise, BASE, 0, 'FajrDaruri')).toBeNull();
  });
});

describe('the events that get scheduled', () => {
  it('are silent until a boundary is chosen', () => {
    expect(buildDaruriEndEvents([day(), day()], BASE, [], before)).toEqual([]);
    // A list of things that are not boundaries is still nothing.
    expect(
      buildDaruriEndEvents([day(), day()], BASE, ['Nonsense'], before),
    ).toEqual([]);
  });

  it('put the pair that expires together in ONE event', () => {
    const out = buildDaruriEndEvents(
      [day(), day()],
      BASE,
      ['DhuhrDaruri', 'AsrDaruri'],
      before,
    );
    // One event that day, not two — the whole point of grouping.
    const atMaghrib = out.filter(
      e => e.at.getHours() === 19 && e.at.getDate() === 4,
    );
    expect(atMaghrib).toHaveLength(1);
    expect(atMaghrib[0].keys).toEqual(['DhuhrDaruri', 'AsrDaruri']);
  });

  it('keep the prayers in the order the day runs', () => {
    const out = buildDaruriEndEvents(
      [day(), day()],
      BASE,
      ['AsrDaruri', 'DhuhrDaruri'],
      before,
    );
    expect(out[0].keys).toEqual(['DhuhrDaruri', 'AsrDaruri']);
  });

  it('never look backwards', () => {
    const afterSunrise = new Date(2026, 8, 4, 7, 0);
    const out = buildDaruriEndEvents(
      [day(), day()],
      BASE,
      ['FajrDaruri'],
      afterSunrise,
    );
    expect(out.every(e => e.at > afterSunrise)).toBe(true);
  });

  it('come back in time order', () => {
    const out = buildDaruriEndEvents(
      [day(), day(), day()],
      BASE,
      [...DARURI_KEYS],
      before,
    );
    const times = out.map(e => e.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(out.length).toBeGreaterThan(1);
  });
});
