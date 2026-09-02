/**
 * The khatmah day, in every language the app speaks.
 *
 * `localeParity` proves a key EXISTS in each locale. That is not the same
 * as it working: a key that takes `{{count}}` is resolved by i18next
 * through the plural rules of the language, and Arabic, Russian and Urdu
 * have categories English does not. If the lookup misses, i18next returns
 * the key NAME — so the reader sees "quran.khatmahPagesLeftToday" on the card
 * rather than a sentence, and nothing in the build would have said so.
 *
 * These are the strings added for the khatmah day: the card, the page
 * pill, and their accessibility labels. Every one is rendered in every
 * locale, with the numbers a real plan produces, and checked for being a
 * sentence with the numbers in it.
 */
import i18n from '../src/i18n';

const LOCALES = [
  'en',
  'sv',
  'ar',
  'bn',
  'ur',
  'hi',
  'fr',
  'es',
  'de',
  'tr',
  'id',
  'ru',
  'zh',
];

/** Key, the params the app passes it, and the numbers that must survive. */
const CASES: Array<{
  key: string;
  params: Record<string, number | string>;
  shows: number[];
}> = [
  // `when` is the calendar half of "Finish day 12 (today)".
  { key: 'quran.finishDay', params: { day: 12, when: 'today' }, shows: [12] },
  { key: 'quran.finishDayShort', params: { day: 12, when: 'today' }, shows: [12] },
  {
    key: 'quran.khatmahPageProgress',
    params: { pages: 364, day: 12, days: 30 },
    shows: [364, 12, 30],
  },
  { key: 'quran.khatmahDayDone', params: {}, shows: [] },
  { key: 'quran.khatmahPagesLeftToday', params: { count: 8 }, shows: [8] },
  { key: 'quran.khatmahExtraPages', params: { count: 4 }, shows: [4] },
  { key: 'quran.khatmahMarkDone', params: { day: 12 }, shows: [12] },
  { key: 'quran.khatmahMarkNext', params: { day: 13, when: 'tomorrow' }, shows: [13] },
  { key: 'quran.khatmahMarkToday', params: {}, shows: [] },
  { key: 'quran.khatmahPrevDay', params: {}, shows: [] },
];

/** The counts worth trying: every plural category some language has. */
const COUNTS = [0, 1, 2, 3, 5, 11, 21, 100];

describe('the khatmah day speaks every language', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      beforeAll(async () => {
        await i18n.changeLanguage(locale);
      });

      for (const { key, params, shows } of CASES) {
        it(`renders ${key}`, () => {
          const out = i18n.t(key, params);
          // Not the key name, which is what a failed lookup returns.
          expect([locale, key, out]).not.toEqual([locale, key, key]);
          expect(out.length).toBeGreaterThan(0);
          // No placeholder left unfilled.
          expect([locale, key, out.includes('{{')]).toEqual([
            locale,
            key,
            false,
          ]);
          for (const n of shows) {
            expect([locale, key, out.includes(String(n))]).toEqual([
              locale,
              key,
              true,
            ]);
          }
        });
      }

      it('renders the counted strings for every plural category', () => {
        // Arabic has six, Russian four, and a missing category is exactly
        // where a key that looks fine at count=1 falls over.
        for (const count of COUNTS) {
          for (const key of [
            'quran.khatmahPagesLeftToday',
            'quran.khatmahExtraPages',
            'quran.khatmahDaysLeft',
          ]) {
            const out = i18n.t(key, { count });
            expect([locale, key, count, out]).not.toEqual([
              locale,
              key,
              count,
              key,
            ]);
            expect([locale, key, count, out.includes('{{')]).toEqual([
              locale,
              key,
              count,
              false,
            ]);
            expect([locale, key, count, out.includes(String(count))]).toEqual([
              locale,
              key,
              count,
              true,
            ]);
          }
        }
      });
    });
  }

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });
});
