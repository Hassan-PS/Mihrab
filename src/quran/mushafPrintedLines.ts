/**
 * The printed line, for a riwayah whose text carries no line assignment.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * `MushafUnicodePage` reflows: it fits a font size to the box and lets the
 * text wrap where it will. On a phone that gave thirteen lines where the
 * print has fifteen, breaks falling nowhere near the printed ones, and a
 * third of the page empty underneath. A muṣḥaf whose lines are not the
 * muṣḥaf's lines is a different book to anyone who has memorised from one.
 *
 * The Hafs pages solve this with a per-page font whose every line is a
 * given: `mushafLayoutV2.json` says which glyphs are on which line. No
 * such table is published for Warsh, and the text export has no
 * `line_number` in it.
 *
 * What IS published, CC0, is a polygon per ayah per page
 * (`quranpedia/quran-svg`) — and a polygon is a statement about lines: it
 * says which rows of the page an ayah occupies and how much of each. That
 * is not word-level, but it is ayah-level, and ayah-level is what a reader
 * sees. `tools/qiraat/lines.py` reduces those polygons to this table.
 *
 * ── WHAT IS EXACT HERE, AND WHAT IS NOT ───────────────────────────────
 *
 * Exact: how many lines a page has, which ayahs are on each line, and in
 * what order — including the rows a surah band takes, which appear as
 * lines with nothing on them.
 *
 * Not exact: where the break falls INSIDE an ayah that spans two lines.
 * The table says an ayah takes 73% of one line and 27% of the next; this
 * splits its words to match that ratio. With the printed face those two
 * would be the same thing. With a substituted face they are close, and
 * the alternative — pretending the whole page is a paragraph — is not
 * close at all.
 *
 * ── AND WHY IT IS BUNDLED ─────────────────────────────────────────────
 *
 * The app ships no riwayah TEXT: it has no right to pass scripture on, and
 * `riwayahStore.ts` has that argument in full. This is not text. It is a
 * table of line counts and widths, meaningless without a muṣḥaf to lay
 * out, CC0 where the polygons are, and 31 KB in the shipped APK. Keeping
 * it out would mean a second download to make the first one legible.
 */
import type { RiwayahId } from './riwayat';

type PrintedTable = {
  /**
   * The medallion's share of the measure, in THIS edition's frame.
   *
   * It travels with the table because it belongs to the export the table
   * was cut from, not to the app: Warsh's polygons were published on a
   * 331-unit measure and the current ones on 345, which moves the
   * medallion from 0.061 of a line to 0.069. The number used to be a
   * constant repeated in the tool, the renderer and its test, and three
   * copies of a number that can change is three chances to disagree.
   */
  marker?: number;
  lines: Record<string, number[][][]>;
};

/**
 * ── ONE TABLE CAN SERVE TWO RIWAYAT ───────────────────────────────────
 *
 * Keyed by riwayah, but the value is an EDITION, and the two are not the
 * same thing. KFGQPC sets Warsh and Qālūn from one typesetting: all 6,214
 * ayahs fall on the same page in both, the publisher's polygon files are
 * byte-identical on 602 of the 604 pages, and page 100 of each breaks at
 * the same word on all fifteen lines. They differ in orthography, which
 * is text, and not in layout, which is this.
 *
 * So they share a table. That is 132 KB of APK saved, and — the reason
 * that matters more — it makes it impossible for the two to drift apart
 * later, which two copies of a generated file eventually would.
 *
 * A riwayah absent from here is not broken: it has no printed table, so
 * `MushafUnicodePage` reflows it instead. That is the honest fallback and
 * it is what every riwayah did before there was a table at all.
 */
const TABLES: Partial<Record<RiwayahId, PrintedTable>> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  warsh: require('./data/warshLines.json') as PrintedTable,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  qalun: require('./data/warshLines.json') as PrintedTable,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  shubah: require('./data/shubahLines.json') as PrintedTable,
};

/**
 * The medallion's share of the measure for a riwayah's table.
 *
 * Falls back to the Warsh figure, which is what the tables written before
 * they carried their own were cut with.
 */
export function markerShare(riwayah: RiwayahId): number {
  return TABLES[riwayah]?.marker ?? 20.17 / 331;
}

/** One ayah's share of one line. `share` is 0..1 of the line's measure. */
export type PrintedSpan = { surah: number; ayah: number; share: number };

