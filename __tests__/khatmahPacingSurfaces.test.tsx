/**
 * HOW A KHATMAH IS PACED, AS THE READER MEETS IT (issue #53).
 *
 * The model's tests are next door in `khatmahDeadline.test.ts`; these are
 * about what is on screen — the card's own account of a plan paced to a
 * date, the one sheet that sets EITHER pacing, the two places it can be
 * opened from, and the strings all of it needs in thirteen languages.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const screen = read('src', 'screens', 'QuranScreen.tsx');
const sheet = read('src', 'quran', 'KhatmahPacingSheet.tsx');
const settings = read('src', 'screens', 'settings', 'QuranCard.tsx');
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

  it('offers a new date when the pace has outgrown the reader', () => {
    expect(screen).toContain('quran.khatmahMoveDate');
    // The rule itself lives in the store, where it can be walked through
    // a whole khatmah day by day (`khatmahDeadline.test.ts`); the screen
    // only decides whether to say it.
    expect(screen).toContain('khatmahPaceOutgrown(plan)');
    // Never a modal, never a count of missed days: it is a line on the
    // card with a link in it.
    expect(screen).not.toMatch(/missedDays|daysMissed/);
  });

  it('and says so plainly once the date has gone by', () => {
    expect(screen).toContain('quran.khatmahDatePassed');
    // Asked of the DATE, not of `daysLeft` — which is also zero for a
    // khatmah that has been FINISHED, and telling someone who has just
    // completed one that they were late for it is the bug this pins.
    expect(screen).toContain('khatmahDatePassed(plan)');
    expect(screen).not.toMatch(/deadlinePassed =[\s\S]{0,60}daysLeft <= 0/);
  });

  it('day N of M uses the plan\'s length, not the number it was made with', () => {
    expect(screen).toContain('days: khatmahPlanDays(plan)');
    expect(read('src', 'widget', 'widgetBlocks.ts')).toContain(
      'targetDays: planDays(plan)',
    );
  });
});

describe('the sheet asks one question with two answers', () => {
  it('carries a segment, and both ways are offered whichever way it opened', () => {
    expect(sheet).toContain('quran.khatmahPacingDays');
    expect(sheet).toContain('quran.khatmahPacingDate');
    expect(sheet).toContain('<SegmentedControl');
    // `initialKind` decides where it OPENS and nothing else: there is no
    // mode in which one of the two is unavailable, which is the whole
    // point of putting them in one sheet.
    expect(sheet).toMatch(/initialKind \?\?/);
  });

  it('keeps one number behind both views, so flipping costs nothing', () => {
    // A length is a date and a date is a length. Two states would drift;
    // the date is derived from the days, and a preset is read back into
    // them.
    expect(sheet).toMatch(/const at = startOfDay\(now\)\.getTime\(\) \+ \(days - 1\) \* DAY/);
    expect(sheet).toMatch(/const setDate = \(when: number\) =>[\s\S]{0,120}daysFromToday\(when, now\) \+ 1/);
    expect(sheet).not.toMatch(/useState<number>\(\(\) => \{[\s\S]{0,400}setAt\(/);
  });

  it('says what the other view would say, so the two are visibly one choice', () => {
    // The length view shows the day it lands on; the date view shows the
    // days it comes to. Both show the pages a day, which is the number
    // that actually decides.
    expect(sheet).toMatch(/kind === 'date' \? dateLabel : daysLabel/);
    expect(sheet).toMatch(/kind === 'date'[\s\S]{0,200}khatmahInDays[\s\S]{0,200}dateLabel/);
  });

  it('reports a length or a date, and never a plan', () => {
    // Turning either into a change to a khatmah already under way is the
    // store's job: the sheet does not know whether it is making a plan
    // or re-pacing one.
    expect(sheet).toMatch(/kind: 'days'; days: number/);
    expect(sheet).toMatch(/kind: 'date'; deadline: string/);
    expect(sheet).not.toMatch(/setKhatmah(Duration|Deadline)\(/);
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

  it('never offers a date before tomorrow, or a plan of no days', () => {
    // A khatmah due today is not a plan; the pace it would ask for is
    // the whole book. Both views clamp the same number, so neither can
    // reach it.
    expect(sheet).toMatch(/const move = \(by: number\) => setDays\(prev => Math\.max\(1,/);
    expect(sheet).toMatch(/setDays\(Math\.max\(1,/);
  });

  it('offers the dates people actually name', () => {
    expect(sheet).toContain('quran.khatmahEndOfMonth');
    expect(sheet).toContain('getNextRamadanStart');
    // …and not a Ramadan eleven months out, which is a reminder rather
    // than a reading plan.
    expect(sheet).toMatch(/< 200/);
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
    'khatmahSetDate',
    'khatmahSetLength',
    'khatmahPacingTitle',
    'khatmahPacingDays',
    'khatmahPacingDate',
    'khatmahPacingDateHelp',
    'khatmahPacingDaysHelp',
    'khatmahPacingHelp',
    'khatmahPacingNone',
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
      // "Khatmah" is the same word in several of these; the sentences
      // are not, and an untranslated sentence is what this catches.
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
      expect(json.quran.khatmahPacingDateHelp).toContain('{{date}}');
      for (const key of ['khatmahInDays', 'khatmahPerDay', 'khatmahPerDayToFinish', 'khatmahPaceNow', 'khatmahDatePassed']) {
        expect(json.quran[key]).toContain('{{count}}');
      }
    }
  });
});

describe('the wiring, where a sheet that remembers is a bug', () => {
  it('is mounted only while it is open, so it seeds from the plan in hand', () => {
    // `useState` runs on mount. Left mounted with the screen, the sheet
    // would seed its date on a screen that had no plan yet, and
    // re-opening it on a dated plan would offer a month out rather than
    // the date the reader already chose.
    expect(screen).toMatch(/\{pacingSheet \?[\s\S]{0,400}<KhatmahPacingSheet/);
    expect(settings).toMatch(/\{plan && pacingVisible \?[\s\S]{0,200}<KhatmahPacingSheet/);
    expect(sheet).toMatch(/useState<number>\(\(\) => \{[\s\S]{0,200}current/);
  });

  it('is reachable from the plan, and from Settings', () => {
    // Two entry points, one sheet and one store call each way — the pair
    // cannot drift into two different ideas of what a switch means.
    expect(screen).toMatch(/khatmahPacingTitle[\s\S]{0,900}setPacingSheet\(\{ mode: 'change'/);
    expect(settings).toContain('settings-khatmah-pacing');
    expect(settings).toContain('quran.khatmahPacingTitle');
    for (const src of [screen, settings]) {
      expect(src).toMatch(/choice\.kind === 'days'/);
      expect(src).toContain('setKhatmahDuration');
      expect(src).toContain('setKhatmahDeadline');
    }
  });

  it('and Settings says where a khatmah comes from when there is none', () => {
    // A pacing row with no plan under it is a setting for nothing.
    expect(settings).toMatch(/plan\s*\?[\s\S]{0,900}khatmahPacingNone/);
    expect(settings).toMatch(/\{plan \?[\s\S]{0,200}settings-khatmah-pacing/);
  });

  it('starts a dated plan with the length that date implies', () => {
    // Not a default thirty: take the date off an eighty-day plan and it
    // should become the eighty-day plan it was. It is also what the
    // outgrown-pace rule measures against.
    expect(screen).toMatch(/const span = Math\.max\([\s\S]{0,200}startKhatmah\(span/);
  });

  it('and the home card reads the plan\'s length, not the number it was made with', () => {
    expect(read('src', 'quran', 'quranCardState.ts')).toContain(
      'targetDays: planDays(plan)',
    );
  });
});
