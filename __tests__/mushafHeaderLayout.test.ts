/**
 * The muṣḥaf header: the riwayah beside the back arrow, audio with the
 * view controls on the right. The right side had grown to four controls;
 * the left held only the arrow.
 */
import { readFileSync } from 'fs';
import path from 'path';

const src = readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'quran', 'MushafSurahScreen.tsx'),
  'utf8',
);
const left = src.slice(src.indexOf('headerLeft: () =>'), src.indexOf('headerRight: () =>'));
const right = src.slice(src.indexOf('headerRight: () =>'));

describe('the muṣḥaf header', () => {
  it('puts the riwayah beside the back arrow', () => {
    expect(left).toContain('<TabBackButton');
    expect(left).toContain('riwayahChoiceExists()');
    expect(left.indexOf('<TabBackButton')).toBeLessThan(left.indexOf('riwayahChoiceExists()'));
  });

  it('keeps audio on the right, where the riwayah was, before fullscreen', () => {
    expect(right).not.toContain('riwayahChoiceExists()');
    expect(left).not.toContain('<TilawahIcon');
    expect(right).toContain('<TilawahIcon');
    expect(right.indexOf('<TilawahIcon')).toBeLessThan(right.indexOf("t('quran.enterFullscreen'"));
  });

  it("draws the arrow only when there is somewhere to go back to, in the page's ink", () => {
    expect(left).toMatch(/navigation\.canGoBack\(\) \? \(\s*<TabBackButton/);
    expect(left).toContain('color={ink}');
  });
});
