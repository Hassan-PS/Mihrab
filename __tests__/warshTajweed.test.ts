/**
 * The Warsh muṣḥaf's tajwīd colours (issue #58).
 *
 * The rules themselves are tested where they are written, in Python
 * (`scripts/mushaf/test_warsh_tajweed.py`, the issue's fixtures with their
 * citations) — the build refuses to write the files unless those pass.
 * What is tested here is the app's half of the contract: that it reads
 * the files it ships, that it colours only a word whose text hashes the
 * same as the one the spans were measured on, and that where two rules
 * meet on a letter the letter takes one ink.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TAJWEED_RULES, familiesFor, riwayahHasTajweed, rulesOfFamily, tajweedRule } from '../src/quran/tajweed/rules';
import { warshAyahWords, warshRuns, warshWordHash } from '../src/quran/tajweed/warshTajweed';

type RawWord = string | [string, Array<[number, number, number]>] | null;
type RawSurah = { v: number; rules: string[]; ayahs: RawWord[][] };

const DIR = path.join(__dirname, '..', 'assets', 'quran', 'tajweed-warsh');
const surahFile = (n: number): RawSurah =>
  JSON.parse(fs.readFileSync(path.join(DIR, `${String(n).padStart(3, '0')}.json`), 'utf8'));

describe('the files', () => {
  it('are there for every surah, in the shape the loader reads', () => {
    for (let n = 1; n <= 114; n++) {
      const data = surahFile(n);
      expect(data.v).toBe(1);
      expect(Array.isArray(data.ayahs)).toBe(true);
      for (const id of data.rules) expect(tajweedRule(id)).toBeDefined();
    }
  });

  it('carry no text — only hashes — so the Warsh muṣḥaf is not redistributed', () => {
    const raw = fs.readFileSync(path.join(DIR, '001.json'), 'utf8');
    // No Arabic letter anywhere in the file.
    expect(/[ء-ي]/.test(raw)).toBe(false);
  });

  it('count Warsh’s āyāt, not Ḥafṣ’s', () => {
    let total = 0;
    for (let n = 1; n <= 114; n++) total += surahFile(n).ayahs.length;
    expect(total).toBe(6214);
  });

  it('have every Warsh rule’s guide example where the guide says it is', () => {
    for (const rule of TAJWEED_RULES.filter(r => r.riwayah === 'warsh')) {
      const { surah, ayah, word } = rule.example;
      const data = surahFile(surah);
      const w = data.ayahs[ayah - 1][word - 1];
      expect(Array.isArray(w)).toBe(true);
      const ids = (w as [string, Array<[number, number, number]>])[1].map(s => data.rules[s[0]]);
      expect(`${rule.id}: ${ids.includes(rule.id)}`).toBe(`${rule.id}: true`);
    }
  });
});

describe('the hash', () => {
  it('is the build’s FNV-1a over UTF-16, to the bit', () => {
    // Values printed by scripts/mushaf/warsh_tajweed.py's fnv1a.
    expect(warshWordHash('قَدَ')).toBe('e55a2d3c');
    expect(warshWordHash('اَفْلَحَ')).toBe('f091ef86');
    expect(warshWordHash('خَيْرٞ')).toBe('5153fb36');
    expect(warshWordHash('شَےْءٖ')).toBe('c938955c');
  });
});

describe('colouring an āyah', () => {
  const data = surahFile(23);
  // 23:1 as the KFGQPC Warsh text has it.
  const text = 'قَدَ اَفْلَحَ اَ۬لْمُومِنُونَۖ';

  it('colours a word whose text matches — naql on the moved hamza', () => {
    const words = warshAyahWords(data as never, 1, text);
    expect(words.map(w => w.text)).toEqual(text.split(' '));
    expect(words[1].rules.map(r => r.id)).toContain('naql');
    // قَدَ: the dāl took the hamza's vowel, so it does not bounce.
    expect(words[0].rules.map(r => r.id)).not.toContain('qalaqah');
  });

  it('leaves a word in ink when its text is not the one the spans were measured on', () => {
    const changed = 'قَدَ أَفْلَحَ اَ۬لْمُومِنُونَۖ';
    const words = warshAyahWords(data as never, 1, changed);
    expect(words[1].rules).toEqual([]);
    expect(words[1].runs).toEqual([{ text: 'أَفْلَحَ', rule: null }]);
  });
});

describe('one ink per letter', () => {
  const tafkheem = tajweedRule('tafkheem')!;
  const idgham = tajweedRule('idgham_ghunnah')!;
  const wasl = tajweedRule('ham_wasl')!;

  it('gives a shared letter to the rule that changes what is said', () => {
    // A thick rāʾ carrying the tanwīn of an idghām: green, not blue.
    const runs = warshRuns('رٞ', [
      { rule: tafkheem, start: 0, end: 2 },
      { rule: idgham, start: 0, end: 2 },
    ]);
    expect(runs).toEqual([{ text: 'رٞ', rule: idgham }]);
  });

  it('keeps the rest of the word in ink, in order', () => {
    const runs = warshRuns('اَ۬لْحَمْدُ', [{ rule: wasl, start: 0, end: 3 }]);
    expect(runs.map(r => r.text).join('')).toBe('اَ۬لْحَمْدُ');
    expect(runs[0]).toEqual({ text: 'اَ۬', rule: wasl });
    expect(runs[1].rule).toBeNull();
  });
});

describe('which riwayat are coloured', () => {
  it('is Ḥafṣ and Warsh', () => {
    expect(riwayahHasTajweed('hafs')).toBe(true);
    expect(riwayahHasTajweed('warsh')).toBe(true);
    expect(riwayahHasTajweed('qalun')).toBe(false);
  });

  it('shows Warsh’s own rules to a Warsh reader only', () => {
    expect(familiesFor('hafs')).not.toContain('warsh');
    expect(familiesFor('warsh')).toContain('warsh');
    expect(rulesOfFamily('madd', 'hafs').map(r => r.id)).not.toContain('madd_badal');
    expect(rulesOfFamily('madd', 'warsh').map(r => r.id)).toContain('madd_badal');
  });
});
