/**
 * THE DEADLINE MODE, AS THE READER MEETS IT (issue #53, phase 3).
 *
 * The model's tests are next door in `khatmahDeadline.test.ts`; these are
 * about what is on screen — the card's own account of a plan paced to a
 * date, the sheet that sets one, and the strings all of it needs in
 * thirteen languages.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const screen = read('src', 'screens', 'QuranScreen.tsx');
const sheet = read('src', 'quran', 'KhatmahDeadlineSheet.tsx');
const en = JSON.parse(read('src', 'i18n', 'locales', 'en.json'));

describe('the card says which question it is answering', () => {
  it('counts days to the date, and says the date', () => {
    expect(screen).toContain('quran.khatmahByDate');
    expect(screen).toMatch(/deadline && !deadlinePassed/);
  });

  it('shows the pace instead of a deficit, because the pace is the deficit', () => {
    // `khatmahBehindBy` is zero on these plans by design — the missed
    // reading is already inside today's quota, and saying both would
    // charge the reader for the same day twice.
    expect(screen).toContain('quran.khatmahPerDayToFinish');
    expect(screen).toContain('khatmahPerDayPages');
  });

  it('offers a new date when the pace has outgrown the plan', () => {
    expect(screen).toContain('quran.khatmahMoveDate');
    expect(screen).toMatch(/paceOutgrown =[\s\S]{0,400}2 \*/);
    // Never a modal, never a count of missed days: it is a line on the
    // card with a link in it.
    expect(screen).not.toMatch(/missedDays|daysMissed/);
  });

  it('and says so plainly once the date has gone by', () => {
    expect(screen).toContain('quran.khatmahDatePassed');
    expect(screen).toMatch(/deadlinePassed =[\s\S]{0,80}daysLeft <= 0/);
  });

  it('day N of M uses the plan\'s length, not the number it was made with', () => {
    expect(screen).toContain('days: khatmahPlanDays(plan)');
    expect(read('src', 'widget', 'widgetBlocks.ts')).toContain(
      'targetDays: planDays(plan)',
    );
  });
});

describe('the sheet picks a pace, not a square on a grid', () => {
  it('moves the date in steps and shows what each one costs', () => {
    expect(sheet).toContain('quran.khatmahPerDay');
    expect(sheet).toMatch(/const perDay =[\s\S]{0,120}unreadPages/);
    for (const step of ['MinusWeek', 'MinusDay', 'PlusDay', 'PlusWeek']) {
      expect(sheet).toContain(`quran.khatmah${step}`);
    }
  });

  it('never offers a date before tomorrow', () => {
    // A khatmah due today is not a plan; the pace it would ask for is
    // the whole book.
    expect(sheet).toMatch(/Math\.max\(now \+ DAY/);
  });

  it('offers the dates people actually name', () => {
    expect(sheet).toContain('quran.khatmahEndOfMonth');
    expect(sheet).toContain('getNextRamadanStart');
    // …and not a Ramadan eleven months out, which is a reminder rather
    // than a reading plan.
    expect(sheet).toMatch(/< 200/);
  });

  it('offers to take the date off only when there is one', () => {
    expect(sheet).toMatch(/current \?[\s\S]{0,200}khatmahRemoveDate/);
  });

  it('adds no date-picker dependency', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(deps)) {
      expect(name).not.toMatch(/datetimepicker|date-picker|calendars/);
    }
  });
});

describe('every string the mode needs, in every language', () => {
  const KEYS = [
    'khatmahByDateTitle',
    'khatmahByDateChip',
    'khatmahByDateHelp',
    'khatmahChangeDate',
    'khatmahChangeDateHelp',
    'khatmahRemoveDate',
    'khatmahSetDate',
    'khatmahByDate',
    'khatmahInDays',
    'khatmahPerDay',
    'khatmahPerDayToFinish',
    'khatmahPaceNow',
    'khatmahMoveDate',
    'khatmahDatePassed',
    'khatmahEndOfMonth',
    'khatmahBeforeRamadan',
    'khatmahMinusWeek',
    'khatmahMinusDay',
    'khatmahPlusDay',
    'khatmahPlusWeek',
  ];
  const locales = ['en', 'ar', 'sv', 'de', 'es', 'fr', 'hi', 'bn', 'id', 'ru', 'tr', 'ur', 'zh'];

  it.each(locales)('%s has them all, and none is the English one', loc => {
    const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
    for (const key of KEYS) {
      expect(json.quran[key]).toBeTruthy();
      if (loc !== 'en' && !/^[−+]/.test(en.quran[key])) {
        // The steppers are symbols and numbers in every language; the
        // sentences are not, and an untranslated one is a bug that no
        // key check would catch.
        expect(json.quran[key]).not.toBe(en.quran[key]);
      }
    }
  });

  it('keeps the interpolations the code passes', () => {
    for (const loc of locales) {
      const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
      expect(json.quran.khatmahByDate).toContain('{{date}}');
      for (const key of ['khatmahInDays', 'khatmahPerDay', 'khatmahPerDayToFinish', 'khatmahPaceNow', 'khatmahDatePassed']) {
        expect(json.quran[key]).toContain('{{count}}');
      }
    }
  });
});
