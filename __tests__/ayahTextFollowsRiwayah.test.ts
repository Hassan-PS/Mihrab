/**
 * A Warsh reader is shown the Warsh wording, everywhere — not just on the
 * page.
 *
 * Issue #46: "when using warsh and we click on an ayah, it gives the hafs
 * version". The page itself is drawn from the installed riwayah's own
 * text table, but every ayah-level surface behind it — the action sheet's
 * Arabic, and therefore copy, share and the share card — asked
 * `loadSurah`, which is the bundled Ḥafṣ text and only ever that.
 *
 * The rasm is not a formatting detail. Handing a reader one muṣḥaf on the
 * page and another in the share sheet is a scripture bug.
 */
import {
  _resetRiwayahDataCacheForTests,
  _setRiwayahDataForTests,
  riwayahAyahText,
} from '../src/quran/riwayahData';
import { DEFAULT_RIWAYAH } from '../src/quran/riwayat';
import { readFileSync } from 'fs';
import path from 'path';

/** Two ayahs, in a wording that is deliberately not the bundled one. */
const WARSH_TEXT: Record<string, string> = {
  '1:1': 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ — warsh fixture',
  '2:255': 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ — warsh fixture',
};

function installWarsh(): void {
  _setRiwayahDataForTests('warsh' as never, {
    pages: [],
    surahs: [],
    text: WARSH_TEXT,
  } as never);
}

describe('riwayahAyahText', () => {
  beforeEach(() => _resetRiwayahDataCacheForTests());
  afterAll(() => _resetRiwayahDataCacheForTests());

  it('answers with this riwayah’s own wording', () => {
    installWarsh();
    expect(riwayahAyahText('warsh' as never, 2, 255)).toBe(WARSH_TEXT['2:255']);
  });

  it('is null for Ḥafṣ, whose text is bundled', () => {
    // Null rather than the Ḥafṣ string: the caller falls back to
    // `loadSurah`, which is where that text lives and is loaded from.
    installWarsh();
    expect(riwayahAyahText(DEFAULT_RIWAYAH, 2, 255)).toBeNull();
  });

  it('is null when the dataset is not on this device yet', () => {
    // An `image` riwayah has pages and no text; a `unicode` one that has
    // not hydrated has neither. Both must fall back rather than blank.
    expect(riwayahAyahText('warsh' as never, 2, 255)).toBeNull();
  });

  it('is null for an ayah the dataset does not carry', () => {
    installWarsh();
    expect(riwayahAyahText('warsh' as never, 3, 1)).toBeNull();
  });
});

/**
 * The sheet's use of it, read rather than rendered: mounting
 * AyahActionSheet means the palette, the settings context, the audio
 * player, the tafsir store and a Modal, and what can silently break here
 * is the order — asking the bundled text first would answer Ḥafṣ to a
 * Warsh reader before the riwayah was ever consulted.
 */
describe('the ayah sheet asks the riwayah first', () => {
  const sheet = readFileSync(
    path.join(__dirname, '..', 'src/quran/mushaf/AyahActionSheet.tsx'),
    'utf8',
  );

  it('asks it at all', () => {
    expect(sheet).toContain('riwayahAyahText(');
  });

  it('asks it before falling back to the bundled text', () => {
    expect(sheet.indexOf('riwayahAyahText(')).toBeLessThan(
      sheet.indexOf('void loadSurah(surah)'),
    );
  });

  it('re-reads when the reader switches muṣḥaf', () => {
    // The sheet can be open across a switch, and an ayah that kept the
    // old rasm would be the same bug wearing a different hat.
    const effect = sheet.slice(0, sheet.indexOf('[visible, surah, ayah'));
    expect(effect.length).toBeGreaterThan(0);
    expect(sheet).toContain('[visible, surah, ayah, state.prefs.riwayah]');
  });
});
