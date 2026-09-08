/**
 * The check beside each prayer on Today — what one tap records.
 *
 * The status is the clock's, not a guess: on time inside the prayer's
 * window, late after it, nothing before it. See src/journal/quickLog.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { quickLogPhase, quickLogStatus, isSalah, SALAH } from '../src/journal/quickLog';

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
    expect(quickLogStatus('Dhuhr', day, at('17:00'))).toBe('late');
    expect(quickLogStatus('Dhuhr', day, at('12:00'))).toBeNull();
  });

  it("Fajr's window ends at sunrise, not at Dhuhr", () => {
    expect(quickLogStatus('Fajr', day, at('06:00'))).toBe('on-time');
    expect(quickLogStatus('Fajr', day, at('06:30'))).toBe('late');
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

  it('holds the check slot on today’s rows only, so names line up there and nowhere else', () => {
    expect(row).toMatch(/<LogCheck[\s\S]*?\/>\s*\) : hasCheckColumn \? \(\s*<View style=\{styles\.checkSlot\} \/>\s*\) : null\}/);
    expect(row).toMatch(/checkSlot: \{ width: LOG_CHECK_SIZE, marginEnd: SPACING\.md \}/);
    expect(card).toMatch(/hasCheckColumn=\{isToday\}/);
  });

  it('offers the check on today’s salāh only', () => {
    // Per page: only the today page (offset 0) gets a check.
    expect(card).toMatch(/const isToday = offset === 0;/);
    expect(card).toMatch(/isToday && isSalah\(key\)/);
    expect(card).toMatch(/quickLog\.toggle\(key, dayTimings, tomorrow\)/);
  });

  it('is a checkbox that cannot be pressed before its time', () => {
    expect(check).toMatch(/accessibilityRole="checkbox"/);
    expect(check).toMatch(/disabled=\{notYet\}/);
    expect(check).toMatch(/accessibilityState=\{\{ checked: logged, disabled: notYet \}\}/);
  });

  it('writes through the Log’s own path', () => {
    for (const s of ['primePractice({ journal: next })', 'durableEncryptedSet(JOURNAL_KEY', 'syncEndOfDayReminderForDay(date, next)', 'dropDaruriAlertsForLogged(date, loggedPrayersOn(next, date))']) {
      expect(quick).toContain(s);
    }
    // A second tap un-logs — a tombstone, never a deletion.
    expect(quick).toMatch(/next = clearEntry\(prev, date, prayer\)/);
  });

  it('names the check in every locale', () => {
    for (const l of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
      const j = JSON.parse(read(`src/i18n/locales/${l}.json`)).journal;
      expect(j.quickLogMark).toContain('{{prayer}}');
      expect(j.quickLogLogged).toContain('{{status}}');
      expect(j.quickLogNotYet).toContain('{{prayer}}');
    }
  });
});
