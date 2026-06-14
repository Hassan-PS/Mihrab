/**
 * Pure-logic tests for tasks #19–#28 — covers tasbih, hijri events,
 * Ramadan countdown, journal stats, dua/quran indexes, mosque parsing,
 * prayer offsets, and notification action dispatch.
 *
 * These are the algorithmic guarantees each MVP makes — UI flows are tested
 * via manual smoke screens (not automated yet).
 */

import { findPreset, increment, TASBIH_PRESETS } from '../src/tasbih/tasbih';
import {
  findEventOnHijri,
  isLaylatAlQadrCandidate,
  isRamadan,
} from '../src/hijri/events';
import { gregorianToHijri, isHijriLeap, hijriMonthLength } from '../src/hijri/convert';
import { getNextRamadanEvent } from '../src/ramadan/countdown';
import {
  coerceJournalEntries,
  computeCurrentStreak,
  computeStats,
  upsertEntry,
  getEntryStatus,
} from '../src/journal/journal';
import { duasByCategory, findDua, DUAS } from '../src/duas/duas';
import { findSurah, getSurahAyahs, SURAHS } from '../src/quran/quran';
import {
  buildOverpassQuery,
  haversineMeters,
  parseMosqueResponse,
} from '../src/mosques/overpass';
import {
  applyOffsets,
  clampOffset,
  coercePrayerOffsets,
  MAX_OFFSET_MAGNITUDE,
} from '../src/settings/prayerOffsets';
import {
  consumeSilentForPrayer,
  markSilentForPrayer,
} from '../src/notifications/notificationActions';
import { buildLockScreenPayload, isFridayBeforeMaghrib } from '../src/widget/lockScreenPayload';

