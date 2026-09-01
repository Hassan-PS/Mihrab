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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WARSH = require('./data/warshLines.json') as {
  lines: Record<string, number[][][]>;
};

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
  return out;
}

/** The printed rows of a page, or null when this riwayah has no table. */
export function printedLinesFor(
  riwayah: RiwayahId,
  page: number,
): PrintedPage | null {
  if (riwayah !== 'warsh') return null;
  const key = `${riwayah}:${page}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  const rows = WARSH.lines[String(page)];
  const value = rows ? unpack(rows) : null;
  CACHE.set(key, value);
  return value;
}

/** Characters that advance the pen — marks stack and take no width. */
const NON_ADVANCING =
  /[ؐ-ًؚ-ْٕ-ٰٟۖ-ۭ࣓-ࣿ‌-‏]/g;

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
};

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

    const pieces = splitByShare(words, shares);
    pieces.forEach((piece, i) => {
      perLine[on[i]].push({
        surah,
        ayah,
        text: piece.join(' '),
        ends: i === pieces.length - 1,
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
    return { ayahs, empty: line.length === 0 };
  });
}

/**
 * `words` cut into `shares.length` runs, each as close to its share of the
 * total advancing length as whole words allow.
 */
export function splitByShare(
  words: string[],
  shares: number[],
): string[][] {
  if (shares.length <= 1) return [words];
  const widths = words.map(advancingLength);
  const total = widths.reduce((n, w) => n + w, 0);
  const weight = shares.reduce((n, s) => n + s, 0) || 1;

  const out: string[][] = [];
  let at = 0;
  let carried = 0;
  for (let i = 0; i < shares.length; i++) {
    const remaining = shares.length - i;
    if (remaining === 1) {
      out.push(words.slice(at));
      break;
    }
    carried += (shares[i] / weight) * total;
    // Leave at least one word for every line still to come, or a long
    // first share eats the ayah and the print's last line comes out bare.
    const most = words.length - at - (remaining - 1);
    let take = 0;
    let width = 0;
    while (take < most) {
      const next = width + widths[at + take];
      // Stop at the word that would overshoot the target by more than it
      // undershoots — the nearest boundary, not the first one past it.
      if (take > 0 && next > carried && next - carried > carried - width) break;
      width = next;
      take += 1;
      if (width >= carried) break;
    }
    out.push(words.slice(at, at + Math.max(1, take)));
    at += Math.max(1, take);
    carried -= width;
  }
  return out;
}
