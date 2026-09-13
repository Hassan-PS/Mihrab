/**
 * A small either/or is asked in this app's own sheet, not the platform's.
 *
 * Both share prompts used to call `Alert.alert` on Android and
 * `ActionSheetIOS` on iOS. The iOS half was fine; the Android half was a
 * white Material box with two or three blue words, a title, and a band of
 * empty space where the message would go — because there is no message to
 * give. Nothing else in Mihrab looks like that.
 *
 * Reported twice, a release apart: first for the dua share (#47), then
 * "the share prompt for an ayah in mushaf is not styled". One report is a
 * bug; two of the same shape is a thing worth holding still.
 *
 * Read rather than rendered on purpose. `ChoiceSheet` itself is covered
 * where it is used — shareText.test.tsx opens the dua sheet, picks each
 * option and checks what was sent. What THIS pins is that no surface goes
 * back to the platform dialog for the same job, which is a property of
 * the files rather than of one render.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/** Every surface that asks a small either/or. */
const ASKERS = [
  'src/duas/ShareDuaSheet.tsx',
  'src/quran/mushaf/AyahActionSheet.tsx',
  'src/screens/DuasScreen.tsx',
];

describe('the share prompts', () => {
  it.each(ASKERS)('%s asks in a sheet, not a dialog', p => {
    const src = read(p);
    expect(src).not.toContain('ActionSheetIOS');
    expect(src).not.toMatch(/Alert\.alert\(/);
  });

  it('both of them are the same object', () => {
    // Same furniture, so they cannot drift apart the way two hand-rolled
    // sheets would — and so a third question costs one file, not a
    // design decision.
    for (const p of ['src/duas/ShareDuaSheet.tsx', 'src/quran/mushaf/AyahActionSheet.tsx']) {
      expect(read(p)).toContain('ChoiceSheet');
    }
  });

  it('each option says what it produces', () => {
    // The room a dialog button does not have. "Arabic and translation"
    // also takes the pronunciation; "as an image" makes a card rather
    // than a message — neither is visible from the title alone.
    const dua = read('src/duas/ShareDuaSheet.tsx');
    const ayah = read('src/quran/mushaf/AyahActionSheet.tsx');
    for (const key of [
      'duas.shareArabicOnlyHelp',
      'duas.shareTranslationOnlyHelp',
      'duas.shareBothHelp',
    ]) {
      expect(dua).toContain(key);
    }
    for (const key of ['quran.shareAsTextHelp', 'quran.shareAsImageHelp']) {
      expect(ayah).toContain(key);
    }
  });

  it('the ayah prompt closes with the sheet that opened it', () => {
    // It is a Modal inside a Modal. One left flagged visible while its
    // parent is torn down is the orphan that eats every touch — the same
    // failure the share card's own latch exists to prevent.
    const ayah = read('src/quran/mushaf/AyahActionSheet.tsx');
    const latch = ayah.slice(ayah.indexOf('if (!visible) {'), ayah.indexOf('}, [visible]);'));
    expect(latch).toContain('setShareCardVisible(false)');
    expect(latch).toContain('setFormatPicker(false)');
  });
});

describe('ChoiceSheet itself', () => {
  const src = read('src/components/ui/ChoiceSheet.tsx');

  it('is built from the app’s own parts', () => {
    expect(src).toContain('ResponsiveModal');
    expect(src).toContain('<Group>');
    expect(src).toContain('<Row');
  });

  it('closes before it acts', () => {
    // What these choices open — a system share sheet, a card of their own
    // — is a surface, and two stacked is one too many.
    const pick = src.slice(src.indexOf('const pick ='), src.indexOf('return ('));
    expect(pick.indexOf('onClose()')).toBeLessThan(pick.indexOf('choice.onPress()'));
  });
});
