/**
 * A prayer you have already recorded does not get told it is late.
 *
 * From #23, and it is a defect rather than a wish: the second-time alerts
 * shipped in 2.15.0 are scheduled from prayer times alone, so someone who
 * prays ʿAṣr at 16:35 and logs it is still told at 18:40 that ʿAṣr's
 * first time has closed, and at sunset that ʿAṣr is now qaḍāʾ. The app is
 * contradicting its own journal, using data it already holds.
 *
 * Two halves, and both are needed. The builders skip a prayer the journal
 * has answered, so a later resync cannot put the alert back; and a
 * journal WRITE drops what is already scheduled, because the next resync
 * might be hours away and the alert might not be.
 */
import {
  buildDaruriAlertEvents,
  buildDaruriEndEvents,
  daruriAnswered,
  localYmd,
} from '../src/prayer/daruriTimes';
import type { TimingsMap } from '../src/types/prayer';

const day = () =>
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
    IshaDaruri: '23:40',
  }) as unknown as TimingsMap;

const BASE = new Date(2026, 8, 4);
const EARLY = new Date(2026, 8, 4, 0, 1);
const TODAY = localYmd(BASE);
const ALL = ['FajrDaruri', 'DhuhrDaruri', 'AsrDaruri', 'MaghribDaruri', 'IshaDaruri'];

describe('the question the schedule now asks', () => {
  it('maps a boundary to the prayer that owns it', () => {
    expect(daruriAnswered({ [TODAY]: ['Asr'] }, TODAY, 'AsrDaruri')).toBe(true);
    expect(daruriAnswered({ [TODAY]: ['Asr'] }, TODAY, 'DhuhrDaruri')).toBe(false);
  });

  it('is per DAY, not "today"', () => {
    // The schedule runs a week ahead, and the backfill button fills days
    // in before they arrive.
    expect(daruriAnswered({ '2026-09-05': ['Asr'] }, TODAY, 'AsrDaruri')).toBe(false);
  });

  it('treats no journal as nothing answered', () => {
    expect(daruriAnswered(undefined, TODAY, 'AsrDaruri')).toBe(false);
    expect(daruriAnswered({}, TODAY, 'AsrDaruri')).toBe(false);
  });
});

describe('the boundary alert', () => {
  it('is scheduled when the prayer is not logged', () => {
    const out = buildDaruriAlertEvents([day()], BASE, ['AsrDaruri'], 0, EARLY);
    expect(out.map(e => e.name)).toContain('AsrDaruri');
  });

  it('is not scheduled once it is', () => {
    const out = buildDaruriAlertEvents([day()], BASE, ['AsrDaruri'], 0, EARLY, {
      [TODAY]: ['Asr'],
    });
    expect(out).toEqual([]);
  });

  it('leaves the other prayers alone', () => {
    const out = buildDaruriAlertEvents([day()], BASE, ALL, 0, EARLY, {
      [TODAY]: ['Asr', 'Fajr'],
    });
    const names = out.map(e => e.name);
    expect(names).not.toContain('AsrDaruri');
    expect(names).not.toContain('FajrDaruri');
    expect(names).toContain('DhuhrDaruri');
    expect(names).toContain('MaghribDaruri');
  });
});

describe('the end-of-window alert', () => {
  it('drops a logged prayer from the pair it shares', () => {
    // Ẓuhr and ʿAṣr expire together at Maghrib. Logging Ẓuhr must not
    // take ʿAṣr's warning with it, and must not leave Ẓuhr's name on it.
    const out = buildDaruriEndEvents(
      [day(), day()],
      BASE,
      ['DhuhrDaruri', 'AsrDaruri'],
      EARLY,
      { [TODAY]: ['Dhuhr'] },
    );
    const atMaghrib = out.filter(
      e => e.at.getHours() === 19 && e.at.getDate() === 4,
    );
    expect(atMaghrib).toHaveLength(1);
    expect(atMaghrib[0].keys).toEqual(['AsrDaruri']);
  });

  it('goes away entirely when both of the pair are logged', () => {
    const out = buildDaruriEndEvents(
      [day(), day()],
      BASE,
      ['DhuhrDaruri', 'AsrDaruri'],
      EARLY,
      { [TODAY]: ['Dhuhr', 'Asr'] },
    );
    expect(
      out.filter(e => e.at.getHours() === 19 && e.at.getDate() === 4),
    ).toHaveLength(0);
  });

  it('still fires for a day that has not been logged', () => {
    // Tomorrow is untouched by today's journal.
    const out = buildDaruriEndEvents(
      [day(), day()],
      BASE,
      ['DhuhrDaruri', 'AsrDaruri'],
      EARLY,
      { [TODAY]: ['Dhuhr', 'Asr'] },
    );
    expect(out.some(e => e.at.getDate() === 5)).toBe(true);
  });
});
