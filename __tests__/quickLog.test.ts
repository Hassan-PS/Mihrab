/**
 * The check beside each prayer on Today — what one tap records.
 *
 * The status is the clock's, not a guess: on time inside the prayer's
 * window, late after it, nothing before it. See src/journal/quickLog.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isSalah,
  passedPrayerAnswers,
  quickLogPhase,
  quickLogStatus,
  SALAH,
} from '../src/journal/quickLog';
import { LOGGABLE_STATUSES } from '../src/journal/journal';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const day = {
  Fajr: '04:30',
  Sunrise: '06:10',
  Dhuhr: '12:50',
  Asr: '16:20',
  Maghrib: '19:40',
  Isha: '21:45',
};
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2026, 8, 8, h, m, 0, 0);
  return d;
};

describe('the window', () => {
  it('is closed before the prayer, open until the next event, late after', () => {
    expect(quickLogPhase('Dhuhr', day, at('12:00'))).toBe('not-yet');
    expect(quickLogPhase('Dhuhr', day, at('12:50'))).toBe('in-window');
    expect(quickLogPhase('Dhuhr', day, at('16:19'))).toBe('in-window');
    expect(quickLogPhase('Dhuhr', day, at('16:20'))).toBe('after-window');
    expect(quickLogStatus('Dhuhr', day, at('13:00'))).toBe('on-time');
    expect(quickLogStatus('Dhuhr', day, at('17:00'))).toBe('ask');
    expect(quickLogStatus('Dhuhr', day, at('12:00'))).toBeNull();
  });

  it("Fajr's window ends at sunrise, not at Dhuhr", () => {
    expect(quickLogStatus('Fajr', day, at('06:00'))).toBe('on-time');
    expect(quickLogStatus('Fajr', day, at('06:30'))).toBe('ask');
  });

  it("Isha's window runs to tomorrow's Fajr when it is known, else to midnight", () => {
    const tomorrow = { ...day, Fajr: '04:32' };
    // 23:30 is inside either way.
    expect(quickLogStatus('Isha', day, at('23:30'), tomorrow)).toBe('on-time');
    expect(quickLogStatus('Isha', day, at('23:30'))).toBe('on-time');
    // 01:00 the next morning: `now` is the next day, so Isha's own time is
    // ahead of it — the row for that Isha is on yesterday's card, which
    // the Log owns. Today's Isha has not come.
    const oneAm = new Date(2026, 8, 9, 1, 0);
    expect(quickLogStatus('Isha', day, oneAm, tomorrow)).toBeNull();
  });

  it('treats a window the data puts before its own start as open', () => {
    const odd = { ...day, Sunrise: '04:00' }; // sunrise before Fajr: broken feed / polar
    expect(quickLogStatus('Fajr', odd, at('05:00'))).toBe('on-time');
  });

  /**
   * The window belongs to the DAY OF THE CARD. Turned back to yesterday
   * at breakfast, every prayer on it has come — except its Isha, which
   * runs until this morning's Fajr and is still open before it.
   */
  it('reads the window against the card’s day, not the clock’s', () => {
    const yesterday = new Date(2026, 8, 7);
    const tomorrowDay = new Date(2026, 8, 9);
    // 04:00 on the 8th, looking at the 7th: Isha still open, the rest passed.
    const early = new Date(2026, 8, 8, 4, 0);
    expect(quickLogPhase('Isha', day, early, day, yesterday)).toBe('in-window');
    expect(quickLogPhase('Maghrib', day, early, day, yesterday)).toBe('after-window');
    expect(quickLogPhase('Fajr', day, early, day, yesterday)).toBe('after-window');
    // Noon on the 8th, looking at the 7th: everything has passed.
    expect(quickLogPhase('Isha', day, at('12:00'), day, yesterday)).toBe('after-window');
    // Looking at the 9th: nothing has come, whatever the hour.
    expect(quickLogPhase('Fajr', day, at('23:00'), day, tomorrowDay)).toBe('not-yet');
  });

  it('records on time inside the window and ASKS once it has closed', () => {
    expect(quickLogStatus('Dhuhr', day, at('13:00'))).toBe('on-time');
    expect(quickLogStatus('Dhuhr', day, at('17:00'))).toBe('ask');
    expect(quickLogStatus('Dhuhr', day, at('12:00'))).toBeNull();
    const yesterday = new Date(2026, 8, 7);
    expect(quickLogStatus('Dhuhr', day, at('12:00'), day, yesterday)).toBe('ask');
  });

  /**
   * The Mālikī second times split the same window in two — issue #40.
   *
   * The boundaries ride in the day's timings under `<Prayer>Daruri`,
   * which is how a table that has them differs from one that does not:
   * there is no setting to read here, only a day that carries them.
   */
  describe('with the second times on', () => {
    const maliki = {
      ...day,
      FajrDaruri: '05:30', // isfār, before sunrise
      DhuhrDaruri: '15:10',
      AsrDaruri: '18:30',
      MaghribDaruri: '20:20',
      IshaDaruri: '00:40', // past midnight, and still Ishāʾ's
    };

    it('is on time in the first half, and asks in the second', () => {
      expect(quickLogPhase('Dhuhr', maliki, at('13:00'))).toBe('in-window');
      expect(quickLogPhase('Dhuhr', maliki, at('15:10'))).toBe('after-first');
      expect(quickLogPhase('Dhuhr', maliki, at('16:19'))).toBe('after-first');
      expect(quickLogPhase('Dhuhr', maliki, at('16:20'))).toBe('after-window');
      // One tap still records without asking while the first time runs.
      expect(quickLogStatus('Dhuhr', maliki, at('13:00'))).toBe('on-time');
      expect(quickLogStatus('Dhuhr', maliki, at('15:30'))).toBe('ask');
    });

    it('offers the first time or after it, and nothing that has not happened', () => {
      // Inside the second window the prayer can still be prayed in its
      // own time: nothing is missed and nothing is qaḍāʾ yet.
      expect(passedPrayerAnswers('after-first')).toEqual(['on-time', 'late']);
    });

    it('offers all four once the whole window has gone', () => {
      expect(passedPrayerAnswers('after-window')).toEqual([
        'on-time',
        'late',
        'missed',
        'qadha',
      ]);
      expect(passedPrayerAnswers('after-window')).toEqual(LOGGABLE_STATUSES);
    });

    it('asks nothing where there is nothing to ask', () => {
      expect(passedPrayerAnswers('in-window')).toEqual([]);
      expect(passedPrayerAnswers('not-yet')).toEqual([]);
    });

    it("carries Ishāʾ's boundary over midnight, as the row and the alerts do", () => {
      // 23:00 is before 00:40, which belongs to the next date — not
      // "already past" because 00:40 reads as earlier in the day.
      expect(quickLogPhase('Isha', maliki, at('23:00'), day)).toBe('in-window');
      const pastMidnight = new Date(2026, 8, 9, 1, 0);
      expect(
        quickLogPhase('Isha', maliki, pastMidnight, day, new Date(2026, 8, 8)),
      ).toBe('after-first');
    });

    it('ignores a boundary that falls outside the window it would divide', () => {
      // A modelled angle at a high latitude can land past sunrise. A
      // window is not split by a line drawn outside it.
      const odd = { ...maliki, FajrDaruri: '07:00' }; // after sunrise
      expect(quickLogPhase('Fajr', odd, at('06:30'))).toBe('after-window');
      expect(quickLogPhase('Fajr', odd, at('05:00'))).toBe('in-window');
    });

    it('leaves a table without the boundaries exactly as it was', () => {
      // Everyone else: one window, and all four answers once it closes.
      expect(quickLogPhase('Dhuhr', day, at('15:10'))).toBe('in-window');
      expect(quickLogPhase('Dhuhr', day, at('16:20'))).toBe('after-window');
    });
  });

  it('knows the five', () => {
    expect(SALAH).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    expect(isSalah('Sunrise')).toBe(false);
    expect(isSalah('Asr')).toBe(true);
  });
});