// ─────────────────────────────────────────────────────────────────────────
// #19 Tasbih
// ─────────────────────────────────────────────────────────────────────────
describe('tasbih', () => {
  test('TASBIH_PRESETS includes the canonical dhikr set', () => {
    const ids = TASBIH_PRESETS.map(p => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'subhanallah', 'alhamdulillah', 'lailaha', 'allahuakbar',
      'astaghfirullah', 'salahonprophet',
    ]));
  });

  test('default targets follow the tasbih convention (33s, then 100s)', () => {
    expect(findPreset('subhanallah').defaultTarget).toBe(33);
    expect(findPreset('alhamdulillah').defaultTarget).toBe(33);
    expect(findPreset('lailaha').defaultTarget).toBe(33);
    expect(findPreset('allahuakbar').defaultTarget).toBe(33);
    expect(findPreset('astaghfirullah').defaultTarget).toBe(100);
    expect(findPreset('salahonprophet').defaultTarget).toBe(100);
  });

  test('increment returns reachedTarget=true exactly once at the boundary', () => {
    expect(increment(32, 33)).toEqual({ count: 33, reachedTarget: true });
    expect(increment(33, 33)).toEqual({ count: 34, reachedTarget: false });
    expect(increment(0, 0).reachedTarget).toBe(false); // open count never reaches
  });

  test('findPreset falls back to first preset for unknown id', () => {
    expect(findPreset('does-not-exist').id).toBe('subhanallah');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #20 Hijri events + conversion
// ─────────────────────────────────────────────────────────────────────────
describe('hijri events + conversion', () => {
  test('isHijriLeap pattern: 11 leap years per 30-year cycle', () => {
    const leap = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
    let count = 0;
    for (let y = 1; y <= 30; y++) if (isHijriLeap(y)) count += 1;
    expect(count).toBe(11);
    for (const y of leap) expect(isHijriLeap(y)).toBe(true);
  });

  test('hijriMonthLength: odd months 30, even 29, dhul-hijjah +1 in leap', () => {
    expect(hijriMonthLength(1, 1)).toBe(30); // Muharram
    expect(hijriMonthLength(1, 2)).toBe(29); // Safar
    expect(hijriMonthLength(1, 12)).toBe(29); // year 1 not leap
    expect(hijriMonthLength(2, 12)).toBe(30); // year 2 IS leap (per cycle)
  });

  test('gregorianToHijri returns sane Hijri date for 2026-04-09', () => {
    const h = gregorianToHijri(new Date(2026, 3, 9));
    // April 9, 2026 falls in Shawwal/Dhul-Qadah 1447 AH per Umm al-Qura.
    expect(h.year).toBeGreaterThanOrEqual(1447);
    expect(h.year).toBeLessThanOrEqual(1448);
    expect(h.month).toBeGreaterThanOrEqual(1);
    expect(h.month).toBeLessThanOrEqual(12);
    expect(h.day).toBeGreaterThanOrEqual(1);
    expect(h.day).toBeLessThanOrEqual(30);
  });

  test('findEventOnHijri matches Eid al-Fitr (1 Shawwal)', () => {
    const event = findEventOnHijri({ year: 1447, month: 10, day: 1 });
    expect(event?.id).toBe('eidAlFitr');
    expect(event?.major).toBe(true);
  });

  test('isRamadan flags month 9 only', () => {
    expect(isRamadan({ year: 1447, month: 9, day: 1 })).toBe(true);
    expect(isRamadan({ year: 1447, month: 8, day: 30 })).toBe(false);
    expect(isRamadan({ year: 1447, month: 10, day: 1 })).toBe(false);
  });

  test('isLaylatAlQadrCandidate: odd nights of last 10 of Ramadan only', () => {
    for (const day of [21, 23, 25, 27, 29]) {
      expect(isLaylatAlQadrCandidate({ year: 1447, month: 9, day })).toBe(true);
    }
    for (const day of [20, 22, 24, 26, 28, 30]) {
      expect(isLaylatAlQadrCandidate({ year: 1447, month: 9, day })).toBe(false);
    }
    expect(isLaylatAlQadrCandidate({ year: 1447, month: 8, day: 27 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #21 Ramadan countdown
// ─────────────────────────────────────────────────────────────────────────
describe('ramadan countdown', () => {
  const TODAY = {
    Imsak: '04:30',
    Fajr: '04:40',
    Sunrise: '06:00',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '18:30',
    Isha: '20:00',
  };

  test('pre-dawn → suhoor', () => {
    const event = getNextRamadanEvent(TODAY, undefined, new Date(2026, 3, 9, 3, 0));
    expect(event?.type).toBe('suhoor');
    expect(event?.at.getHours()).toBe(4);
  });

  test('daytime → iftar', () => {
    const event = getNextRamadanEvent(TODAY, undefined, new Date(2026, 3, 9, 12, 0));
    expect(event?.type).toBe('iftar');
    expect(event?.at.getHours()).toBe(18);
  });

  test('after maghrib → tomorrow suhoor', () => {
    const tomorrow = { ...TODAY, Imsak: '04:28' };
    const event = getNextRamadanEvent(TODAY, tomorrow, new Date(2026, 3, 9, 21, 0));
    expect(event?.type).toBe('suhoor');
    expect(event?.at.getDate()).toBe(10);
  });

  test('returns null when imsak missing', () => {
    expect(getNextRamadanEvent({ ...TODAY, Imsak: undefined as unknown as string }, undefined, new Date())).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #25 Journal
// ─────────────────────────────────────────────────────────────────────────
describe('journal', () => {
  test('upsertEntry replaces existing (date, prayer) record', () => {
    let entries: ReturnType<typeof upsertEntry> = [];
    entries = upsertEntry(entries, '2026-04-09', 'Fajr', 'late');
    entries = upsertEntry(entries, '2026-04-09', 'Fajr', 'on-time');
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('on-time');
  });

  test('computeStats counts each status correctly', () => {
    const entries = [
      { date: '2026-04-09', prayer: 'Fajr' as const, status: 'on-time' as const, loggedAt: '' },
      { date: '2026-04-09', prayer: 'Dhuhr' as const, status: 'late' as const, loggedAt: '' },
      { date: '2026-04-09', prayer: 'Asr' as const, status: 'missed' as const, loggedAt: '' },
    ];
    const s = computeStats(entries);
    expect(s.onTime).toBe(1);
    expect(s.late).toBe(1);
    expect(s.missed).toBe(1);
    expect(s.total).toBe(3);
    expect(s.onTimeRatio).toBeCloseTo(1 / 3);
  });

  test('computeCurrentStreak counts consecutive all-on-time days', () => {
    const allOnTime = (date: string) =>
      (['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const).map(p => ({
        date, prayer: p, status: 'on-time' as const, loggedAt: '',
      }));
    const entries = [
      ...allOnTime('2026-04-09'),
      ...allOnTime('2026-04-08'),
      ...allOnTime('2026-04-07'),
    ];
    const streak = computeCurrentStreak(entries, new Date(2026, 3, 9, 21, 0));
    expect(streak).toBe(3);
  });

  test('coerceJournalEntries drops malformed records', () => {
    expect(coerceJournalEntries('not array')).toEqual([]);
    const dirty = [
      { date: 'bad-date', prayer: 'Fajr', status: 'on-time', loggedAt: '' },
      { date: '2026-04-09', prayer: 'NotAPrayer', status: 'on-time', loggedAt: '' },
      { date: '2026-04-09', prayer: 'Fajr', status: 'INVALID', loggedAt: '' },
      { date: '2026-04-09', prayer: 'Fajr', status: 'on-time', loggedAt: 'now' },
    ];
    const result = coerceJournalEntries(dirty);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-04-09');
  });

  test('getEntryStatus returns the latest status or null', () => {
    let entries: ReturnType<typeof upsertEntry> = [];
    entries = upsertEntry(entries, '2026-04-09', 'Maghrib', 'on-time');
    expect(getEntryStatus(entries, '2026-04-09', 'Maghrib')).toBe('on-time');
    expect(getEntryStatus(entries, '2026-04-09', 'Fajr')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #26 Duas
// ─────────────────────────────────────────────────────────────────────────
describe('duas', () => {
  test('every dua has a non-empty source (religious-content invariant)', () => {
    for (const d of DUAS) {
      expect(d.source.length).toBeGreaterThan(0);
    }
  });

  test('every category has at least one dua', () => {
    for (const cat of ['morning', 'evening', 'afterPrayer', 'food', 'distress'] as const) {
      expect(duasByCategory(cat).length).toBeGreaterThan(0);
    }
  });

  test('findDua roundtrip', () => {
    const first = DUAS[0];
    expect(findDua(first.id)?.id).toBe(first.id);
    expect(findDua('nope')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #27 Quran
// ─────────────────────────────────────────────────────────────────────────
describe('quran', () => {
  test('SURAHS index includes Al-Fatiha as #1', () => {
    expect(SURAHS[0].number).toBe(1);
    expect(SURAHS[0].romanized).toBe('Al-Fatihah');
    expect(SURAHS[0].ayahCount).toBe(7);
  });

  test('Al-Fatiha bundles full Arabic text (7 ayahs)', () => {
    const ayahs = getSurahAyahs(1);
    expect(ayahs?.arabic).toHaveLength(7);
    expect(ayahs?.translation).toHaveLength(7);
    // First ayah is Bismillah.
    expect(ayahs?.arabic[0]).toContain('بِسْمِ');
  });

  test('findSurah returns undefined for out-of-range numbers', () => {
    expect(findSurah(0)).toBeUndefined();
    expect(findSurah(115)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #28 Mosques (Overpass)
// ─────────────────────────────────────────────────────────────────────────
describe('mosques (overpass)', () => {
  test('haversineMeters returns ~1.1 km for 0.01° lat shift at equator', () => {
    const m = haversineMeters(0, 0, 0.01, 0);
    expect(m).toBeGreaterThan(1100);
    expect(m).toBeLessThan(1120);
  });

  test('buildOverpassQuery escapes radius and includes religion=muslim', () => {
    const q = buildOverpassQuery(59.33, 18.07, 5000);
    expect(q).toContain('religion');
    expect(q).toContain('muslim');
    expect(q).toContain('around:5000');
  });

  test('buildOverpassQuery clamps absurd radius', () => {
    const q = buildOverpassQuery(0, 0, 9_999_999);
    expect(q).toContain('around:30000');
  });

  test('parseMosqueResponse picks lat/lon from node OR center, sorts by distance', () => {
    const mosques = parseMosqueResponse(
      {
        elements: [
          { type: 'node', id: 1, lat: 59.33, lon: 18.07, tags: { name: 'Far' } },
          { type: 'way', id: 2, center: { lat: 59.331, lon: 18.071 }, tags: { name: 'Near' } },
        ],
      },
      59.33,
      18.07,
    );
    expect(mosques).toHaveLength(2);
    expect(mosques[0].name).toBe('Far'); // distance 0
    expect(mosques[1].name).toBe('Near');
  });

  test('parseMosqueResponse drops elements without coordinates', () => {
    const mosques = parseMosqueResponse(
      { elements: [{ type: 'relation', id: 1, tags: { name: 'NoCoord' } }] },
      0,
      0,
    );
    expect(mosques).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #22 Prayer offsets
// ─────────────────────────────────────────────────────────────────────────
describe('prayer offsets', () => {
  test('clampOffset bounds to ±MAX_OFFSET_MAGNITUDE', () => {
    expect(clampOffset(0)).toBe(0);
    expect(clampOffset(5)).toBe(5);
    expect(clampOffset(-5)).toBe(-5);
    expect(clampOffset(999)).toBe(MAX_OFFSET_MAGNITUDE);
    expect(clampOffset(-999)).toBe(-MAX_OFFSET_MAGNITUDE);
    expect(clampOffset(NaN)).toBe(0);
    expect(clampOffset(Infinity)).toBe(0);
    expect(clampOffset('5')).toBe(0);
  });

  test('applyOffsets returns identity reference when no offsets', () => {
    const t = { Fajr: '05:00', Dhuhr: '12:00' };
    expect(applyOffsets(t, {})).toBe(t);
  });

  test('applyOffsets shifts only the configured prayers', () => {
    const t = { Fajr: '05:00', Dhuhr: '12:00', Maghrib: '18:00' };
    const out = applyOffsets(t, { Maghrib: 5 });
    expect(out.Fajr).toBe('05:00');
    expect(out.Dhuhr).toBe('12:00');
    expect(out.Maghrib).toBe('18:05');
  });

  test('applyOffsets handles negative offsets and midnight wrap', () => {
    expect(applyOffsets({ Fajr: '00:05' }, { Fajr: -10 }).Fajr).toBe('23:55');
  });

  test('coercePrayerOffsets drops invalid entries silently', () => {
    const out = coercePrayerOffsets({
      Fajr: 5,
      Maghrib: 'huh',
      Bogus: 999,
    });
    expect(out.Fajr).toBe(5);
    expect(out.Maghrib).toBeUndefined();
    expect(('Bogus' in out)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #24 Notification actions
// ─────────────────────────────────────────────────────────────────────────
describe('notification actions', () => {
  test('markSilentForPrayer + consumeSilentForPrayer are one-shot', () => {
    markSilentForPrayer('Fajr');
    expect(consumeSilentForPrayer('Fajr')).toBe(true);
    expect(consumeSilentForPrayer('Fajr')).toBe(false); // already consumed
    expect(consumeSilentForPrayer('Dhuhr')).toBe(false); // unrelated
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #23 Lock-screen payload
// ─────────────────────────────────────────────────────────────────────────
describe('lock-screen payload', () => {
  const today = {
    Fajr: '05:00', Sunrise: '06:00', Dhuhr: '12:00',
    Asr: '15:00', Maghrib: '18:00', Isha: '20:00',
  };

  test('isFridayBeforeMaghrib true on Fri morning, false on Fri evening', () => {
    // 2026-05-08 is a Friday
    expect(isFridayBeforeMaghrib(today, new Date(2026, 4, 8, 10, 0))).toBe(true);
    expect(isFridayBeforeMaghrib(today, new Date(2026, 4, 8, 19, 0))).toBe(false);
    // Saturday — never Jumu'ah
    expect(isFridayBeforeMaghrib(today, new Date(2026, 4, 9, 10, 0))).toBe(false);
  });

  test('buildLockScreenPayload pins the next salah time + flags', () => {
    const p = buildLockScreenPayload(today, new Date(2026, 4, 8, 10, 0), false);
    expect(p.nextName).toBe('Dhuhr');
    expect(p.nextTime).toBe('12:00');
    expect(p.isJumuah).toBe(true);
    expect(p.isRamadan).toBe(false);
  });
});