/**
 * The rows of a page, in order. An empty row is a surah band's, or a
 * basmalah's — it is a line of the print with no ayah on it.
 */
export type PrintedPage = PrintedSpan[][];

const CACHE = new Map<string, PrintedPage | null>();

/**
 * Unpack the stored form.
 *
 * Rows are `[surah, ayah, percent]`, with the surah left out whenever it
 * repeats the span before it — which it does for all but a hundred or so
 * spans in the book.
 */
function unpack(rows: number[][][]): PrintedPage {
  const out: PrintedPage = [];
  let surah = 0;
  for (const row of rows) {
    const line: PrintedSpan[] = [];
    for (const span of row) {
      if (span.length === 3) surah = span[0];
      const [ayah, percent] = span.length === 3 ? [span[1], span[2]] : span;
      line.push({ surah, ayah, share: percent / 100 });
    }
    out.push(line);
  }
  return settle(out);
}

/**
 * Nothing of a surah may be set above the band that opens it.
 *
 * A muṣḥaf cannot put a surah's words before its own title band and
 * basmalah, so a span that claims to is an artefact of reducing polygons
 * to rows and not a line of the print. Three exist in the book —
 * page 528 (54:1), page 603 (110:1) and page 604 (113:1) — and the last
 * of them took "qul aʿūdhu" off the front of al-Falaq and set it at the
 * end of al-Ikhlāṣ, two rows above its own band.
 *
 * They are dropped rather than moved down: the row below is already full
 * to the measure without them, and each ayah's remaining share is enough
 * to hold all of its words. What is left behind is a genuinely short row —
 * the line that closes a surah — which is what `AllocatedLine.share` is
 * for.
 */
function settle(rows: PrintedPage): PrintedPage {
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
        rows[k] = rows[k].filter(span => span.surah !== opens.surah);
      }
    }
    i = j > i ? j : i + 1;
  }
  return rows;
}