describe('the row and the card', () => {
  const row = read('src/screens/home/PrayerRow.tsx');
  const card = read('src/screens/home/TodayCard.tsx');
  const check = read('src/screens/home/LogCheck.tsx');
  const quick = read('src/journal/quickLog.ts');

  it('holds the check slot on loggable rows only, so names line up there and nowhere else', () => {
    expect(row).toMatch(/<LogCheck[\s\S]*?\/>\s*\) : hasCheckColumn \? \(\s*<View style=\{styles\.checkSlot\} \/>\s*\) : null\}/);
    expect(row).toMatch(/checkSlot: \{ width: LOG_CHECK_SIZE, marginEnd: SPACING\.md \}/);
    expect(card).toMatch(/hasCheckColumn=\{loggable\}/);
  });

  it('offers the check on today’s and the past days’ salāh, never on a day ahead', () => {
    expect(card).toMatch(/const isToday = offset === 0;/);
    expect(card).toMatch(/const isPast = offset < 0;/);
    expect(card).toMatch(/const loggable = isToday \|\| isPast;/);
    expect(card).toMatch(/loggable && isSalah\(key\)/);
    // The tap goes through the card's handler, which opens the question
    // when the model says 'ask'.
    expect(card).toMatch(/toggleLog\(key, dayTimings, offset\)/);
    expect(card).toMatch(/if \(outcome !== 'ask'\) return;/);
    expect(card).toMatch(/setQuestion\(\{\s*prayer,\s*offset,/);
  });

  it('asks with the answers the moment allows, and a way out', () => {
    // Which ones is `passedPrayerAnswers`' to say (#40) — the sheet draws
    // what it is handed rather than a set of its own.
    const sheet = read('src/screens/home/LogPassedPrayerSheet.tsx');
    expect(sheet).toMatch(/\(question\?\.answers \?\? \[\]\)\.map\(status =>/);
    expect(sheet).not.toMatch(/const ANSWERS/);
    expect(sheet).toMatch(/common\.cancel/);
    expect(quick).toMatch(/PassedPrayerAnswer = LoggedStatus/);
  });

  it('is a checkbox that says so before its time, rather than doing nothing', () => {
    // It is announced as disabled and drawn at a whisper, but it TAKES the
    // press and the card answers it — a ring that looks live and does
    // nothing was reported as a broken button. The unread journal is the
    // one state that takes no press: there is nothing to answer with.
    expect(check).toMatch(/accessibilityRole="checkbox"/);
    expect(check).toMatch(/accessibilityState=\{\{ checked: logged, disabled: notYet \}\}/);
    expect(check).toMatch(/disabled=\{!ready\}/);
    expect(card).toMatch(/if \(outcome === 'nothing'\) \{[\s\S]*?'not-yet'[\s\S]*?say\(t\('journal\.notYet'/);
    // One line, one height: the answer takes the day's own second line.
    expect(card).toMatch(/\{hint \?\? \(getHijriDate \? getHijriDate\(selected\) : ''\)\}/);
  });

  it('writes through the Log’s own path', () => {
    for (const s of ['primePractice({ journal: next })', 'durableEncryptedSet(JOURNAL_KEY', 'syncEndOfDayReminderForDay(date, next)', 'dropDaruriAlertsForLogged(date, loggedPrayersOn(next, date))']) {
      expect(quick).toContain(s);
    }
    // A second tap un-logs — a tombstone, never a deletion — and never asks.
    expect(quick).toMatch(/await persist\(clearEntry\(prev, date, prayer\), date\);\s*return 'written';/);
  });

  it('names the check in every locale', () => {
    for (const l of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
      const j = JSON.parse(read(`src/i18n/locales/${l}.json`)).journal;
      expect(j.quickLogMark).toContain('{{prayer}}');
      expect(j.quickLogLogged).toContain('{{status}}');
      expect(j.quickLogNotYet).toContain('{{prayer}}');
      expect(j.passedTitle).toContain('{{prayer}}');
      expect(typeof j.passedBody).toBe('string');
    }
  });
});
