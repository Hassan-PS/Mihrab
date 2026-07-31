/**
 * The layout data behind the font-rendered mushaf (v2.8.0).
 *
 * These assertions are about the DATA, not the rendering: if a page loses a
 * line, a surah plate lands on the wrong page, or a line's words stop matching
 * its ayah segments, the reader would draw a subtly wrong Quran page — the
 * worst class of bug this app can ship. The generator
 * (`scripts/mushaf/build_qcf_assets.py`) checks the same invariants; this is
 * the gate that keeps a bad regeneration from reaching a build.
 */
import {
  MUSHAF_LINES_PER_PAGE,
  MUSHAF_LINE_BOX_SLACK_EM,
  MUSHAF_SPACE_ADVANCE_EM,
  WORD_SPACE_EM,
  WORD_SPACE_MAX_EM,
  WORD_SPACE_MIN_EM,
  ayahsOnPage,
  getPageLayout,
  isFramedPage,
  lineGapCount,
  lineSpaceEm,
  lineTokenStream,
  lineWidthEm,
  pageBlockEm,
  pageMeasureEm,
  surahHeadersOnPage,
} from '../src/quran/mushafLayout';
import fs from 'fs';
import path from 'path';

const TOTAL_PAGES = 604;

/**
 * The bundled gap font, as both platforms ship it. Android resolves a custom
 * family by asset filename and iOS by the font's internal name, but it is the
 * same binary in both bundles — which is what makes a page render identically
 * on the two platforms.
 */
const GAP_FONT_COPIES = [
  'android/app/src/main/assets/fonts/AmiriQuran.ttf',
  'ios/PrayerApp/Resources/fonts/AmiriQuran.ttf',
];

/** Advance of one character in a TrueType file, in ems. Enough of the format
 *  to read a single metric: table directory → cmap format 4 → hmtx. */
/* eslint-disable no-bitwise -- TrueType glyph ids are 16-bit by definition */
function advanceEm(ttf: Buffer, codepoint: number): number | null {
  const tables = new Map<string, number>();
  const numTables = ttf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables.set(ttf.toString('ascii', rec, rec + 4), ttf.readUInt32BE(rec + 8));
  }
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (head == null || hhea == null || hmtx == null || cmap == null) return null;

  // cmap → the Windows Unicode BMP subtable (format 4).
  let sub = -1;
  const subtables = ttf.readUInt16BE(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = ttf.readUInt16BE(rec);
    const encoding = ttf.readUInt16BE(rec + 2);
    if (platform === 3 && (encoding === 1 || encoding === 0)) {
      sub = cmap + ttf.readUInt32BE(rec + 4);
    }
  }
  if (sub < 0 || ttf.readUInt16BE(sub) !== 4) return null;

  const segCount = ttf.readUInt16BE(sub + 6) / 2;
  const endCodes = sub + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  let glyph = 0;
  for (let seg = 0; seg < segCount; seg++) {
    if (ttf.readUInt16BE(endCodes + seg * 2) < codepoint) continue;
    if (ttf.readUInt16BE(startCodes + seg * 2) > codepoint) break;
    const rangeOffset = ttf.readUInt16BE(idRangeOffsets + seg * 2);
    const delta = ttf.readInt16BE(idDeltas + seg * 2);
    if (rangeOffset === 0) {
      glyph = (codepoint + delta) & 0xffff;
    } else {
      const at =
        idRangeOffsets +
        seg * 2 +
        rangeOffset +
        (codepoint - ttf.readUInt16BE(startCodes + seg * 2)) * 2;
      const raw = ttf.readUInt16BE(at);
      glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
    }
    break;
  }
  if (glyph === 0) return null;

  const unitsPerEm = ttf.readUInt16BE(head + 18);
  const longMetrics = ttf.readUInt16BE(hhea + 34);
  const index = Math.min(glyph, longMetrics - 1);
  return ttf.readUInt16BE(hmtx + index * 4) / unitsPerEm;
}
/* eslint-enable no-bitwise */

