/**
 * The Tilāwah preview is a FOUR-LINE window, and four lines is a size
 * that only works if the arithmetic underneath it is exact.
 *
 * At 340 points the follow-scroll could be a few percent off the real
 * line pitch and nobody could tell. It was: the pitch was derived from
 * `pageBlockEm` (the width the FONT is sized against) while the column
 * itself is sized against `pageMeasureEm` and then re-divided by
 * `fitLinesWithInk`. Over fifteen lines that is most of a line of drift,
 * plus the ink reserve the first line starts below. Invisible in a tall
 * viewport; the entire error in a short one.
 *
 * So `mushafLineGeometry` asks the same two functions the surface asks,
 * and this is the round trip that keeps it honest.
 */
import { getPageLayout } from '../src/quran/mushafLayout';
import {
  mushafLineGeometry,
  mushafPageColumnHeight,
} from '../src/quran/MushafTextPageSurface';
import { ayahLineIndex } from '../src/quran/mushafFollowScroll';

const WIDTH = 340;
/** A dense Hafs page with a full ruling of lines. */
const PAGE = 267;

describe('the geometry of a scrolling column', () => {
  const columnHeight = mushafPageColumnHeight({
    page: PAGE,
    textWidth: WIDTH,
    // One point: the column height is the page's own, not the viewport's.
    viewportHeight: 1,
    scrolling: true,
  });

  it('fills the column it was measured from', () => {
    const g = mushafLineGeometry({
      page: PAGE,
      textWidth: WIDTH,
      columnHeight,
    });
    expect(g).not.toBeNull();
    // top + n lines + the bottom reserve IS the column. A pitch that did
    // not add up would put every line a little further off than the last.
    const spanned = g!.top + g!.pitch * g!.lineCount;
    expect(spanned).toBeLessThanOrEqual(columnHeight + 1);
    expect(spanned).toBeGreaterThan(columnHeight - 40);
  });

  it('counts the lines the page actually has', () => {
    const g = mushafLineGeometry({
      page: PAGE,
      textWidth: WIDTH,
      columnHeight,
    });
    expect(g!.lineCount).toBe(getPageLayout(PAGE)!.lines.length);
  });

  it('answers nothing for a width or a column that is not there yet', () => {
    expect(
      mushafLineGeometry({ page: PAGE, textWidth: 0, columnHeight }),
    ).toBeNull();
    expect(
      mushafLineGeometry({ page: PAGE, textWidth: WIDTH, columnHeight: 0 }),
    ).toBeNull();
  });
});

describe('the window onto it', () => {
  const columnHeight = mushafPageColumnHeight({
    page: PAGE,
    textWidth: WIDTH,
    viewportHeight: 1,
    scrolling: true,
  });
  const g = mushafLineGeometry({ page: PAGE, textWidth: WIDTH, columnHeight })!;
  const viewport = Math.round(g.top + g.pitch * 4);

  const offsetFor = (index: number) =>
    Math.max(
      0,
      Math.min(g.top + index * g.pitch, Math.max(0, columnHeight - viewport)),
    );

  it('is four lines tall', () => {
    // Comfortably under a third of the page, and more than one line.
    expect(viewport).toBeGreaterThan(g.pitch * 3);
    expect(viewport).toBeLessThan(columnHeight / 2);
  });

  it('puts the recited line at the top, with the next ones under it', () => {
    const index = 3;
    const y = offsetFor(index);
    const lineTop = g.top + index * g.pitch;
    expect(y).toBeCloseTo(lineTop, 5);
    // The three that follow are inside the window.
    expect(lineTop + g.pitch * 4).toBeLessThanOrEqual(y + viewport + 1);
  });

  /**
   * The foot of the page. With fewer than three lines left below it the
   * window stops moving, so the recited line arrives at the BOTTOM with
   * its predecessors above — which is the only honest thing four lines
   * can show there, and is what the user asked for.
   */
  it('shows the previous lines once the page runs out', () => {
    const last = g.lineCount - 1;
    const y = offsetFor(last);
    expect(y).toBeCloseTo(columnHeight - viewport, 5);
    const lineTop = g.top + last * g.pitch;
    // Still in view…
    expect(lineTop).toBeGreaterThanOrEqual(y);
    expect(lineTop + g.pitch).toBeLessThanOrEqual(y + viewport + 1);
    // …but no longer at the top of it.
    expect(lineTop).toBeGreaterThan(y + g.pitch);
  });
});

describe('the line an ayah is on', () => {
  it('is found by index, so a caller resolves it with the real geometry', () => {
    const layout = getPageLayout(PAGE)!;
    const first = layout.lines.find(l => l.kind === 'ayah')!;
    const word = first.kind === 'ayah' ? first.words[0] : null;
    expect(word).not.toBeNull();
    const index = ayahLineIndex(PAGE, word!.surah, word!.ayah);
    expect(index).toBe(layout.lines.indexOf(first));
  });

  it('is null for an ayah that is not on the page', () => {
    expect(ayahLineIndex(PAGE, 1, 1)).toBeNull();
  });
});
