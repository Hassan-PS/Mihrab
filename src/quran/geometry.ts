/**
 * Mushaf ayah/word geometry — QR-7 (docs/quran-reader-plan.md).
 *
 * Word-level bounding boxes for every glyph on the 604 KFGQPC pages,
 * derived from the quran.com ayahinfo database (1920-px basis) and
 * bundled as `data/ayahGeometry.json` (~2.6 MB). Validated pixel-perfect
 * against the `mushaf-assets-v2` page PNGs (2600×4206): the render scale
 * is uniform (2600/1920 = 4206/3106), so a single factor maps reference
 * coordinates onto any rendered page size.
 *
 * Source: quran.com / quran_android ayahinfo data (files.quran.app),
 * GPL-compatible open data used by Quran for Android. Attribution lives
 * in the About screen next to the Tanzil row.
 *
 * The JSON is parsed lazily on first use (kept out of app-startup path)
 * and cached module-level. All lookups after that are synchronous.
 */

export type WordGlyph = {
  surah: number;
  ayah: number;
  /** 1..15 line on the page. */
  line: number;
  /** Word position within the ayah (the ayah-end marker is the last). */
  position: number;
  /** Bounds in reference (1920-wide) pixel space. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

export type AyahLineRect = {
  surah: number;
  ayah: number;
  line: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

type GeometryData = {
  refWidth: number;
  refHeight: number;
  pages: { [page: string]: Array<[number, number, number, number, number, number, number, number]> };
};

export const GEOMETRY_REF_WIDTH = 1920;
export const GEOMETRY_REF_HEIGHT = 3106;

let cached: GeometryData | null = null;
let loading: Promise<GeometryData> | null = null;

/**
 * Parse the bundled geometry JSON off the critical path. Metro's
 * `require` is synchronous; wrapping it in a resolved-promise chain
 * defers the ~50–100 ms parse until after the current frame commits.
 */
export function loadGeometry(): Promise<GeometryData> {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;
  loading = new Promise<GeometryData>(resolve => {
    // setTimeout(0) yields to the UI thread before the heavy parse.
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('./data/ayahGeometry.json') as GeometryData;
      resolve(cached);
    }, 0);
  });
  return loading;
}

/** Synchronous access — returns null until `loadGeometry()` resolves once. */
export function getGeometrySync(): GeometryData | null {
  return cached;
}

/** All word glyphs on a page, in reading order. Empty until loaded. */
export function pageWordGlyphs(page: number): WordGlyph[] {
  const data = cached;
  if (!data) return [];
  const rows = data.pages[String(page)];
  if (!rows) return [];
  return rows.map(r => ({
    surah: r[0],
    ayah: r[1],
    line: r[2],
    position: r[3],
    x0: r[4],
    x1: r[5],
    y0: r[6],
    y1: r[7],
  }));
}

/**
 * Per-ayah line rectangles for a page: each ayah contributes one merged
 * rect per line it spans. This is the shape highlight overlays render.
 */
export function pageAyahLineRects(page: number): AyahLineRect[] {
  const glyphs = pageWordGlyphs(page);
  const byKey = new Map<string, AyahLineRect>();
  for (const g of glyphs) {
    const key = `${g.surah}:${g.ayah}:${g.line}`;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, {
        surah: g.surah,
        ayah: g.ayah,
        line: g.line,
        x0: g.x0,
        x1: g.x1,
        y0: g.y0,
        y1: g.y1,
      });
    } else {
      cur.x0 = Math.min(cur.x0, g.x0);
      cur.x1 = Math.max(cur.x1, g.x1);
      cur.y0 = Math.min(cur.y0, g.y0);
      cur.y1 = Math.max(cur.y1, g.y1);
    }
  }
  return [...byKey.values()];
}

/**
 * Hit-test a tap at rendered-image coordinates `(x, y)` against a page.
 * `renderedWidth` is the on-screen image width; the scale is uniform.
 * Uses line-band matching first (generous vertical target), then the
 * horizontally nearest ayah on that line — so taps in the whitespace
 * between words still resolve, matching how a finger reads a line.
 */
export function hitTestAyah(
  page: number,
  x: number,
  y: number,
  renderedWidth: number,
): { surah: number; ayah: number } | null {
  const glyphs = pageWordGlyphs(page);
  if (glyphs.length === 0) return null;
  const scale = renderedWidth / GEOMETRY_REF_WIDTH;
  const rx = x / scale;
  const ry = y / scale;

  // Group into lines and find the line whose vertical band contains ry.
  const lines = new Map<number, WordGlyph[]>();
  for (const g of glyphs) {
    const arr = lines.get(g.line);
    if (arr) arr.push(g);
    else lines.set(g.line, [g]);
  }
  let best: { d: number; glyphs: WordGlyph[] } | null = null;
  for (const arr of lines.values()) {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const g of arr) {
      y0 = Math.min(y0, g.y0);
      y1 = Math.max(y1, g.y1);
    }
    if (ry >= y0 && ry <= y1) {
      best = { d: 0, glyphs: arr };
      break;
    }
    const d = ry < y0 ? y0 - ry : ry - y1;
    if (!best || d < best.d) best = { d, glyphs: arr };
  }
  // Reject taps far away from any text line (page margins).
  if (!best || best.d > 60) return null;

  // Nearest glyph horizontally on that line.
  let hit: WordGlyph | null = null;
  let hitDist = Infinity;
  for (const g of best.glyphs) {
    const d = rx < g.x0 ? g.x0 - rx : rx > g.x1 ? rx - g.x1 : 0;
    if (d < hitDist) {
      hitDist = d;
      hit = g;
    }
  }
  if (!hit || hitDist > 120) return null;
  return { surah: hit.surah, ayah: hit.ayah };
}

/** First (surah, ayah) that begins on/continues onto a page — for last-read. */
export function firstAyahOnPage(page: number): { surah: number; ayah: number } {
  const glyphs = pageWordGlyphs(page);
  if (glyphs.length === 0) return { surah: 1, ayah: 1 };
  let first = glyphs[0];
  for (const g of glyphs) {
    if (g.surah < first.surah || (g.surah === first.surah && g.ayah < first.ayah)) {
      first = g;
    }
  }
  return { surah: first.surah, ayah: first.ayah };
}