describe('mushaf layout data', () => {
  it('covers every page of the Madinah mushaf', () => {
    expect(getPageLayout(1)).not.toBeNull();
    expect(getPageLayout(TOTAL_PAGES)).not.toBeNull();
    expect(getPageLayout(0)).toBeNull();
    expect(getPageLayout(TOTAL_PAGES + 1)).toBeNull();
  });

  it('gives every regular page exactly 15 printed lines', () => {
    for (let page = 3; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page);
      expect(layout).not.toBeNull();
      expect(layout!.lines.length).toBe(MUSHAF_LINES_PER_PAGE);
    }
  });

  it('keeps the ornamental opening pages to their own shape', () => {
    for (const page of [1, 2]) {
      expect(isFramedPage(page)).toBe(true);
      const layout = getPageLayout(page)!;
      expect(layout.lines.length).toBeGreaterThan(0);
      expect(layout.lines.length).toBeLessThan(MUSHAF_LINES_PER_PAGE);
      // The plate's lines are stretched across it like any other line — they
      // hold few words (page 1's basmalah is 6.7 em against a 12 em plate),
      // so setting them at their natural width crowds the words together.
      const ayahLines = layout.lines.filter(l => l.kind === 'ayah');
      const centered = ayahLines.filter(l => l.kind === 'ayah' && l.centered);
      // Only a line that ends a surah is centred: page 1 finishes
      // Al-Fatihah, page 2 runs on into Al-Baqarah.
      expect(centered).toHaveLength(page === 1 ? 1 : 0);
      if (centered.length) {
        expect(centered[0]).toBe(ayahLines[ayahLines.length - 1]);
      }
    }
  });

  it('gives every page a measure wider than any of its lines', () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page)!;
      expect(layout.measure).toBeGreaterThan(0);
      for (const line of layout.lines) {
        if (line.kind !== 'ayah') continue;
        // The measure drives fontSize; a line wider than it would overflow.
        expect(line.natural).toBeLessThanOrEqual(layout.measure + 1e-6);
      }
    }
  });

  it('prints all 114 surah plates exactly once', () => {
    const seen = new Map<number, number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const surah of surahHeadersOnPage(page)) {
        seen.set(surah, (seen.get(surah) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(114);
    for (let s = 1; s <= 114; s++) expect(seen.get(s)).toBe(1);
  });

  it('gives every surah a basmalah line except Al-Fatihah and At-Tawbah', () => {
    const basmalah = new Set<number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind === 'basmalah') basmalah.add(line.surah);
      }
    }
    expect(basmalah.has(1)).toBe(false); // its basmalah is ayah 1
    expect(basmalah.has(9)).toBe(false); // At-Tawbah has none
    expect(basmalah.size).toBe(112);
  });

  it('runs the ayahs in order, without gaps, across the whole mushaf', () => {
    let surah = 1;
    let ayah = 0;
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const ref of ayahsOnPage(page)) {
        if (ref.surah === surah && ref.ayah === ayah) continue; // continued
        if (ref.surah === surah && ref.ayah === ayah + 1) {
          ayah = ref.ayah;
          continue;
        }
        // New surah must be the next one, starting at ayah 1.
        expect([ref.surah, ref.ayah]).toEqual([surah + 1, 1]);
        surah = ref.surah;
        ayah = 1;
      }
    }
    expect(surah).toBe(114);
    expect(ayah).toBe(6); // An-Nas ends the mushaf at 114:6
  });

  it('numbers words consecutively within each ayah', () => {
    const lastPosition = new Map<string, number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind !== 'ayah') continue;
        for (const word of line.words) {
          const key = `${word.surah}:${word.ayah}`;
          const previous = lastPosition.get(key);
          if (previous == null) {
            expect(word.position).toBe(1);
          } else {
            expect(word.position).toBe(previous + 1);
          }
          lastPosition.set(key, word.position);
          expect(word.text.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('ends each ayah with exactly one medallion', () => {
    let medallions = 0;
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind !== 'ayah') continue;
        for (const word of line.words) if (word.isEnd) medallions += 1;
      }
    }
    // 6236 ayahs in the Hafs reading, each closed by its number glyph.
    expect(medallions).toBe(6236);
  });

  it('centres the line that closes a surah, and stretches the rest', () => {
    // Page 604 holds three complete surahs, so it shows both behaviours.
    const layout = getPageLayout(604)!;
    const ayahLines = layout.lines.filter(l => l.kind === 'ayah');
    const centered = ayahLines.filter(l => l.kind === 'ayah' && l.centered);
    expect(centered.length).toBe(3); // Al-Ikhlas, Al-Falaq, An-Nas
    expect(centered.length).toBeLessThan(ayahLines.length);
  });
});

