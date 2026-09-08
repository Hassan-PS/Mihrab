/**
 * The Tilawah page is a player, not a control panel.
 *
 * Reported as "chaotic and busy" by someone who only wanted to press play:
 * an intro paragraph, a reciter card inside the card, two labelled rows of
 * five chips, a second row of pills under the transport, and a card per
 * surah. These pin the calmer shape: one hero, one transport, one row of
 * options, divided rows for the surahs.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const src = read('src/screens/quran/TilawahScreen.tsx');

describe('the player', () => {
  it('keeps the explanation behind an ⓘ, not a paragraph above the player', () => {
    expect(src).not.toMatch(/styles\.pageBlurb/);
    expect(src).toMatch(/<InfoButton[\s\S]*?quran\.tilawahBlurb/);
  });

  it('writes the surah name in calligraphy beside the Latin one', () => {
    expect(src).toMatch(/styles\.nowArabic/);
    expect(src).toMatch(/nowArabic: \{[\s\S]*?arabicTextStyle\('calligraphy'\)/);
    expect(src).toMatch(/surahArabic: \{[\s\S]*?arabicTextStyle\('calligraphy'\)/);
  });

  it('has one transport: ayah, surah, play, surah, ayah', () => {
    const transport = src.slice(src.indexOf('<View style={styles.transport}>'), src.indexOf('<View style={styles.optionsRow}>'));
    const labels = [...transport.matchAll(/defaultValue: '([^']+)'/g)].map(m => m[1]);
    expect(labels).toEqual(['Previous ayah', 'Previous surah', 'Pause', 'Play', 'Next surah', 'Next ayah']);
    // No stop button and no shuffle in the transport.
    expect(transport).not.toMatch(/stopPlayback|ShuffleIcon/);
  });

  it('folds speed and sleep into one cycling chip each', () => {
    expect(src).toMatch(/const cycleRate = useCallback/);
    expect(src).toMatch(/const cycleSleep = useCallback/);
    expect(src).not.toMatch(/RATES\.map\(/);
    expect(src).not.toMatch(/SLEEP_CHOICES\.map\(/);
    // Five options on one row.
    const row = src.slice(src.indexOf('<View style={styles.optionsRow}>'), src.indexOf('{sleepEndsAt != null ?'));
    expect(row.match(/<OptionChip/g)).toHaveLength(5);
  });

  it('lists surahs as divided rows, not cards', () => {
    expect(src).toMatch(/styles\.surahDivider/);
    const rowStyle = src.slice(src.indexOf('  surahRow: {'), src.indexOf('  surahDivider: {'));
    expect(rowStyle).not.toMatch(/borderWidth/);
  });
});
