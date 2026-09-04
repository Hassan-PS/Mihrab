/**
 * Two things the Tilāwah page was missing, both invisible from the code
 * that draws them.
 *
 *  1. The word highlight. The preview renders the same surface the reader
 *     does, so it gets the ayah's wash for free — but the WORD inside it
 *     is published by a probe, and only the two readers mounted one. The
 *     page looked right and nothing inside it moved, which is exactly
 *     what "the highlight doesn't work here" looks like.
 *
 *  2. A way back. The page is the transport and then a hundred and
 *     fourteen rows under it, so finding a surah leaves you a long way
 *     from the controls you started at.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const TILAWAH = read('src/screens/quran/TilawahScreen.tsx');

describe('the word being recited', () => {
  it('is published while the preview is up, in front, and playing', () => {
    expect(TILAWAH).toContain(
      "import { ActiveWordProbe } from '../../quran/audio/ActiveWordProbe'",
    );
    // `focused` too: this page stays mounted under the reader it opens,
    // and the reader mounts its own probe — two pollers publishing the
    // same word to the same store.
    expect(TILAWAH).toMatch(
      /\{showPage && focused && status\.active && status\.playing \? \(\s*<ActiveWordProbe \/>\s*\) : null\}/,
    );
  });

  /**
   * And the position poller slows to a crawl for the same reason: it is
   * a timeout loop against the native player for as long as the hook is
   * mounted, and it was ticking at 400ms — and re-rendering this whole
   * page — behind a reader with its own poller for the same number.
   */
  it('barely polls while another screen is on top', () => {
    expect(TILAWAH).toMatch(/useProgress\(focused \? 400 : 60_000\)/);
  });

  /**
   * Mounted only while it is wanted: the hook behind the probe polls
   * playback four times a second for as long as it is mounted, and a
   * page with the preview folded away has nothing to light.
   */
  it('is not published when there is nothing to light it on', () => {
    expect(TILAWAH).not.toMatch(/\{\s*<ActiveWordProbe/);
  });

  it('is the same probe the reader mounts, not a second copy', () => {
    const reader = read('src/quran/MushafPhoneReader.tsx');
    expect(reader).toContain('<ActiveWordProbe />');
    // One implementation, one store.
    const store = read('src/quran/audio/activeWordStore.ts');
    expect(store).toMatch(/export function publishActiveWord/);
  });
});

describe('the way back to the top', () => {
  it('appears deep in the list, and only on the way up', () => {
    // Going down the reader is hunting for a surah and a button over the
    // rows would be in front of what they are reading.
    expect(TILAWAH).toMatch(/setShowTop\(y > TO_TOP_AFTER && dy < 0\)/);
    expect(TILAWAH).toMatch(/const TO_TOP_AFTER = \d+;/);
  });

  it('does not flicker on a resting finger', () => {
    expect(TILAWAH).toMatch(/if \(Math\.abs\(dy\) < SCROLL_HYSTERESIS\) return;/);
  });

  it('takes the list to the top and puts itself away', () => {
    expect(TILAWAH).toMatch(
      /listRef\.current\?\.scrollToOffset\(\{ offset: 0, animated: true \}\)/,
    );
    expect(TILAWAH).toMatch(/scrollToTop = useCallback[\s\S]{0,200}setShowTop\(false\)/);
  });

  it('is labelled in every language', () => {
    const langs = fs
      .readdirSync(path.join(REPO, 'src/i18n/locales'))
      .filter(f => f.endsWith('.json'));
    expect(langs.length).toBeGreaterThanOrEqual(13);
    for (const f of langs) {
      const d = JSON.parse(read(path.join('src/i18n/locales', f)));
      expect(typeof d.quran.backToTop).toBe('string');
      expect(d.quran.backToTop.length).toBeGreaterThan(0);
    }
  });
});

describe('the bar under the title', () => {
  const bar = read('src/quran/audio/HeaderPlaybackBar.tsx');

  /**
   * The name leads. It answers the question anyone glancing up here is
   * asking, and it starts where the title above it starts — so the two
   * read as one column rather than as a row of buttons with a caption
   * trailing off the end.
   */
  it('names what is playing before it offers the controls', () => {
    const name = bar.indexOf('styles.namePress');
    const play = bar.indexOf("t('quran.pause', 'Pause')");
    const stop = bar.indexOf("t('quran.stopPlayback'");
    expect(name).toBeGreaterThan(0);
    expect(name).toBeLessThan(play);
    expect(play).toBeLessThan(stop);
  });

  it('lets the name take the room the controls do not', () => {
    expect(bar).toMatch(/namePress: \{ flex: 1/);
  });
});

describe('the Tilawah mark', () => {
  const icons = read('src/quran/audio/PlaybackIcons.tsx');

  /**
   * Stroked circles at 16 points are rings with a hole in them, which is
   * what the first pass drew — two of them, beside a solid play triangle
   * and a solid pause bar. A notehead is filled.
   */
  it('has filled noteheads', () => {
    expect(icons).toMatch(/<Ellipse[\s\S]{0,200}fill=\{color\}/);
    expect(icons).toMatch(/rotate\(-18/);
  });

  it('still takes a resolved colour', () => {
    // react-native-svg draws nothing at all for a PlatformColor.
    expect(icons).toMatch(/color: string/);
  });

  /**
   * And it is the ONLY note in the Qur'an surfaces.
   *
   * `♪` is the system font's glyph: its size, weight and vertical
   * placement are whatever the platform decided, and the space after it
   * is whatever the font says a space is — which is why the chip in the
   * title bar and the reader's "Audio" button each sat differently from
   * the other and from the drawn controls beside them.
   */
  it.each([
    'src/screens/quran/TilawahHeaderChip.tsx',
    'src/screens/quran/MushafSurahScreen.tsx',
    'src/screens/quran/TranslationSurahScreen.tsx',
  ])('%s draws its note rather than typing one', file => {
    const src = read(file);
    // The doc comments explain the glyph; no JSX may still render it.
    expect(src).not.toMatch(/\{`\u266a/);
    expect(src).toContain('TilawahIcon');
  });
});