/**
 * Spacing — the model the renderer draws with.
 *
 * These are not cosmetic. A line drawn wider than the box it was given loses
 * its LAST WORD: the platform lays a single line out by breaking it, and the
 * word after the last gap that fits is simply not drawn. That is what page 49
 * shipped with — every one of its fifteen lines ended one word early, with no
 * error anywhere. So the check is arithmetic on the same functions the
 * renderer calls, over the whole mushaf: no line may come out wider than the
 * measure, ever.
 */
describe('mushaf line spacing', () => {
  it('never lays a line out wider than the page measure', () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page)!;
      const measureEm = pageMeasureEm(layout);
      for (const [i, line] of layout.lines.entries()) {
        if (line.kind !== 'ayah') continue;
        const width = lineWidthEm(line, measureEm);
        if (width > measureEm + 1e-9) {
          throw new Error(
            `page ${page} line ${i + 1}: ${width.toFixed(4)} em drawn into a ` +
              `${measureEm.toFixed(4)} em measure`,
          );
        }
      }
    }
  });

  it('keeps the word space inside the band, or leaves the line unstretched', () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page)!;
      const measureEm = pageMeasureEm(layout);
      for (const [i, line] of layout.lines.entries()) {
        if (line.kind !== 'ayah') continue;
        const space = lineSpaceEm(line, measureEm);
        // Either the line justified — and then its space is in the band — or
        // it could not reach the measure honestly and sits at the nominal
        // space, to be centred (docs/mushaf-fidelity-rules.md).
        const inBand =
          space >= WORD_SPACE_MIN_EM - 1e-9 && space <= WORD_SPACE_MAX_EM + 1e-9;
        if (!inBand && space !== WORD_SPACE_EM) {
          throw new Error(
            `page ${page} line ${i + 1}: word space ${space.toFixed(4)} em is ` +
              'neither inside the band nor the nominal space',
          );
        }
      }
    }
  });

  it('sets at least one line of every page flush to the measure', () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page)!;
      const measureEm = pageMeasureEm(layout);
      const flush = layout.lines.some(
        line =>
          line.kind === 'ayah' &&
          Math.abs(lineWidthEm(line, measureEm) - measureEm) < 1e-9,
      );
      expect([page, flush]).toEqual([page, true]);
    }
  });

  it('sizes a page from what is drawn, not from the advances alone', () => {
    // `layout.measure` is the widest line's ADVANCES. A line is drawn with a
    // gap between every pair of words, so the drawn measure is always wider —
    // sizing from the advances is what made full lines overflow their box.
    for (const page of [3, 49, 200, 400, 604]) {
      const layout = getPageLayout(page)!;
      expect(pageMeasureEm(layout)).toBeGreaterThan(layout.measure);
    }
  });

  it('draws every word of page 49 — the line-loses-its-tail regression', () => {
    const layout = getPageLayout(49)!;
    const measureEm = pageMeasureEm(layout);
    const ayahLines = layout.lines.filter(l => l.kind === 'ayah');
    expect(ayahLines.length).toBe(15);
    for (const [i, line] of ayahLines.entries()) {
      if (line.kind !== 'ayah') continue;
      expect(lineGapCount(line)).toBeGreaterThan(0);
      const width = lineWidthEm(line, measureEm);
      // Every line but the one closing Al-Baqarah's page is justified flush;
      // none of them is over, which is what used to cost them a word.
      expect(width).toBeLessThanOrEqual(measureEm + 1e-9);
      if (!line.centered) {
        expect(Math.abs(width - measureEm)).toBeLessThan(1e-9);
        const space = lineSpaceEm(line, measureEm);
        expect(space).toBeGreaterThanOrEqual(WORD_SPACE_MIN_EM);
        expect(space).toBeLessThanOrEqual(WORD_SPACE_MAX_EM);
      }
      expect(i).toBeLessThan(15);
    }
  });
});

