/**
 * The Moroccan ministry's page, parsed against a real saved copy.
 *
 * Fixture: `__tests__/fixtures/habous/rabat-rabi-awwal-1448.html`, saved
 * from habous.gov.ma/prieres/index.php?ville=1 — Rabat, Rabi' al-Awwal
 * 1448. Only the 191-entry city `<select>` is trimmed, to six options; every
 * other byte is the ministry's own markup, whitespace included, because the
 * whitespace is half of what a parser gets wrong.
 *
 * The four traps this pins, all of them found by reading the real page
 * rather than guessing at it:
 *
 *   • one HIJRI month per page, so the Gregorian day column rolls over
 *     mid-table and half the rows belong to the next month
 *   • the Gregorian months appear only in the header, in MOROCCAN Arabic
 *     month names (غشت = August), not the Levantine ones
 *   • six prayers, no Imsak
 *   • the last row's Hijri day can be a sighting note rather than a number
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  MOROCCAN_MONTHS,
  habousDayTuple,
  parseHabousCities,
  parseHabousMonth,
} from '../src/providers/habousParser';
import { HABOUS_RABAT_RABI_AWWAL_1448 } from './fixtures/habousRabat';

const html = readFileSync(
  path.join(__dirname, 'fixtures', 'habous', 'rabat-rabi-awwal-1448.html'),
  'utf8',
);

describe('the city list', () => {
  const cities = parseHabousCities(html);

  it('reads the ministry’s own names and ids', () => {
    expect(cities[0]).toEqual({ id: 1, name: 'الرباط' });
    expect(cities.map(c => c.name)).toContain('إيمين ثلاث');
  });

  it('does not assume the ids are contiguous', () => {
    // They run 1–169 and then jump to 301–322 on the live page. Anything
    // treating the index as the id loses twenty-two cities.
    const ids = cities.map(c => c.id);
    expect(ids).toContain(1);
    expect(ids).toContain(322);
    expect(Math.max(...ids)).toBeGreaterThan(cities.length);
  });
});

describe('the month table', () => {
  const month = parseHabousMonth(html);

  it('reads every day of the Hijri month', () => {
    expect(month.days).toHaveLength(30);
    expect(month.hijriLabel).toBe('ربيع الأول 1448');
  });

  it('dates the rows across the mid-table month rollover', () => {
    // The single most important assertion here. Rows run 14–31 August and
    // then 1–12 September; a parser that assumes one Gregorian month dates
    // the last twelve days a month early and nothing complains.
    expect(month.days[0].dateKey).toBe('2026-08-14');
    expect(month.days[17].dateKey).toBe('2026-08-31');
    expect(month.days[18].dateKey).toBe('2026-09-01');
    expect(month.days[29].dateKey).toBe('2026-09-12');
    const keys = month.days.map(d => d.dateKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it('keeps the row whose Hijri day is a sighting note', () => {
    const last = month.days[month.days.length - 1];
    expect(last.hijriDay).toBe('حسب نتيجة المراقبة');
    expect(last.times.Fajr).toBe('05:38');
  });

  it('trims the template’s stray whitespace off every time', () => {
    // The ministry emits `<td>13:37 </td>`, `<td> 21:41</td>`, and an Asr
    // cell broken across newlines.
    for (const day of month.days) {
      for (const [prayer, value] of Object.entries(day.times)) {
        expect(`${day.dateKey} ${prayer} ${value}`).toMatch(
          /\d{4}-\d{2}-\d{2} \w+ \d{2}:\d{2}$/,
        );
      }
    }
  });

  it('reproduces the ministry’s table exactly', () => {
    // Against the same month transcribed independently into habousRabat.ts.
    const mine = month.days.map(d => [
      Number(d.dateKey.slice(8)),
      d.times.Fajr,
      d.times.Sunrise,
      d.times.Dhuhr,
      d.times.Asr,
      d.times.Maghrib,
      d.times.Isha,
    ]);
    expect(mine).toEqual(HABOUS_RABAT_RABI_AWWAL_1448.map(r => [...r]));
  });

  it('derives the Imsak the ministry does not publish', () => {
    const first = month.days[0];
    expect(first.times.Fajr).toBe('05:10');
    expect(first.times.Imsak).toBe('05:00');
  });

  it('produces a dataset tuple in the shared column order', () => {
    expect(habousDayTuple(month.days[0])).toEqual([
      '05:00', '05:10', '06:45', '13:37', '17:14', '20:19', '21:41',
    ]);
  });
});

describe('the Moroccan calendar is not the Levantine one', () => {
  it('names the months the way Morocco does', () => {
    // غشت, not أغسطس; شتنبر, not سبتمبر. Get this wrong and the header
    // parses to nothing, or worse, to the wrong month.
    expect(MOROCCAN_MONTHS).toHaveLength(12);
    expect(MOROCCAN_MONTHS[7]).toBe('غشت');
    expect(MOROCCAN_MONTHS[8]).toBe('شتنبر');
    expect(MOROCCAN_MONTHS).not.toContain('أغسطس');
    expect(MOROCCAN_MONTHS).not.toContain('سبتمبر');
  });
});

describe('a page that is not what we expect is rejected, not guessed at', () => {
  it('refuses a page with no table', () => {
    expect(() => parseHabousMonth('<html><body>maintenance</body></html>')).toThrow(
      /month header/,
    );
  });

  it('refuses a page with no city list', () => {
    expect(() => parseHabousCities('<html><body></body></html>')).toThrow(/select/);
  });
});
