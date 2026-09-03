/**
 * The page rail's model — every way a finger on the rail becomes a page.
 *
 * ── WHY THIS IS NOT INSIDE THE COMPONENT ──────────────────────────────
 *
 * The rail used to hand every touch sample straight to the reader: a
 * `jumpToPage` per move event, each one a scroll of the pager, a page laid
 * out in a fresh font, a last-read write, a khatmah record and a header
 * title — sixty times a second, across six hundred pages, on the thread
 * that was also trying to draw the knob. It was reported, precisely, as
 * very glitchy. The two things that fix it live here, where they can be
 * run without a finger:
 *
 *  1. THE DRAG IS A NUMBER, NOT A NAVIGATION. Moving the finger moves a
 *     floating page position and nothing else. The reader is asked to
 *     show a page only when the finger has been STILL for a moment (a
 *     peek), and the place is committed once, on release.
 *  2. PRECISION COMES FROM THE OTHER AXIS. Six hundred pages across a
 *     phone is two or three pages per point — no finger can pick one.
 *     Sliding the finger away from the rail slows the scrub down: full
 *     speed on the rail, then half, a quarter, and a tenth, so the last
 *     page is chosen by nudging rather than by luck. This is the iOS
 *     media scrubber's rule, which is the one people already know.
 *
 * The rail runs right-to-left like the muṣḥaf: page 1 is at the right end.
 */
import { pagesForRiwayah, totalPagesForRiwayah } from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';

/**
 * Scrub speed by distance from the rail, in dp. The first band is the
 * rail itself plus the wobble of a thumb; each further band is a clear
 * reach, so a tier is entered on purpose and never by accident.
 */
export const SCRUB_TIERS: ReadonlyArray<{ from: number; rate: number }> = [
  { from: 0, rate: 1 },
  { from: 48, rate: 0.5 },
  { from: 104, rate: 0.25 },
  { from: 168, rate: 0.1 },
];

/**
 * How far past a band's edge the finger has to go before the tier
 * changes, so a thumb resting ON the edge does not flicker between two
 * speeds — and two haptic ticks — with every tremor.
 */
export const TIER_HYSTERESIS = 8;

/**
 * A touch this close to the knob picks the knob up where it is instead of
 * jumping the page to the finger. The knob is 14 dp; a thumb is wider.
 */
export const GRAB_RADIUS = 22;

/** How long the finger has to be still before the page under it is shown. */
export const PEEK_STILL_MS = 180;

/** The position along the rail of a page, 0 at the LEFT edge, 1 at the right. */
export function fractionForPage(page: number, total: number): number {
  if (total <= 1) return 0;
  const p = Math.max(1, Math.min(total, page));
  return (total - p) / (total - 1);
}

/** The page at a position along the rail — the inverse of the above. */
export function pageForFraction(fraction: number, total: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return Math.max(1, Math.min(total, Math.round((1 - f) * (total - 1)) + 1));
}

/**
 * The tier a finger this far from the rail is in, given the tier it is in
 * now. Moving out needs the band's full edge plus the hysteresis; coming
 * back needs to come back past it by the same margin.
 */
export function scrubTier(distance: number, current: number): number {
  const d = Math.abs(distance);
  let tier = current;
  // Deeper?
  while (
    tier + 1 < SCRUB_TIERS.length &&
    d >= SCRUB_TIERS[tier + 1].from + TIER_HYSTERESIS
  ) {
    tier += 1;
  }
  // Shallower?
  while (tier > 0 && d < SCRUB_TIERS[tier].from - TIER_HYSTERESIS) {
    tier -= 1;
  }
  return tier;
}

export type RailDrag = {
  /**
   * The finger moved. `dx`/`dy` are the TOTAL travel since the grab, as a
   * pan responder reports them; the drag keeps its own last sample so a
   * change of speed applies only to the travel that follows it.
   */
  move: (dx: number, dy: number) => { page: number; tier: number };
  /** The page under the finger right now. */
  page: () => number;
  /** The speed tier the finger is in. */
  tier: () => number;
};

