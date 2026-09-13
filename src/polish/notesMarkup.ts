/**
 * The little bit of markdown a release note actually uses.
 *
 * ── WHY NOT A MARKDOWN LIBRARY ────────────────────────────────────────
 *
 * The notes are Play's, and Play accepts almost nothing: a bullet is a
 * line that starts with a bullet character, a paragraph is a line that
 * does not, and blank lines separate them. Fifty-eight releases of them
 * use exactly that and nothing else — no headings, no links, no tables,
 * no code. `react-native-markdown-display` and its kin are 40–120 KB of
 * dependency, a parser with its own HTML escape rules, and a styling API
 * that would have to be re-taught this app's tokens anyway.
 *
 * So: one function, a hundred lines, and a test that walks every note in
 * the generated table and asserts nothing is dropped on the floor. A
 * format the app controls both ends of does not need a general parser.
 *
 * ── WHAT IT UNDERSTANDS ───────────────────────────────────────────────
 *
 *   • a bullet             — a line opening with •, -, * or –
 *   a paragraph            — any other line
 *   (blank line)           — ends the block above it
 *   **bold**               — inline, the lead-in phrase CHANGELOG.md sets
 *                            in bold; not yet used by a Play note, and
 *                            here so that the first one that does is
 *                            typeset rather than shown with its asterisks
 *
 * Consecutive bullets become ONE list, so the gap between two bullets is
 * the gap inside a list rather than the gap between blocks. Consecutive
 * paragraph lines join with a space, which is what a soft wrap means
 * everywhere else markdown is read.
 */

/** A run of text, bold or not. */
export type Span = { text: string; bold: boolean };

export type NoteBlock =
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'list'; items: Span[][] };

/**
 * The characters Play's notes have used to open a bullet.
 *
 * `•` is what every note written since 2.8 uses; the hyphen and the
 * asterisk are markdown's own, and the en dash is what a word processor
 * turns a hyphen into. All four are followed by a space — a line that
 * begins "- " is a bullet, a line that begins "-40 minutes" is not.
 */
const BULLET = /^\s*[•\-*–]\s+/;

/** `**bold**`, non-greedy, never spanning a blank line. */
const BOLD = /\*\*([^*\n][^*]*?)\*\*/g;

/**
 * Split one line into bold and plain runs.
 *
 * Unmatched asterisks are left exactly as typed: a note reading "3 * 4"
 * is arithmetic, and a half-written `**` is a typo that should be visible
 * to whoever wrote it rather than silently eaten.
 */
export function parseSpans(line: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  BOLD.lastIndex = 0;
  for (let m = BOLD.exec(line); m; m = BOLD.exec(line)) {
    if (m.index > at) {
      spans.push({ text: line.slice(at, m.index), bold: false });
    }
    spans.push({ text: m[1], bold: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) {
    spans.push({ text: line.slice(at), bold: false });
  }
  // An empty line has no spans at all rather than one empty span, so a
  // caller measuring `spans.length` is not told there is something here.
  return spans.filter(s => s.text.length > 0);
}

/**
 * One note's raw text to the blocks that draw it.
 *
 * Never throws and never returns a block with nothing in it: a note that
 * is only whitespace produces an empty array, which the sheet renders as
 * the release having said nothing — which is the truth about it.
 */
export function parseNote(raw: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  let items: Span[][] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const spans = parseSpans(paragraph.join(' '));
    if (spans.length > 0) blocks.push({ kind: 'paragraph', spans });
    paragraph = [];
  };
  const flushList = () => {
    if (items.length === 0) return;
    blocks.push({ kind: 'list', items });
    items = [];
  };

  for (const line of (raw ?? '').replace(/\r\n/g, '\n').split('\n')) {
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    if (BULLET.test(line)) {
      flushParagraph();
      const spans = parseSpans(line.replace(BULLET, '').trim());
      if (spans.length > 0) items.push(spans);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * The note with its markup removed and its blocks flattened.
 *
 * Not drawn anywhere: this is what `notesMarkup.test.ts` walks every
 * shipped note through to prove the parser drops nothing. A round trip
 * that loses a sentence is invisible in the tree and obvious in a string.
 */
export function notePlainText(raw: string): string {
  return parseNote(raw)
    .map(b =>
      b.kind === 'paragraph'
        ? b.spans.map(s => s.text).join('')
        : b.items.map(i => i.map(s => s.text).join('')).join('. '),
    )
    .join('\n');
}
