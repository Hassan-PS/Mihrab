/**
 * The printed Warsh line: the table that ships, and the split that sets
 * text into it.
 *
 * Unlike `riwayahUnicodePage.test.ts` this one CAN read real data, because
 * the line table is not scripture — it is a table of line widths, CC0, and
 * it is in the repository (`src/quran/data/warshLines.json`). The text is
 * not, so everything here that needs words uses invented ones.
 *
 * Three faults are pinned, all of which shipped and all of which showed up
 * as a hole or a bulge on a page:
 *
 *   • the rub-el-hizb rosette counted as no width at all, which put a
 *     four-word line beside a twenty-one-word one on 433 pages;
 *   • the cut search stopping at the first boundary that did not improve,
 *     which is only safe if no word has zero width; and
 *   • an ayah set across a page turn being laid out whole on both sides
 *     of it.
 */
import {
  advancingLength,
  allocate,
  printedLinesFor,
  splitByShare,
  type PrintedPage,
} from '../src/quran/mushafPrintedLines';

/** The rosette that stands alone as a word in 435 places. */
const ROSETTE = '\u06DE';
/** A fatha — a mark, which stacks and takes no width. */
const FATHA = '\u064E';
/** The ayah medallion's share of a line, from `tools/qiraat/lines.py`. */
const MARKER_SHARE = 20.17 / 331;

const word = (letters: number) =>
  `${'\u0628'.repeat(letters)}${FATHA}`;

describe('what advances the pen', () => {
  it('gives the rub-el-hizb rosette the width the font gives it', () => {
    // AmiriQuran puts U+06DE at 0.652 em against a mean Arabic letter of
    // 0.615 em, so it is one letter wide — and emphatically not zero.
    expect(advancingLength(ROSETTE)).toBe(1);
    expect(advancingLength('\u06E9')).toBe(1); // sajdah
  });

  it('still gives the marks no width', () => {
    expect(advancingLength(FATHA)).toBe(0);
    expect(advancingLength('\u064F\u0651\u06E2')).toBe(0);
    expect(advancingLength(`\u0628${FATHA}\u0628`)).toBe(2);
  });
});

