/**
 * The muṣḥaf header: recitation beside the back arrow, the view controls
 * on the right. The right side had grown to four controls; the left held
 * only the arrow.
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
  it('puts the recitation control beside the back arrow', () => {
    expect(left).toContain('<TabBackButton');
    expect(left).toContain('<TilawahIcon');
    expect(left.indexOf('<TabBackButton')).toBeLessThan(left.indexOf('<TilawahIcon'));
  });

  it('keeps it off the crowded right side', () => {
    expect(right).not.toContain('<TilawahIcon');
    expect(right).toContain("t('quran.enterFullscreen'");
  });

  it("draws the arrow only when there is somewhere to go back to, in the page's ink", () => {
    expect(left).toMatch(/navigation\.canGoBack\(\) \? \(\s*<TabBackButton/);
    expect(left).toContain('color={ink}');
  });
});
