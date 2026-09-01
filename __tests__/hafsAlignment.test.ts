/**
 * Reading a riwayah against the Qur'an at every ayah, not sixty of them.
 *
 * Two directions, and the second matters as much as the first: a check
 * that refuses real scripture is worse than none at all. This file has the
 * bugs that proved it — a dagger alif deleted instead of folded, a yeh
 * barree nobody folded at all, and a three-word ayah judged by a measure
 * that can only answer in thirds — each of which failed a genuine muṣḥaf.
 */
import { SURAHS, bundledSurahArabic } from '../src/quran/quran';
import {
  checkAgainstHafs,
  coversHafs,
  groupBySharedSpan,
  type AlignedVerse,
} from '../src/quran/hafsAlignment';
import {
  letterOverlap,
  skeleton,
  textAgreement,
} from '../src/quran/juzCheck';

/**
 * The Qur'an the app already ships, as a riwayah that happens to number
 * it exactly the way Ḥafṣ does. Every ayah maps to itself.
 */
function identity(
  transform?: (text: string, s: number, a: number) => string,
): AlignedVerse[] {
  const out: AlignedVerse[] = [];
  for (let s = 1; s <= 114; s++) {
    const arabic = bundledSurahArabic(s) ?? [];
    for (let a = 1; a <= SURAHS[s - 1].ayahCount; a++) {
      const text = arabic[a - 1] ?? '';
      out.push({
        surah: s,
        ayah: a,
        text: transform ? transform(text, s, a) : text,
        hafs: [a],
      });
    }
  }
  return out;
}