describe('splitting an ayah across the lines it is printed on', () => {
  it('returns one run per line, each with a word in it', () => {
    const words = Array.from({ length: 9 }, () => word(4));
    const pieces = splitByShare(words, [1, 1, 1]);
    expect(pieces).toHaveLength(3);
    for (const piece of pieces) expect(piece.length).toBeGreaterThan(0);
    expect(pieces.flat()).toEqual(words);
  });

  it('splits equal shares equally', () => {
    const words = Array.from({ length: 12 }, () => word(4));
    expect(splitByShare(words, [1, 1, 1]).map(p => p.length)).toEqual([4, 4, 4]);
  });

  it('follows the shares when they are not equal', () => {
    const words = Array.from({ length: 20 }, () => word(4));
    // 50/30/20 of eighty advancing characters.
    expect(splitByShare(words, [0.5, 0.3, 0.2]).map(p => p.length)).toEqual([
      10, 6, 4,
    ]);
  });

  it('does not starve the last line, which is what filling did', () => {
    // The old rule filled every cut but the last and left the last one
    // whatever remained: with seven equal lines the closing one came out
    // short every time.
    const words = Array.from({ length: 70 }, () => word(4));
    const sizes = splitByShare(words, [1, 1, 1, 1, 1, 1, 1]).map(p => p.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('is not derailed by a word that is only a rosette', () => {
    // Two consecutive boundaries with the same running width. The search
    // used to stop on the first of them and cut the line there.
    const words = [
      ...Array.from({ length: 10 }, () => word(4)),
      ROSETTE,
      ...Array.from({ length: 9 }, () => word(4)),
    ];
    const sizes = splitByShare(words, [1, 1]).map(p =>
      p.reduce((n, w) => n + advancingLength(w), 0),
    );
    expect(Math.abs(sizes[0] - sizes[1])).toBeLessThanOrEqual(4);
  });

  it('leaves a single share alone', () => {
    const words = [word(3), word(5)];
    expect(splitByShare(words, [1])).toEqual([words]);
  });
});

describe('an ayah set across a page turn', () => {
  const rows: PrintedPage = [
    [{ surah: 2, ayah: 1, share: 1 }],
    [{ surah: 2, ayah: 1, share: 1 }],
  ];
  const words = Array.from({ length: 40 }, () => word(4));
  const textOf = () => words.join(' ');

  it('takes the whole ayah when the ayah is wholly on the page', () => {
    const out = allocate(rows, textOf);
    expect(out).not.toBeNull();
    expect(out!.flatMap(l => l.ayahs.flatMap(a => a.text.split(' ')))).toEqual(
      words,
    );
    // It ends here, so the medallion is here.
    expect(out![1].ayahs[0].ends).toBe(true);
  });

  it('takes only its own share when the rest is on the next page', () => {
    // Two of the ayah's four line-widths are on the page after this one.
    const out = allocate(rows, textOf, () => ({ before: 0, after: 2 }));
    const set = out!.flatMap(l => l.ayahs.flatMap(a => a.text.split(' ')));
    expect(set).toEqual(words.slice(0, set.length));
    expect(set.length).toBeGreaterThan(15);
    expect(set.length).toBeLessThan(25);
  });

  it('does not draw the medallion on a page the ayah does not end on', () => {
    const out = allocate(rows, textOf, () => ({ before: 0, after: 2 }));
    expect(out!.every(l => l.ayahs.every(a => !a.ends))).toBe(true);
  });

  it('takes the tail when the ayah began on the page before', () => {
    const out = allocate(rows, textOf, () => ({ before: 2, after: 0 }));
    const set = out!.flatMap(l => l.ayahs.flatMap(a => a.text.split(' ')));
    expect(set[set.length - 1]).toBe(words[words.length - 1]);
    expect(out![1].ayahs[0].ends).toBe(true);
  });
});

describe('the table that ships, on every page of it', () => {
  const pages = Array.from({ length: 604 }, (_, i) => i + 1)
    .map(p => [p, printedLinesFor('warsh', p)] as const)
    .filter((e): e is readonly [number, PrintedPage] => e[1] !== null);

  it('covers the book', () => {
    expect(pages.length).toBeGreaterThan(595);
  });

  it('gives every page the print’s fifteen rows', () => {
    for (const [page, rows] of pages) {
      expect([page, rows.length]).toEqual([page, 15]);
    }
  });

  it('fills every row to the measure once the medallions are counted', () => {
    // A row's spans stop short of the margin by exactly the medallions on
    // it. Nothing in the book is a genuinely short line, so the renderer
    // is right to justify every row to the full measure — and if that ever
    // stops being true, this is where it shows.
    const ended = new Map<string, string>();
    for (const [page, rows] of pages) {
      rows.forEach((row, i) => {
        for (const span of row) {
          ended.set(`${span.surah}:${span.ayah}`, `${page}:${i}`);
        }
      });
    }
    const marks = new Map<string, number>();
    for (const at of ended.values()) {
      marks.set(at, (marks.get(at) ?? 0) + 1);
    }

    let worst = 0;
    const off: string[] = [];
    for (const [page, rows] of pages) {
      rows.forEach((row, i) => {
        if (row.length === 0) return;
        // The row a surah ends on is allowed to be short — that is what
        // `AllocatedLine.share` carries. Every other row is a full line.
        if (rows[i + 1]?.length === 0) return;
        const share = row.reduce((n, s) => n + s.share, 0);
        const full = share + MARKER_SHARE * (marks.get(`${page}:${i}`) ?? 0);
        worst = Math.max(worst, Math.abs(full - 1));
        if (Math.abs(full - 1) > 0.03) off.push(`page ${page} line ${i}`);
      });
    }

    // Four rows, and they are the four ayahs the print sets across a page
    // turn: the row that hands one on carries no medallion, but the table
    // has still left the medallion's room on it. Six per cent of a line,
    // on four lines of 8,807, and the word gaps close it without anyone
    // seeing. Named rather than hidden — if a fifth ever appears it is a
    // different fault and this should say so.
    expect(off).toEqual([
      'page 85 line 14',
      'page 317 line 14',
      'page 354 line 14',
      'page 355 line 14',
    ]);
    expect(worst).toBeLessThan(0.07);
  });

  it('sets no surah above its own band', () => {
    // A muṣḥaf cannot put a surah's words before its title band and
    // basmalah. Three spans in the table did; the worst took "qul aʿūdhu"
    // off the front of al-Falaq and set it at the end of al-Ikhlāṣ.
    const wrong: string[] = [];
    for (const [page, rows] of pages) {
      let i = 0;
      while (i < rows.length) {
        if (rows[i].length > 0) {
          i += 1;
          continue;
        }
        let j = i;
        while (j < rows.length && rows[j].length === 0) j += 1;
        const opens = rows[j]?.[0];
        if (opens && opens.ayah === 1) {
          for (let k = 0; k < i; k++) {
            if (rows[k].some(s => s.surah === opens.surah)) {
              wrong.push(`page ${page} line ${k}`);
            }
          }
        }
        i = j > i ? j : i + 1;
      }
    }
    expect(wrong).toEqual([]);
  });

  it('leaves al-Ikhlāṣ closing short and al-Falaq opening whole', () => {
    const rows = printedLinesFor('warsh', 604)!;
    // The row above al-Falaq's band is al-Ikhlāṣ's last ayah and nothing
    // else, and it stops at four fifths of the measure.
    expect(rows[3].map(s => `${s.surah}:${s.ayah}`)).toEqual(['112:4']);
    const words = Array.from({ length: 5 }, () => word(4));
    const out = allocate(rows, (s, a) => (s === 113 && a === 1 ? words.join(' ') : word(3)));
    expect(out![3].share).toBeLessThan(0.85);
    expect(out![6].share).toBe(1);
    // Every word of al-Falaq's first ayah is on the first row under the
    // basmalah, and none of it is anywhere else.
    expect(out![6].ayahs[0]).toMatchObject({ surah: 113, ayah: 1, ends: true });
    expect(out![6].ayahs[0].text.split(' ')).toHaveLength(5);
  });
});
