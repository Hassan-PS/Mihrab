/**
 * THE KHATMAH OPTIONS DIALOG, DRAWN THROUGH THE CLOCK.
 *
 * Reported with a screenshot: "Khatmah options" printed across the status
 * bar, over the time and the camera. The card is absolutely positioned,
 * and it had no vertical anchor — when the anchor moved out of `menuCard`
 * into `menuCardResting` so the keyboard-lifted dialogs could take one or
 * the other, the two dialogs with a text field were given it and this one
 * was not. An absolute box with no `top` sits at the top of its window.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const screen = readFileSync(
  join(__dirname, '..', 'src', 'screens', 'QuranScreen.tsx'),
  'utf8',
);

describe('every dialog on the Quran page knows where it goes', () => {
  it('no card is drawn with the base style and nothing to anchor it', () => {
    // The shape of the bug: `menuCard` alone, followed straight by the
    // colour and nothing that says top, bottom or centre.
    expect(screen).not.toMatch(
      /style=\{\[styles\.menuCard, \{ backgroundColor: palette\.card \}\]\}/,
    );
    // And every use of the absolute base is followed by an anchor.
    const uses = [...screen.matchAll(/styles\.menuCard,/g)];
    for (const use of uses) {
      const after = screen.slice(use.index!, use.index! + 400);
      expect(after).toMatch(/menuCardResting|bottom:/);
    }
  });

  it('the khatmah options are centred between the safe-area insets', () => {
    // Not a fixed "25% down": this is the tallest dialog in the app — five
    // rows of two lines, at whatever text size the reader has chosen — so
    // a guessed height would push it off the bottom instead.
    expect(screen).toMatch(
      /styles\.menuCentre,[\s\S]{0,120}paddingTop: insets\.top \+ SPACING\.lg,[\s\S]{0,80}paddingBottom: insets\.bottom \+ SPACING\.lg/,
    );
    expect(screen).toMatch(/menuCentre: \{[\s\S]{0,120}justifyContent: 'center'/);
    expect(screen).toContain('useSafeAreaInsets()');
  });

  it('scrolls its rows rather than overflowing, and still closes from outside', () => {
    expect(screen).toMatch(/<ScrollView\s*\n\s*style=\{styles\.menuRows\}/);
    expect(screen).toMatch(/menuRows: \{ flexGrow: 0, flexShrink: 1 \}/);
    expect(screen).toMatch(/menuCardCentred: \{\s*\n\s*maxHeight: '100%'/);
    // A tap beside the card has to reach the backdrop under it.
    expect(screen).toMatch(/pointerEvents="box-none"\s*\n\s*style=\{\[\s*\n\s*styles\.menuCentre/);
  });
});
