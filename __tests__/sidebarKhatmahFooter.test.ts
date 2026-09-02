/**
 * The sidebar's khatmah footer fills every slot its string has.
 *
 * `quran.khatmahProgress` has read "{{read}} / {{total}} pages · today:
 * {{today}}" in thirteen languages since 2.7.26. The muṣḥaf sidebar,
 * written for 2.8.5, reused the key and passed `read` and `total` only, so
 * the foot of every Mac and iPad sidebar said "today: {today}" — a
 * placeholder, shipped, for months.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const sidebar = readFileSync(
  path.join(ROOT, 'src', 'quran', 'MushafIndexSidebar.tsx'),
  'utf8',
);

const slots = (s: string) =>
  Array.from(s.matchAll(/\{\{(\w+)\}\}/g), m => m[1]).sort();

describe('the khatmah footer', () => {
  it('passes every interpolation the string asks for', () => {
    const call = sidebar.slice(sidebar.indexOf("t('quran.khatmahProgress'"));
    const args = call.slice(0, call.indexOf('})'));
    for (const slot of ['read', 'total', 'today']) {
      expect(args).toMatch(new RegExp(`\\b${slot}:`));
    }
  });

  it('and every language asks for the same three', () => {
    const dir = path.join(ROOT, 'src', 'i18n', 'locales');
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as {
        quran: { khatmahProgress: string };
      };
      expect(slots(json.quran.khatmahProgress)).toEqual(['read', 'today', 'total']);
    }
  });
});
