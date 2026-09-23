/**
 * Which word is under a point on a Ḥafṣ page.
 *
 * The word reader's finger lands somewhere on the page and then moves;
 * every position has to answer with a word, from the layout alone. The
 * same arithmetic `LineView` uses to answer a tap — a line is one text
 * run, and a word is found by walking the advances from the right — done
 * for the whole page: the line from the height (every row, band and
 * basmalah included, is one `lineHeight` tall), the word from the
 * distance in from the run's right edge, which sits at the middle of a
 * box centred in the page.
 */
import {
  lineBoxSlackEm,
  lineGapCount,
  lineSpaceEm,
  type MushafPageLayout,
  type MushafWord,
} from './mushafLayout';

export type PageGeometry = {
  width: number;
  fontSize: number;
  lineHeight: number;
  measureEm: number;
  framed: boolean;
};

/**
 * The word at (x, y) on the page, or null off the text — a band, a
 * basmalah, the margin above or below. The medallion counts as a word to
 * the layout but not to a reciter, so it answers the word before it.
 */
export function wordAtPoint(
  layout: MushafPageLayout,
  x: number,
  y: number,
  geometry: PageGeometry,
): MushafWord | null {
  const { width, fontSize, lineHeight, measureEm, framed } = geometry;
  if (lineHeight <= 0 || fontSize <= 0) return null;
  const index = Math.floor(y / lineHeight);
  const line = layout.lines[index];
  if (!line || line.kind !== 'ayah') return null;

  const spaceEm = lineSpaceEm(line, measureEm, { framed });
  const space = spaceEm * fontSize;
  const lineWidth = line.natural * fontSize + space * lineGapCount(line);
  const boxWidth = lineWidth + fontSize * lineBoxSlackEm();
  const boxLeft = (width - boxWidth) / 2;
  const runRightEdge = boxLeft + (boxWidth - lineWidth) / 2 + lineWidth;
  const xFromRight = runRightEdge - x;
  // Left of the run's start (to its right on screen) is still the first
  // word; past its end is the last — a finger that overshoots the line
  // is still on the line.
  let cursor = 0;
  let found: MushafWord | null = null;
  for (const word of line.words) {
    cursor += word.advance * fontSize + space;
    if (xFromRight <= cursor) {
      found = word;
      break;
    }
  }
  if (!found) found = line.words[line.words.length - 1] ?? null;
  if (found?.isEnd) {
    const i = line.words.indexOf(found);
    found = line.words[i - 1] ?? null;
  }
  return found;
}