/** The printed rows of a page, or null when this riwayah has no table. */
export function printedLinesFor(
  riwayah: RiwayahId,
  page: number,
): PrintedPage | null {
  const table = TABLES[riwayah];
  if (!table) return null;
  const key = `${riwayah}:${page}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  const rows = table.lines[String(page)];
  const value = rows ? unpack(rows) : null;
  CACHE.set(key, value);
  return value;
}

/**
 * Characters that do NOT advance the pen — the marks, which stack above
 * and below the letters and take no width of their own.
 *
 * Three codepoints inside the Qur'anic block are NOT marks and must not be
 * in here, because each is a symbol set on the line like a letter. The
 * bundled face gives their advances as:
 *
 *     U+06DE  rub el hizb   0.652 em
 *     U+06E9  sajdah        0.671 em
 *     U+06DD  end of ayah   1.279 em
 *
 * against a mean Arabic letter of 0.615 em, so the rosette and the sajdah
 * sign each count as one letter and are within 9% of it.
 *
 * Counting the rosette as nothing is what broke page 30. It stands alone
 * as a word in 435 places, on 433 of the 602 pages, and a word of width
 * zero makes two consecutive word boundaries identical — which stopped the
 * cut search dead on the first of them and left a line of four words
 * beside a line of twenty-one. Every one of those 433 pages had it.
 */
const NON_ADVANCING =
  /[\u0610-\u061A\u064B-\u0652\u0655-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u08D3-\u08FF\u200C-\u200F]/g;

export function advancingLength(text: string): number {
  return text.replace(NON_ADVANCING, '').length;
}

export type AllocatedAyah = {
  surah: number;
  ayah: number;
  /** The words of this ayah that belong on this line, already joined. */
  text: string;
  /** True on the line where the ayah ends, which is where its number goes. */
  ends: boolean;
};

export type AllocatedLine = {
  ayahs: AllocatedAyah[];
  /** A row of the print with no ayah on it: a band, or a basmalah. */
  empty: boolean;
  /**
   * How much of the measure this row fills, 0..1 — almost always 1.
   *
   * Every row of the book reaches the margin except the one that closes a
   * surah, which stops where the surah does and has the band under it. Two
   * are materially short (page 528 at 0.75, page 604 at 0.80) and a
   * handful more are a little short; everything else is a full line and is
   * set as one.
   */
  share: number;
};

/**
 * The room the medallion takes on the row an ayah ends on, as a fraction
 * of the measure: 20.17 of the print's 331 units, the figure
 * `tools/qiraat/lines.py` subtracts when it reduces the polygons to rows.
 * The table records the WORDS on a row, and this is the rest of it.
 */
export const MARKER_SHARE = 20.17 / 331;

/** How much of an ayah is set on the page before this one, and after it. */
export type PageSpill = { before: number; after: number };

/** Everything one ayah takes on one page, in line-widths. */
function shareOn(riwayah: RiwayahId, page: number, key: string): number {
  const rows = printedLinesFor(riwayah, page);
  if (!rows) return 0;
  let total = 0;
  for (const line of rows) {
    for (const span of line) {
      if (`${span.surah}:${span.ayah}` === key) total += span.share;
    }
  }
  return total;
}

/**
 * The rows of a page with this riwayah's text set into them.
 *
 * Wraps `allocate` with the one thing a single page's table cannot know:
 * whether an ayah on it is also on the page before or after. Four are.
 */
export function printedPageFor(
  riwayah: RiwayahId,
  page: number,
  textOf: (surah: number, ayah: number) => string | null,
): AllocatedLine[] | null {
  const rows = printedLinesFor(riwayah, page);
  if (!rows) return null;
  return allocate(
    rows,
    textOf,
    (surah, ayah) => {
      const key = `${surah}:${ayah}`;
      return {
        before: shareOn(riwayah, page - 1, key),
        after: shareOn(riwayah, page + 1, key),
      };
    },
    markerShare(riwayah),
  );
}

/**
 * Split each ayah's words across the lines the print puts it on.
 *
 * Proportional to the share the table records, measured in advancing
 * characters rather than words: a four-letter word and a twelve-letter one
 * are not the same amount of line, and counting words instead makes the
 * ratio wrong exactly where ayahs are long.
 *
 * Every line an ayah occupies gets at least one word — an empty stretch on
 * a line the print says is occupied would open a hole nothing fills.
 */
export function allocate(
  rows: PrintedPage,
  textOf: (surah: number, ayah: number) => string | null,
  spill?: (surah: number, ayah: number) => PageSpill,
  /** The medallion's share, which belongs to the table — `markerShare`. */
  marker: number = MARKER_SHARE,
): AllocatedLine[] | null {
  // Which rows each ayah is on, in order, with its shares.
  const spread = new Map<string, { rows: number[]; shares: number[] }>();
  rows.forEach((line, index) => {
    for (const span of line) {
      const key = `${span.surah}:${span.ayah}`;
      const found = spread.get(key) ?? { rows: [], shares: [] };
      found.rows.push(index);
      found.shares.push(span.share);
      spread.set(key, found);
    }
  });

  const perLine: AllocatedAyah[][] = rows.map(() => []);
  for (const [key, { rows: on, shares }] of spread) {
    const [surah, ayah] = key.split(':').map(Number);
    const text = textOf(surah, ayah);
    if (text == null) return null;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    // ── THE PAGE IS NOT ALWAYS THE WHOLE AYAH ──────────────────────────
    //
    // Four ayahs in the book are set across a page turn, and for those the
    // rows on THIS page hold only part of the text. Splitting the whole
    // ayah across them puts the other page's words on this one as well —
    // the same words twice, once on each side of the turn, and both pages
    // overfull. The share the other page takes goes into the split as a
    // run of its own and is then dropped, so what is left is this page's
    // words in this page's proportions.
    const { before, after } = spill?.(surah, ayah) ?? { before: 0, after: 0 };
    const withSpill = [
      ...(before > 0 ? [before] : []),
      ...shares,
      ...(after > 0 ? [after] : []),
    ];
    const all = splitByShare(words, withSpill);
    const pieces = all.slice(before > 0 ? 1 : 0, after > 0 ? -1 : undefined);

    pieces.forEach((piece, i) => {
      perLine[on[i]].push({
        surah,
        ayah,
        text: piece.join(' '),
        // The medallion belongs to the row the ayah actually ends on. When
        // the ayah runs on to the next page it does not end here at all.
        ends: after <= 0 && i === pieces.length - 1,
      });
    });
  }

  return rows.map((line, index) => {
    // Restore the print's order within the line: the table is written
    // right to left, which is the order it is read in.
    const order = new Map(line.map((s, i) => [`${s.surah}:${s.ayah}`, i]));
    const ayahs = perLine[index].slice().sort(
      (a, b) =>
        (order.get(`${a.surah}:${a.ayah}`) ?? 0) -
        (order.get(`${b.surah}:${b.ayah}`) ?? 0),
    );

    // ── ONLY A SURAH'S LAST ROW MAY BE SHORT ───────────────────────────
    //
    // Read from the table, a row's spans plus the medallions on it come to
    // the measure on 8,800 of the book's 8,807 rows, so a row is a full
    // line unless the print itself ended one — which it does under a band
    // and nowhere else. Taking a row's own share everywhere would also
    // shorten the four rows that hand an ayah across a page turn, where
    // the table has left medallion room for a medallion that is not drawn
    // there; those are full lines and must stay full.
    const closes = line.length > 0 && rows[index + 1]?.length === 0;
    const share = closes
      ? Math.min(
          1,
          line.reduce((n, s) => n + s.share, 0) +
            marker * ayahs.filter(a => a.ends).length,
        )
      : 1;
    return { ayahs, empty: line.length === 0, share };
  });
}

/**
 * `words` cut into `shares.length` runs, each as close to its share of the
 * total advancing length as whole words allow.
 *
 * ── EVERY CUT IS JUDGED THE SAME WAY ──────────────────────────────────
 *
 * This used to fill: it walked the words taking one more whenever the
 * overshoot was small against the room left, on the reasoning that a
 * typesetter fills a line and moves on. The reasoning is sound and the
 * arithmetic was not — filling every cut but the last one leaves the last
 * one whatever remains, so an ayah's closing line came out one or two
 * words shorter than its share, page after page. Page 5 had two lines at
 * 32 advancing characters beside a page-4 line of 53, and those two lines
 * are the holes: no amount of justification reaches the margin from
 * there.
 *
 * So a cut goes to the word boundary NEAREST its share of the ayah, and
 * every cut including the last is measured against the running total of
 * the whole ayah rather than against what is left of it. Nothing
 * accumulates, and a piece that came out a word heavy is not paid for by
 * the piece after it.
 *
 * A line that is then short of the measure is short because the face we
 * set in is not the face the page was set in, which is not something a
 * cut can fix. `MushafUnicodePage` opens the word gaps to close it, which
 * is what the print does and what the Hafs pages have always done.
 */
export function splitByShare(
  words: string[],
  shares: number[],
): string[][] {
  if (shares.length <= 1) return [words];
  const widths = words.map(advancingLength);
  const total = widths.reduce((n, w) => n + w, 0);
  const weight = shares.reduce((n, s) => n + s, 0) || 1;

  // Where each cut wants to fall, as a running count of advancing
  // characters from the START of the ayah — not from the last cut.
  const wanted: number[] = [];
  let running = 0;
  for (let i = 0; i < shares.length - 1; i++) {
    running += (shares[i] / weight) * total;
    wanted.push(running);
  }

  // The running count at every word boundary, so a cut can be judged
  // against the whole ayah in one comparison.
  const upTo: number[] = [0];
  for (let i = 0; i < widths.length; i++) upTo.push(upTo[i] + widths[i]);

  const out: string[][] = [];
  let at = 0;
  for (let i = 0; i < wanted.length; i++) {
    // One word for this line, and one left for every line still to come:
    // an empty stretch on a line the print says is occupied is a hole
    // nothing fills.
    const first = Math.min(at + 1, words.length);
    const last = Math.max(first, words.length - (wanted.length - i));
    let cut = first;
    let best = Infinity;
    // Every boundary in the window, with no early exit. Stopping at the
    // first one that did not improve is only safe while `upTo` strictly
    // grows, and it does not: a word can be a single rub-el-hizb rosette
    // with no letters in it, and two boundaries either side of one are the
    // same number. That tie ended the search on the wrong boundary — see
    // `NON_ADVANCING`. The window is a few dozen boundaries at most.
    for (let k = first; k <= last; k++) {
      const off = Math.abs(upTo[k] - wanted[i]);
      if (off < best) {
        best = off;
        cut = k;
      }
    }
    out.push(words.slice(at, cut));
    at = cut;
  }
  out.push(words.slice(at));
  return out;
}