/**
 * The gap between two words is the one part of a mushaf line the layout data
 * does not describe: the QPC page fonts carry no space glyph at all. Whatever
 * width that gap comes out at is added to every line fifteen times a page, so
 * if it is not the width the renderer budgeted, the line overflows its box and
 * the platform's single-line layout drops the word after the last gap that
 * fits. That is the bug page 49 shipped with, and it was invisible because
 * nothing in the codebase had ever MEASURED the character it was drawing.
 *
 * So measure it. The renderer draws the gap in AmiriQuran, which we ship, and
 * derives the gap's width from this advance; these assertions are the link
 * between the constant and the binary it claims to describe.
 */
describe('the mushaf gap font', () => {
  const load = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', rel));

  it('is the same binary on both platforms', () => {
    const [android, ios] = GAP_FONT_COPIES.map(load);
    expect(android.equals(ios)).toBe(true);
  });

  it('has the space advance the renderer sizes its gaps from', () => {
    const ttf = load(GAP_FONT_COPIES[0]);
    expect(advanceEm(ttf, 0x20)).toBeCloseTo(MUSHAF_SPACE_ADVANCE_EM, 6);
  });

  it('gives the no-break space the same advance as the space', () => {
    // The renderer draws U+00A0, not U+0020: a no-break space offers the
    // platform nowhere to break, so a line can never lose a word to
    // truncation even if every other assumption here turns out wrong. It is
    // only interchangeable with the space if it is the same width.
    const ttf = load(GAP_FONT_COPIES[0]);
    expect(advanceEm(ttf, 0xa0)).toBeCloseTo(MUSHAF_SPACE_ADVANCE_EM, 6);
  });

  it('can draw the widest gap the band allows without a huge correction', () => {
    // The gap is the font's space plus letter spacing. Keeping the correction
    // within an em of the page size is what lets the gap stay at the page's
    // own font size, so a stretched line cannot drag the line box taller.
    const widest = WORD_SPACE_MAX_EM - MUSHAF_SPACE_ADVANCE_EM;
    expect(widest).toBeLessThan(1);
    expect(WORD_SPACE_MIN_EM - MUSHAF_SPACE_ADVANCE_EM).toBeGreaterThan(-1);
  });
});

/**
 * Every line is drawn in a box a little wider than itself, and that box must
 * fit inside the page block — because a line that overflows its box does not
 * clip, it loses a word. Android lays a single line out by breaking it, and
 * when there is nothing breakable left it breaks between glyphs; in QPC a
 * glyph IS a word. Verified on a Pixel: with the slack removed, page 49 lost
 * the last word of every line again; with it, every line is whole.
 */
