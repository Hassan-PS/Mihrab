/**
 * The translation view lights the word the reciter is on.
 *
 * The timing data counts QPC's words; the view draws Tanzil's text. They
 * differ by the pause marks Tanzil sets between spaces and by the basmalah
 * Tanzil folds into every first ayah — so the lit word was one off past
 * every pause mark, and the basmalah lit on every surah's opening.
 */
import { countedWordIndices, startsWithBasmalah } from '../src/quran/audio/countedWords';
import { getPageLayout } from '../src/quran/mushafLayout';
import { loadSurah } from '../src/quran/quran';

describe('countedWordIndices', () => {
  it('skips a pause mark standing on its own', () => {
    const words = ['إِنَّمَا', 'ۖ', 'فَ'];
    expect(countedWordIndices(36, 11, words)).toEqual([0, 2]);
  });

  it('skips the basmalah on a first ayah', () => {
    const basmalah = [
      'بِسْمِ',
      'ٱللَّهِ',
      'ٱلرَّحْمَٰنِ',
      'ٱلرَّحِيمِ',
    ];
    expect(startsWithBasmalah([...basmalah, 'x'])).toBe(true);
    expect(countedWordIndices(36, 1, [...basmalah, 'يس'])).toEqual([4]);
  });

  it('but not on al-Fatihah, whose first ayah IS the basmalah', () => {
    const basmalah = [
      'بِسْمِ',
      'ٱللَّهِ',
      'ٱلرَّحْمَٰنِ',
      'ٱلرَّحِيمِ',
    ];
    expect(countedWordIndices(1, 1, basmalah)).toEqual([0, 1, 2, 3]);
  });

  it('nor on a first ayah that does not carry one', () => {
    expect(countedWordIndices(9, 1, ['a', 'b', 'c', 'd', 'e'])).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('against the muṣḥaf itself', () => {
  it('counts every ayah of Ya-Sin the way QPC does', async () => {
    // QPC's count per ayah, from the layout the timing data was checked
    // against. If the two ever disagree the lit word is wrong.
    const surah = await loadSurah(36);
    const qpc = new Map<number, number>();
    for (let p = 440; p <= 445; p++) {
      for (const line of getPageLayout(p)!.lines) {
        if (line.kind !== 'ayah') continue;
        for (const w of line.words) {
          if (w.surah !== 36 || w.isEnd) continue;
          qpc.set(w.ayah, Math.max(qpc.get(w.ayah) ?? 0, w.position));
        }
      }
    }
    expect(qpc.size).toBe(83);
    for (const [ayah, count] of qpc) {
      const words = (surah?.arabic[ayah - 1] ?? '').split(' ').filter(Boolean);
      expect([ayah, countedWordIndices(36, ayah, words).length]).toEqual([ayah, count]);
    }
  });
});
