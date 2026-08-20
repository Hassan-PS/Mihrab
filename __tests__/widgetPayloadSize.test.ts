/**
 * The payload has to stay small, and this is the only place that checks.
 *
 * It rides in an Android SharedPreferences string and an iOS App Group
 * plist, both of which are read on the main thread of a process that has
 * milliseconds to live before the system kills it. Nobody notices a payload
 * growing a field at a time until a widget starts rendering blank on a cold
 * launch, and by then the cause is four releases back.
 *
 * The numbers below are budgets, not measurements — if a change pushes past
 * one, the question to answer is which block earned the space.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';
import {
  buildHijriBlock,
  buildPracticeBlock,
  buildReadingBlock,
  buildTasbihBlock,
  buildTodayBlock,
  PRACTICE_WINDOW_DAYS,
} from '../src/widget/widgetBlocks';
import type { JournalEntry } from '../src/journal/journal';
import type { SunnahLog } from '../src/journal/sunnah';
import { TASBIH_PRESETS } from '../src/tasbih/tasbih';

const NOW = new Date(2026, 7, 20, 14, 30);

const TIMINGS = {
  Fajr: '05:10',
  Sunrise: '06:28',
  Dhuhr: '13:12',
  Asr: '16:57',
  Maghrib: '19:56',
  Isha: '21:13',
  Midnight: '00:34',
  Lastthird: '02:22',
};

/** Every day in the window fully logged — the largest a real block gets. */
function busiestPossibleHistory(): {
  journal: JournalEntry[];
  sunnah: SunnahLog;
} {
  const journal: JournalEntry[] = [];
  const sunnah: SunnahLog = {};
  const prayers: Array<JournalEntry['prayer']> = [
    'Fajr',
    'Dhuhr',
    'Asr',
    'Maghrib',
    'Isha',
  ];
  for (let i = 0; i < PRACTICE_WINDOW_DAYS; i++) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const prayer of prayers) {
      journal.push({
        date: key,
        prayer,
        status: i % 7 === 0 ? 'missed' : 'on-time',
        loggedAt: `${key}T12:00:00.000Z`,
      });
    }
    sunnah[key] = {
      fajr: 1,
      dhuhr: 2,
      maghrib: 1,
      isha: 2,
      witr: true,
      qiyam: 1,
    };
  }
  return { journal, sunnah };
}

function fullPayload() {
  const { journal, sunnah } = busiestPossibleHistory();
  const week = Array.from({ length: 7 }, () => TIMINGS);
  return buildWidgetPayload(
    TIMINGS,
    TIMINGS,
    NOW,
    'Makkah, Saudi Arabia',
    { lat: 21.42, lng: 39.83 },
    { jumuah: false, ramadan: false, eid: null },
    week,
    {
      practice: buildPracticeBlock({
        journal,
        fasts: [],
        sunnah,
        streak: 12,
        bestStreak: 31,
        now: NOW,
      }),
      today: buildTodayBlock({ journal, timings: TIMINGS, now: NOW }),
      reading: buildReadingBlock({
        lastRead: {
          surah: 4,
          ayah: 1,
          page: 77,
          mode: 'mushaf',
          updatedAt: NOW.getTime(),
        },
        bookmarks: [],
        khatmah: {
          id: 'k',
          startedAt: NOW.getTime() - 13 * 86_400_000,
          targetDays: 30,
          pagesRead: 46,
          completedAt: null,
        },
        now: NOW,
      })!,
      hijri: buildHijriBlock(NOW),
      tasbih: buildTasbihBlock({
        activeId: TASBIH_PRESETS[0].id,
        counts: Object.fromEntries(TASBIH_PRESETS.map(p => [p.id, 33])),
        todayTotal: 231,
        todayRounds: 6,
      }),
    },
  );
}

describe('payload size', () => {
  it('stays well under what a widget process can read on a cold start', () => {
    const bytes = Buffer.byteLength(JSON.stringify(fullPayload()), 'utf8');
    // Worst case is every day of the window fully logged. 32 KB is the
    // budget; blowing it means a block needs trimming, not a bigger number.
    expect(bytes).toBeLessThan(32 * 1024);
  });

  it('spends most of its size on the practice grid, which is the point', () => {
    const full = fullPayload();
    const whole = Buffer.byteLength(JSON.stringify(full), 'utf8');
    const withoutPractice = Buffer.byteLength(
      JSON.stringify({ ...full, practice: undefined }),
      'utf8',
    );
    // Everything except the history is small enough to be uninteresting.
    expect(withoutPractice).toBeLessThan(6 * 1024);
    expect(whole).toBeGreaterThan(withoutPractice);
  });
});

describe('what the native side actually receives', () => {
  it('round-trips every block through JSON unchanged', () => {
    const full = fullPayload();
    const parsed = JSON.parse(JSON.stringify(full));
    // The wire format is the contract; anything that does not survive
    // stringify is a field the renderers will never see.
    expect(parsed.practice.streak).toBe(12);
    expect(parsed.practice.days.length).toBe(PRACTICE_WINDOW_DAYS);
    expect(parsed.today.prayers).toHaveLength(5);
    expect(parsed.reading.khatmah.targetDays).toBe(30);
    expect(parsed.hijri.nextMonthInDays).toBeGreaterThan(0);
    expect(parsed.tasbih.counts).toHaveLength(TASBIH_PRESETS.length);
    expect(parsed.tasbih.todayTotal).toBe(231);
  });

  it('omits a block entirely when the app has nothing to say', () => {
    // An absent block must be ABSENT, not present-and-zero: a renderer
    // that sees `practice: {streak: 0}` draws a zero streak, which is a
    // claim about the user. Absent means "do not draw the section".
    const bare = buildWidgetPayload(TIMINGS, TIMINGS, NOW);
    const wire = JSON.parse(JSON.stringify(bare));
    expect('practice' in wire).toBe(false);
    expect('today' in wire).toBe(false);
    expect('reading' in wire).toBe(false);
    expect('hijri' in wire).toBe(false);
    expect('tasbih' in wire).toBe(false);
    // And the prayer times still arrive, which is the whole job.
    expect(wire.rows).toHaveLength(5);
  });

  it('still builds when only some blocks are supplied', () => {
    const partial = buildWidgetPayload(
      TIMINGS,
      TIMINGS,
      NOW,
      undefined,
      undefined,
      undefined,
      undefined,
      { hijri: buildHijriBlock(NOW) },
    );
    const wire = JSON.parse(JSON.stringify(partial));
    expect(wire.hijri.day).toBeGreaterThan(0);
    expect('practice' in wire).toBe(false);
  });
});