describe('grouping where the two numberings meet', () => {
  it('leaves a one-to-one riwayah alone', () => {
    const groups = groupBySharedSpan([
      { surah: 1, ayah: 1, text: 'a', hafs: [1] },
      { surah: 1, ayah: 2, text: 'b', hafs: [2] },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('keeps a merge whole', () => {
    const groups = groupBySharedSpan([
      { surah: 2, ayah: 1, text: 'a b', hafs: [1, 2] },
      { surah: 2, ayah: 2, text: 'c', hafs: [3] },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].hafs).toEqual([1, 2]);
  });

  it('pulls a split back together', () => {
    // Two ayahs of the riwayah, one ayah of Hafs. Judged apart, each holds
    // about half the reference's words and looks like corruption.
    const groups = groupBySharedSpan([
      { surah: 3, ayah: 91, text: 'first half', hafs: [92] },
      { surah: 3, ayah: 92, text: 'second half', hafs: [92] },
      { surah: 3, ayah: 93, text: 'next', hafs: [93] },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].verses.map(v => v.ayah)).toEqual([91, 92]);
    expect(groups[0].hafs).toEqual([92]);
  });

  it('never groups across a surah boundary', () => {
    const groups = groupBySharedSpan([
      { surah: 1, ayah: 7, text: 'a', hafs: [7] },
      { surah: 2, ayah: 1, text: 'b', hafs: [1] },
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('accounting for every ayah of the Qur’an', () => {
  it('accepts a complete mapping', () => {
    expect(coversHafs(identity())).toBeNull();
  });

  it('refuses one that skips an ayah', () => {
    const verses = identity().filter(v => !(v.surah === 2 && v.ayah === 100));
    expect(coversHafs(verses)).toMatch(/surah 2 accounts for 285 of/);
  });

  it('refuses one that leaves out a whole surah', () => {
    expect(coversHafs(identity().filter(v => v.surah !== 108))).toMatch(
      /surah 108 is missing entirely/,
    );
  });

  it('refuses one whose ayahs run backwards', () => {
    const verses = identity();
    const i = verses.findIndex(v => v.surah === 5 && v.ayah === 10);
    verses[i] = { ...verses[i], hafs: [3] };
    expect(coversHafs(verses)).toMatch(/surah 5 goes backwards/);
  });

  it('counts a split as covering one ayah, not two', () => {
    // Both halves claim Hafs 2:100, so the surah is an ayah short overall.
    const verses = identity();
    const i = verses.findIndex(v => v.surah === 2 && v.ayah === 101);
    verses[i] = { ...verses[i], hafs: [100] };
    expect(coversHafs(verses)).toMatch(/surah 2 accounts for 285 of/);
  });
});

describe('and whether it is the Qur’an', () => {
  it('reads the Qur’an as the Qur’an', () => {
    const result = checkAgainstHafs(identity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mean).toBeGreaterThan(0.99);
    expect(result.groups).toBe(6236);
    expect(result.splits).toBe(0);
    expect(result.merges).toBe(0);
  });

  it('refuses a file that is not scripture at all', () => {
    const result = checkAgainstHafs(
      identity((_t, s, a) => `نص تجريبي ليس قرآنا ${s} ${a}`),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not the Qur’an and will not be used/);
  });

  it('refuses a Qur’an shifted by one ayah', () => {
    // The failure that looks most plausible on screen: every ayah is real
    // scripture, and every one of them is in the wrong place.
    const shifted = identity();
    const texts = shifted.map(v => v.text);
    for (let i = 0; i < shifted.length - 1; i++) {
      shifted[i] = { ...shifted[i], text: texts[i + 1] };
    }
    expect(checkAgainstHafs(shifted).ok).toBe(false);
  });

  it('accepts a riwayah that merges ayahs', () => {
    // al-Baqarah 1–2 as one ayah, the way a Madani-numbered muṣḥaf has it.
    const verses = identity().filter(v => !(v.surah === 2 && v.ayah === 2));
    const i = verses.findIndex(v => v.surah === 2 && v.ayah === 1);
    const arabic = bundledSurahArabic(2) ?? [];
    verses[i] = {
      ...verses[i],
      text: `${arabic[0]} ${arabic[1]}`,
      hafs: [1, 2],
    };
    const result = checkAgainstHafs(verses);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merges).toBe(1);
  });

  it('accepts a riwayah that splits an ayah', () => {
    // One Hafs ayah written as two, each holding half the words. Judged
    // separately each scores about 50%; together they are the ayah.
    const verses = identity();
    const i = verses.findIndex(v => v.surah === 2 && v.ayah === 100);
    const whole = verses[i].text.split(' ');
    const half = Math.floor(whole.length / 2);
    verses.splice(
      i,
      1,
      { surah: 2, ayah: 100, text: whole.slice(0, half).join(' '), hafs: [100] },
      { surah: 2, ayah: 100.5, text: whole.slice(half).join(' '), hafs: [100] },
    );
    const result = checkAgainstHafs(verses);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.splits).toBe(1);
  });
});

describe('short ayahs, where counting words says nothing', () => {
  it('holds a real variant reading against the Qur’an', () => {
    // al-Muddaththir 74:33 — وَٱلَّيْلِ إِذْ أَدْبَرَ in Hafs, إِذَا دَبَرَ in
    // Shu'bah. One genuine difference in three words, which the word
    // measure scores at 33% and would have refused a real muṣḥaf for.
    const hafs = skeleton('وَٱلَّيْلِ إِذْ أَدْبَرَ');
    const shubah = skeleton('وَٱلَّيْلِ إِذَا دَبَرَ');
    const { score, floor } = textAgreement(hafs, shubah);
    expect(score).toBeGreaterThan(floor);
  });

  it('still refuses a short ayah that is simply different', () => {
    const { score, floor } = textAgreement(
      skeleton('وَٱلَّيْلِ إِذْ أَدْبَرَ'),
      skeleton('نص تجريبي مختلف'),
    );
    expect(score).toBeLessThan(floor);
  });

  it('counts words once the reference is long enough to bear it', () => {
    const long = 'one two three four five six';
    expect(textAgreement(long, 'one two three four five six').score).toBe(1);
    expect(textAgreement(long, 'one two three').score).toBeCloseTo(0.5);
  });

  it('measures letters in order, not as a bag', () => {
    expect(letterOverlap('abcd', 'abcd')).toBe(1);
    expect(letterOverlap('abcd', 'dcba')).toBeLessThan(0.6);
    expect(letterOverlap('', 'abcd')).toBe(0);
  });
});

describe('the orthography the two riwayat do not share', () => {
  it('folds the dagger alif rather than deleting it', () => {
    // Warsh writes the alif of prolongation as a dagger where Hafs writes
    // it in full. Deleting it made عَيْنَٰنِ match nothing.
    expect(skeleton('عَيْنَٰنِ')).toBe(skeleton('عَيْنَانِ'));
  });

  it('folds yeh barree in with the other spellings of ya', () => {
    expect(skeleton('فے')).toBe(skeleton('فِي'));
  });

  it('still reduces the basmalah to the same thing either way', () => {
    expect(skeleton('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ')).toBe(
      skeleton('بِسْمِ ٱللَّهِ ٱلرَّحْمَانِ ٱلرَّحِيمِ'),
    );
  });
});