describe('mushaf line boxes', () => {
  it('fits every line box inside the page block', () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page)!;
      const measureEm = pageMeasureEm(layout);
      const blockEm = pageBlockEm(layout);
      for (const [i, line] of layout.lines.entries()) {
        if (line.kind !== 'ayah') continue;
        const box = lineWidthEm(line, measureEm) + MUSHAF_LINE_BOX_SLACK_EM;
        if (box > blockEm + 1e-9) {
          throw new Error(
            `page ${page} line ${i + 1}: box ${box.toFixed(4)} em overflows a ` +
              `${blockEm.toFixed(4)} em block`,
          );
        }
      }
    }
  });

  it('reserves the slack out of the block, never off the measure', () => {
    const layout = getPageLayout(49)!;
    expect(pageBlockEm(layout)).toBeCloseTo(
      pageMeasureEm(layout) + MUSHAF_LINE_BOX_SLACK_EM,
      10,
    );
    // Real slack, or the invariant is decoration: zero slack is exactly the
    // configuration that lost a word on every line of page 49.
    expect(MUSHAF_LINE_BOX_SLACK_EM).toBeGreaterThan(0.1);
  });
});

/**
 * Token order — a Quran-text corruption, so it blocks a release as hard as a
 * missing word does.
 *
 * The renderer used to wrap a token in a bidi override (U+202D…U+202C) only
 * when it had more than one glyph. Single-glyph tokens stayed bare, so one
 * paragraph held two kinds of run and the bidi algorithm reordered the
 * overridden ones against their neighbours: page 49 rendered `وَإِن ۞ كُنتُمْ`
 * where the print has the rub-el-hizb first, and 2:2 rendered
 * `لَا ۛ فِيهِ ۛ رَيْبَ` for `لَا رَيْبَ ۛ فِيهِ ۛ`.
 *
 * The rule now is uniformity: no overrides at all, every token emitted alike
 * in the order QPC numbered it. These assertions are about that uniformity —
 * a length-conditional wrapper of any kind fails them.
 */
describe('mushaf token order', () => {
  const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

  it('emits every token alike, whatever its glyph count', () => {
    let singleGlyph = 0;
    let multiGlyph = 0;
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind !== 'ayah') continue;
        const pieces = lineTokenStream(line);
        for (const word of line.words) {
          const mine = pieces.filter(
            p => p.kind === 'glyphs' && p.word === word,
          );
          const parts = word.text.split(' ');
          // Same decomposition rule for a one-glyph token and a two-glyph one:
          // its glyph runs, in order, and nothing else.
          expect(mine.map(p => (p.kind === 'glyphs' ? p.text : ''))).toEqual(
            parts,
          );
          if (word.text.length === 1) singleGlyph += 1;
          else multiGlyph += 1;
        }
      }
    }
    // Both kinds really do occur, or the assertion above proves nothing.
    expect(singleGlyph).toBeGreaterThan(1000);
    expect(multiGlyph).toBeGreaterThan(1000);
  });

  it('puts no bidi control character in the drawn text', () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind !== 'ayah') continue;
        for (const piece of lineTokenStream(line)) {
          if (piece.kind !== 'glyphs') continue;
          if (BIDI_CONTROLS.test(piece.text)) {
            throw new Error(`page ${page}: bidi control in a drawn token`);
          }
        }
      }
    }
  });

  it('keeps the glyphs of a line in the order QPC numbered them', () => {
    // Page 49 line 1 opens with the rub-el-hizb token — two glyphs with a
    // space between them — and it is the token that rendered out of order.
    const line = getPageLayout(49)!.lines[0];
    expect(line.kind).toBe('ayah');
    if (line.kind !== 'ayah') return;
    const stream = lineTokenStream(line);
    expect(stream[0]).toMatchObject({ kind: 'glyphs', index: 0 });
    expect(stream[1]).toMatchObject({ kind: 'gap', inner: true });
    expect(stream[2]).toMatchObject({ kind: 'glyphs', index: 0 });
    expect(stream[3]).toMatchObject({ kind: 'gap', inner: false });
    // The whole line, glyph for glyph, in data order.
    const drawn = stream
      .filter(p => p.kind === 'glyphs')
      .map(p => (p.kind === 'glyphs' ? p.text : ''))
      .join('');
    expect(drawn).toBe(line.words.map(w => w.text.split(' ').join('')).join(''));
  });
});
