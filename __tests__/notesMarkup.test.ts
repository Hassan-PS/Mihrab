/**
 * The parser that turns a release note into something the sheet can draw.
 *
 * It is a hundred lines rather than a markdown dependency, which is only
 * defensible while it is right about the notes the app actually ships. So
 * the last describe walks EVERY note in the generated table, in every
 * language it exists in, and asserts that nothing is lost: every
 * non-blank line comes out the other side, and no block comes out empty.
 * A note written in a shape this parser does not understand fails here,
 * not on a phone.
 */
import { notePlainText, parseNote, parseSpans } from '../src/polish/notesMarkup';
import { CHANGELOG } from '../src/polish/releaseNotes';

describe('blocks', () => {
  it('reads a bullet list as one block, not one block per bullet', () => {
    // The gap between two bullets is the gap INSIDE a list. Emitting a
    // block each would space them like paragraphs and the list would stop
    // reading as a list.
    const blocks = parseNote('• one\n• two\n• three');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('list');
    expect(blocks[0].kind === 'list' && blocks[0].items).toHaveLength(3);
  });

  it('accepts every bullet character the notes have used', () => {
    for (const mark of ['•', '-', '*', '–']) {
      const blocks = parseNote(`${mark} a thing`);
      expect(blocks[0].kind).toBe('list');
    }
  });

  it('does not take a hyphenated number for a bullet', () => {
    // "-40 minutes" opens with a hyphen and is not a list item. The space
    // after the mark is what separates the two.
    const blocks = parseNote('-40 minutes earlier than it should be');
    expect(blocks[0].kind).toBe('paragraph');
  });

  it('keeps a paragraph and the list under it apart', () => {
    const blocks = parseNote('Mushaf reader:\n\n• one\n• two');
    expect(blocks.map(b => b.kind)).toEqual(['paragraph', 'list']);
  });

  it('separates a list from a paragraph with no blank line between them', () => {
    const blocks = parseNote('• one\nAnd then a sentence.');
    expect(blocks.map(b => b.kind)).toEqual(['list', 'paragraph']);
  });

  it('joins the lines of one paragraph with a space', () => {
    // A soft wrap in the source is a space, everywhere else markdown is
    // read. Two lines of one sentence must not become two paragraphs.
    const blocks = parseNote('One sentence that was\nwrapped in the file.');
    expect(blocks).toHaveLength(1);
    expect(notePlainText('One sentence that was\nwrapped in the file.')).toBe(
      'One sentence that was wrapped in the file.',
    );
  });

  it('ends a paragraph at a blank line', () => {
    const blocks = parseNote('First.\n\nSecond.');
    expect(blocks.map(b => b.kind)).toEqual(['paragraph', 'paragraph']);
  });

  it('returns nothing at all for an empty note', () => {
    expect(parseNote('')).toEqual([]);
    expect(parseNote('   \n\n  ')).toEqual([]);
    expect(parseNote(undefined as unknown as string)).toEqual([]);
  });

  it('never emits a block with nothing in it', () => {
    // A bullet with no text after it — "• " — is a line that would draw
    // as a lone bullet against empty space.
    for (const block of parseNote('• \n•\n• real')) {
      if (block.kind === 'list') {
        expect(block.items.length).toBeGreaterThan(0);
        for (const item of block.items) expect(item.length).toBeGreaterThan(0);
      } else {
        expect(block.spans.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('inline bold', () => {
  it('splits a line into bold and plain runs', () => {
    expect(parseSpans('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ]);
  });

  it('handles a line that is entirely bold', () => {
    expect(parseSpans('**all of it**')).toEqual([
      { text: 'all of it', bold: true },
    ]);
  });

  it('leaves a lone asterisk exactly as typed', () => {
    // "3 * 4" is arithmetic and "**" half-written is a typo its author
    // should be able to see.
    expect(parseSpans('3 * 4')).toEqual([{ text: '3 * 4', bold: false }]);
    expect(parseSpans('**unclosed')).toEqual([
      { text: '**unclosed', bold: false },
    ]);
  });

  it('survives being called twice on the same string', () => {
    // The regex is module-level and stateful; a forgotten lastIndex reset
    // makes every second call return something different.
    const once = parseSpans('a **b** c');
    expect(parseSpans('a **b** c')).toEqual(once);
  });
});

describe('every note the app actually ships', () => {
  const all = CHANGELOG.flatMap(r =>
    Object.entries(r.notes).map(([language, text]) => ({
      id: `${r.version} (${language})`,
      text,
    })),
  );

  it('has something to parse', () => {
    expect(all.length).toBeGreaterThanOrEqual(58);
  });

  it('loses no line of any of them', () => {
    const lost: string[] = [];
    for (const { id, text } of all) {
      const before = text
        .split('\n')
        .map(l => l.replace(/^\s*[•\-*–]\s+/, '').trim())
        .filter(l => l.length > 0);
      const after = notePlainText(text)
        .split(/\n|\. (?=\S)/)
        .map(l => l.trim())
        .filter(l => l.length > 0);
      // Not an equality: paragraphs join and list items are rejoined with
      // ". ", so the shapes differ. What must hold is that every word of
      // the source is still somewhere in the output.
      const flat = notePlainText(text);
      for (const line of before) {
        if (!flat.includes(line)) lost.push(`${id}: ${line.slice(0, 40)}`);
      }
      expect(after.length).toBeGreaterThan(0);
    }
    expect(lost).toEqual([]);
  });

  it('produces at least one block for each', () => {
    const empty = all.filter(n => parseNote(n.text).length === 0);
    expect(empty.map(n => n.id)).toEqual([]);
  });
});
