/**
 * Reciter catalog + search (v2.8.4).
 *
 * The bug behind this file: Ahmed Al-Ajmi WAS in the catalog, but the picker
 * filtered on a raw case-folded substring, so "alajami" — the spelling most
 * people type — matched nothing and the reciter read as missing. Search now
 * folds both sides (case, punctuation, spaces, the "al"/"el" article, Arabic
 * harakat) and also looks at a small alias list per reciter.
 */
import {
  DEFAULT_RECITER_ID,
  RECITERS,
  ayahAudioUrl,
  findReciter,
  foldForSearch,
  reciterRiwayah,
  searchReciters,
  sortedReciters,
} from '../src/quran/audio/reciters';

describe('reciter catalog', () => {
  it('has unique ids and unique EveryAyah folders', () => {
    const ids = RECITERS.map(r => r.id);
    const folders = RECITERS.map(r => r.folder);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(folders).size).toBe(folders.length);
  });

  it('gives every reciter a Latin name, an Arabic name and a folder', () => {
    for (const r of RECITERS) {
      expect(r.name.trim().length).toBeGreaterThan(0);
      expect(r.arabicName.trim().length).toBeGreaterThan(0);
      // One optional directory, for the riwayah sections EveryAyah keeps
      // its non-Ḥafṣ recordings in (`warsh/…`). Still no scheme, no query,
      // no traversal: this string is pasted into a URL and into nothing
      // else, and `..` in it would be a path escape.
      expect(r.folder).toMatch(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?$/);
    }
  });

  it('knows which reading each recitation is', () => {
    // Absent means Ḥafṣ — saying so forty-two times would say nothing.
    const warsh = RECITERS.filter(r => reciterRiwayah(r) === 'warsh');
    expect(warsh).toHaveLength(2);
    expect(warsh.map(r => r.id).sort()).toEqual([
      'warsh-dosari',
      'warsh-jazaery',
    ]);
    for (const r of RECITERS) {
      expect(['hafs', 'warsh']).toContain(reciterRiwayah(r));
    }
  });

  it('claims no word timings for a recording quran-align never saw', () => {
    // The corpus is Ḥafṣ, and timings are per-recording. A `true` here
    // would send the reader's device after a timings file that does not
    // exist — and the URL it would build has a slash in the middle of a
    // filename, which is not a thing.
    for (const r of RECITERS) {
      if (r.folder.includes('/')) expect(r.hasTimings).toBe(false);
    }
  });

  it('puts the reader’s own reading first, and hides nothing', () => {
    const forWarsh = sortedReciters(RECITERS, 'warsh');
    expect(forWarsh).toHaveLength(RECITERS.length);
    expect(forWarsh.slice(0, 2).every(r => reciterRiwayah(r) === 'warsh')).toBe(
      true,
    );
    // Within a group, the alphabet it has always been in.
    const hafs = forWarsh.slice(2).map(r => r.name);
    expect(hafs).toEqual([...hafs].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    // And with no preference, the plain alphabet across everybody.
    const plain = sortedReciters(RECITERS).map(r => r.name);
    expect(plain).toEqual([...plain].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });

  it('resolves the default reciter and falls back on an unknown id', () => {
    expect(findReciter(DEFAULT_RECITER_ID).id).toBe(DEFAULT_RECITER_ID);
    expect(findReciter('no-such-reciter').id).toBe(RECITERS[0].id);
  });

  it('builds zero-padded EveryAyah URLs', () => {
    expect(ayahAudioUrl(findReciter('ajmi'), 1, 1)).toBe(
      'https://everyayah.com/data/ahmed_ibn_ali_al_ajamy_128kbps/001001.mp3',
    );
    expect(ayahAudioUrl(findReciter('ajmi'), 114, 6)).toBe(
      'https://everyayah.com/data/ahmed_ibn_ali_al_ajamy_128kbps/114006.mp3',
    );
  });
});

describe('searchReciters', () => {
  const ids = (q: string) => searchReciters(q).map(r => r.id);

  it('returns everything for an empty or article-only query', () => {
    expect(searchReciters('')).toHaveLength(RECITERS.length);
    expect(searchReciters('   ')).toHaveLength(RECITERS.length);
    expect(searchReciters('al-')).toHaveLength(RECITERS.length);
  });

  it('finds Al-Ajmi however the user spells him', () => {
    for (const q of [
      'ajmi',
      'Ajmi',
      'alajmi',
      'Al-Ajmi',
      'ajami',
      'alajami',
      'ajamy',
      'ajmy',
      'ahmed al ajmi',
      'العجمي',
    ]) {
      expect(ids(q)).toContain('ajmi');
    }
  });

  it('matches the Arabic name', () => {
    expect(ids('الحصري')).toContain('husary');
    expect(ids('المعيقلي')).toContain('maher');
  });

  it('finds the mujawwad readings by style', () => {
    expect(ids('mujawwad')).toEqual(
      expect.arrayContaining([
        'abdulbasit-mujawwad',
        'minshawi-mujawwad',
        'husary-mujawwad',
      ]),
    );
  });

  it('finds the Warsh readings by the reading', () => {
    // Not by an alias: the ids are `warsh-dosari` and `warsh-jazaery`,
    // and `foldForSearch` strips the hyphen — so "warsh" reaches them
    // through the id, which is the word a reader looking for a Warsh
    // voice actually types.
    const hits = searchReciters('warsh').map(r => r.id);
    expect(hits).toEqual(['warsh-dosari', 'warsh-jazaery']);
  });

  it('still returns nothing for a query that matches nobody', () => {
    expect(searchReciters('zzzzqqq')).toHaveLength(0);
  });

  it('folds away case, punctuation and the article', () => {
    expect(foldForSearch('Al-Ajmi')).toBe(foldForSearch('ajmi'));
    expect(foldForSearch('  El Minshawi ')).toBe(foldForSearch('minshawi'));
  });
});

describe('sortedReciters', () => {
  it('lists every reciter alphabetically by display name', () => {
    const names = sortedReciters().map(r => r.name);
    expect(names).toHaveLength(RECITERS.length);
    const expected = [...names].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    );
    expect(names).toEqual(expected);
  });

  it('leaves the catalog itself in provenance order', () => {
    // RECITERS[0] is the default reciter and the fallback; sorting it in
    // place would silently move both.
    expect(RECITERS[0].id).toBe(DEFAULT_RECITER_ID);
  });

  it('returns search results alphabetically too', () => {
    const names = searchReciters('a').map(r => r.name);
    const expected = [...names].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    );
    expect(names).toEqual(expected);
    expect(names.length).toBeGreaterThan(1);
  });
});
