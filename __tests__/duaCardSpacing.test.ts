/**
 * The gap that a centred column swallowed.
 *
 * Every one of these pages is a ScrollView whose `contentContainerStyle`
 * carries `gap` — which separates the ScrollView's DIRECT children. That
 * worked until `CenteredColumn` was wrapped around the cards to give
 * iPad and Mac a reading measure: from then on there was exactly ONE
 * direct child, the gap separated nothing, and the cards sat flush
 * against each other. It looks like a design choice rather than a bug,
 * which is why it survived on five screens after LogScreen hit it and
 * was fixed on its own.
 *
 * The rule this file pins: if a screen's scroll content is a
 * CenteredColumn, the spacing between its cards belongs to the column —
 * passed as BOTH `style` and `innerStyle`, because CenteredColumn is a
 * plain pass-through on a phone and only grows its inner capped column
 * on a wider window, so a gap on one of the two is right half the time.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

/** Every screen whose scroll content is a CenteredColumn of cards. */
const SCREENS = [
  'src/screens/DuasScreen.tsx',
  'src/screens/LogScreen.tsx',
  'src/screens/FastingScreen.tsx',
  'src/screens/BackupScreen.tsx',
  'src/screens/SyncScreen.tsx',
  'src/screens/QuranDownloadsScreen.tsx',
];

describe('a stacked screen spaces its cards on the column', () => {
  it.each(SCREENS)('%s hands the column a stack style', file => {
    const src = read(file);
    // Every CenteredColumn that holds the page's cards carries both.
    const bare = src.match(/<CenteredColumn>/g) ?? [];
    expect(bare).toHaveLength(0);
    expect(src).toMatch(
      /<CenteredColumn\s+innerStyle=\{styles\.stack\}\s+style=\{styles\.stack\}>/,
    );
    expect(src).toMatch(/stack: \{ gap: /);
  });

  it.each(SCREENS)('%s no longer puts the gap where it does nothing', file => {
    const src = read(file);
    // The scroll content container may still pad; it must not claim to
    // space children it does not have.
    const container = /^\s{2}(content|list|scroll):\s*\{[^}]*\}/gm;
    for (const decl of src.match(container) ?? []) {
      expect(decl).not.toMatch(/\bgap:/);
    }
  });
});

describe('the spacing is a real value', () => {
  it.each(SCREENS)('%s stack gap is not zero', file => {
    const gap = /stack: \{ gap: ([^}]+)\}/.exec(read(file))?.[1]?.trim();
    expect(gap).toBeTruthy();
    expect(gap).not.toBe('0');
  });
});
