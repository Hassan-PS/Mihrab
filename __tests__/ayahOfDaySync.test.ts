/**
 * The daily notification and the Quran screen's card must name the SAME
 * ayah (v2.8.4).
 *
 * They used to disagree by construction: the card read the date-seeded
 * `verseOfTheDayRef`, the notification drew a fresh uniform-random ayah per
 * day. Reading the notification and then opening the app showed you two
 * different verses.
 */
import { verseOfTheDayRef } from '../src/quran/search';
import { SURAHS } from '../src/quran/quran';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe('verse of the day', () => {
  it('is stable for a given date', () => {
    const a = verseOfTheDayRef(day(2026, 8, 1));
    const b = verseOfTheDayRef(day(2026, 8, 1));
    expect(a).toEqual(b);
  });

  it('does not depend on the time of day the app asks', () => {
    const morning = verseOfTheDayRef(new Date(2026, 7, 1, 0, 0, 1));
    const night = verseOfTheDayRef(new Date(2026, 7, 1, 23, 59, 59));
    expect(morning).toEqual(night);
  });

  it('changes from one day to the next', () => {
    const today = verseOfTheDayRef(day(2026, 8, 1));
    const tomorrow = verseOfTheDayRef(day(2026, 8, 2));
    expect(tomorrow).not.toEqual(today);
  });

  it('always names a real ayah', () => {
    for (let i = 0; i < 400; i++) {
      const d = new Date(2026, 0, 1);
      d.setDate(d.getDate() + i);
      const ref = verseOfTheDayRef(d);
      const meta = SURAHS.find(s => s.number === ref.surah);
      expect(meta).toBeDefined();
      expect(ref.ayah).toBeGreaterThanOrEqual(1);
      expect(ref.ayah).toBeLessThanOrEqual(meta!.ayahCount);
    }
  });

  it('gives the notification for a date the same ayah the card shows', () => {
    // `rescheduleAyahOfDay` seeds each trigger with its own fire date, so
    // this identity is what keeps the two in sync — assert it directly.
    for (const d of [day(2026, 8, 1), day(2026, 12, 31), day(2027, 2, 28)]) {
      const fireAt = new Date(d);
      fireAt.setHours(9, 0, 0, 0);
      expect(verseOfTheDayRef(fireAt)).toEqual(verseOfTheDayRef(d));
    }
  });
});
