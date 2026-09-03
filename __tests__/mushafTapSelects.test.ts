/**
 * A tap on a word opens its ayah; the chrome is put away from the margins.
 *
 * It used to be the other way round — a tap anywhere toggled fullscreen
 * and the ayah panel was a long press — on the reasoning that reading is
 * the common act and a panel the rare one. In practice a tap on the words
 * is what everyone tries first when they want the ayah, and the long press
 * is what nobody guesses.
 */
import { readFileSync } from 'fs';
import path from 'path';

const read = (f: string) =>
  readFileSync(path.join(__dirname, '..', 'src', 'quran', f), 'utf8');

describe.each(['MushafSpreadReader.tsx', 'MushafPhoneReader.tsx'])('%s', file => {
  const src = read(file);
  // The spread reader hands the core's handler to the surface directly.
  // The phone reader's page is a memoised component of its own, so the
  // handler reaches the surface through the page's prop — and the reader
  // fills that prop with the same `openSelection`.
  const handler = file.startsWith('MushafPhone')
    ? 'onWordPress'
    : 'core\\.openSelection';

  it('a tap on a word opens the ayah', () => {
    expect(src).toMatch(new RegExp(`onWordPress=\\{${handler}\\}`));
    if (file.startsWith('MushafPhone')) {
      expect(src).toMatch(/onWordPress=\{openSelection\}/);
      expect(src).toMatch(/const \{ [^}]*openSelection[^}]* \} = core;/);
    }
  });

  it('and so does a long press, for hands that learned it that way', () => {
    expect(src).toMatch(new RegExp(`onWordLongPress=\\{${handler}\\}`));
  });

  it('the header strip toggles fullscreen', () => {
    // Without this, on a phone the only fullscreen toggle left would be a
    // 3.5% margin either side of the page.
    expect(src).toMatch(
      /<Pressable\s+accessible=\{false\}\s+onPress=\{onToggleFullscreen\}\s+style=\{\{ paddingTop: navPad \}\}>\s*\n\s*<MushafPageHeader/,
    );
  });

  it('without swallowing the tone pill inside it', () => {
    // A Pressable is accessible by default and an accessible parent hides
    // its children: the pill's label read out, the press landed on the
    // strip.
    const strip = src.match(
      /<Pressable[^>]*onPress=\{onToggleFullscreen\}\s+style=\{\{ paddingTop: navPad \}\}>/,
    );
    expect(strip).not.toBeNull();
    expect(strip![0]).toContain('accessible={false}');
  });

  it('and so do the margins around the page', () => {
    expect(src).toMatch(/<Pressable\s+onPress=\{onToggleFullscreen\}[^>]*>\s*\n\s*<MushafTextPageSurface/);
  });
});