/**
 * A drag on the rail, from the touch that starts it.
 *
 * `grabX` is where on the rail (0 = left edge) the finger landed. Landing
 * on the knob picks it up without moving it; landing elsewhere puts the
 * page under the finger, as a tap on a rail should. From there every move
 * is relative, at the speed of the tier the finger is in — at full speed
 * this is exactly the page under the finger, so nothing feels different
 * until the finger leaves the rail.
 */
export function createRailDrag(input: {
  total: number;
  width: number;
  page: number;
  grabX: number;
}): RailDrag {
  const { total } = input;
  const width = Math.max(1, input.width);
  const knobX = fractionForPage(input.page, total) * width;
  const grabbedKnob = Math.abs(input.grabX - knobX) <= GRAB_RADIUS;
  // A floating position: the page is its rounding, but the fraction is
  // what carries across a change of speed.
  let pos = grabbedKnob
    ? input.page
    : pageForFraction(input.grabX / width, total);
  let lastDx = 0;
  let tier = 0;
  const pagesPerDp = (total - 1) / width;
  const clamp = (p: number) => Math.max(1, Math.min(total, p));
  const page = () => clamp(Math.round(pos));
  return {
    move: (dx, dy) => {
      tier = scrubTier(dy, tier);
      const step = dx - lastDx;
      lastDx = dx;
      // Right-to-left: moving right goes BACK towards page 1.
      pos = clamp(pos - step * pagesPerDp * SCRUB_TIERS[tier].rate);
      return { page: page(), tier };
    },
    page,
    tier: () => tier,
  };
}

/**
 * page → surah number, built once PER MUṢḤAF.
 *
 * A table, not a constant: two riwayat break their pages differently, so
 * "which surah is page 300" has no answer until you say which print. Built
 * on first use and kept — the rail asks this on every frame of a drag.
 */
const SURAH_AT_PAGE = new Map<RiwayahId, ReadonlyArray<number>>();

function surahAtPageTable(riwayah: RiwayahId): ReadonlyArray<number> {
  const cached = SURAH_AT_PAGE.get(riwayah);
  if (cached) return cached;
  const total = totalPagesForRiwayah(riwayah);
  const table = new Array<number>(total + 1).fill(1);
  for (const p of pagesForRiwayah(riwayah)) {
    if (p.page >= 1 && p.page <= total) table[p.page] = p.start.surah;
  }
  SURAH_AT_PAGE.set(riwayah, table);
  return table;
}

/** The surah a page opens in. Out-of-range pages clamp to the mushaf. */
export function surahAtPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  const table = surahAtPageTable(riwayah);
  const clamped = Math.max(1, Math.min(table.length - 1, Math.round(page)));
  return table[clamped] ?? 1;
}

/**
 * Where each juz after the first begins, as a fraction along the rail —
 * the rail's tick marks. Thirty landmarks is a scale a reader can use;
 * a hundred and fourteen surahs would be a texture.
 */
const JUZ_TICKS = new Map<RiwayahId, ReadonlyArray<number>>();

export function juzTickFractions(
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): ReadonlyArray<number> {
  const cached = JUZ_TICKS.get(riwayah);
  if (cached) return cached;
  const total = totalPagesForRiwayah(riwayah);
  const firstPage = new Map<number, number>();
  for (const p of pagesForRiwayah(riwayah)) {
    const seen = firstPage.get(p.juz);
    if (seen == null || p.page < seen) firstPage.set(p.juz, p.page);
  }
  const ticks = [...firstPage.entries()]
    .filter(([juz]) => juz > 1)
    .sort((a, b) => a[0] - b[0])
    .map(([, page]) => fractionForPage(page, total));
  JUZ_TICKS.set(riwayah, ticks);
  return ticks;
}

/**
 * Pages per second above which a drag counts as ranging rather than
 * hunting. A deliberate search moves maybe a fifth of the rail per second
 * (~120 pages); anything past 260 is a sweep.
 */
const RANGING_PAGES_PER_SECOND = 260;

/**
 * Is this drag ranging (sweeping for a region) rather than hunting (looking
 * for one surah)? Pure so the threshold can be argued about in a test
 * instead of by feel on a device.
 */
export function isRangingDrag(pagesMoved: number, elapsedMs: number): boolean {
  if (elapsedMs <= 0) return true;
  return (Math.abs(pagesMoved) / elapsedMs) * 1000 > RANGING_PAGES_PER_SECOND;
}
