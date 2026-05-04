/**
 * Tasbih digital counter — task #19, reworked under #80.
 *
 * Pure data model and presets. Counter state lives in component state during
 * a session (per-preset map so navigating back-and-forth keeps each count).
 *
 * Order follows the user's spec:
 *   1) Sub-haa-na ll-Laah  (×33)
 *   2) Al-ham-du li-l-Laah (×33)
 *   3) Laa i-laa-ha il-la l-Laah (×33)
 *   4) Al-laa-hu Ak-bar    (×33)
 *   5) As-tagh-fi-ru l-Laah (×100, unbounded after)
 *   6) Al-laa-hum-ma sal-li 'a-laa Say-yi-di-naa Mu-ham-mad (×100, unbounded after)
 *
 * `unboundedAfterTarget` means: after reaching the target, the user may keep
 * counting and the visible "/N" cap is hidden so the count just increases.
 *
 * Design principles applied (CLAUDE.md):
 *   • One focal point per screen — the count is the screen.
 *   • Tabular precision — the counter uses tabular numerals so digits don't
 *     shimmer on tick.
 *   • Reverent, not heavy — pronunciation guidance underneath the Arabic
 *     helps non-Arabic speakers without crowding the reverent display.
 */

export type TasbihPreset = {
  /** Stable id for selection state. */
  id: string;
  /** i18n key for the dhikr name (transliteration / Latin label). */
  labelKey: string;
  /** Arabic spelling (display always RTL within the surrounding LTR layout). */
  arabic: string;
  /** Hyphenated Latin pronunciation guide displayed under the Arabic. */
  pronunciation: string;
  /** Conventional target count for one round. */
  defaultTarget: number;
  /**
   * When true, after reaching `defaultTarget` the counter keeps incrementing
   * and the "/N" cap is hidden. Suitable for open-ended dhikr like
   * istighfaar and salaah on the Prophet ﷺ.
   */
  unboundedAfterTarget?: boolean;
};

/**
 * The four "post-prayer" tasbih (33 each) followed by two open-ended dhikr
 * (Astaghfirullah and Salah on the Prophet ﷺ) at 100 each. Order matches
 * the prophetic dua ordering.
 */
export const TASBIH_PRESETS: ReadonlyArray<TasbihPreset> = [
  {
    id: 'subhanallah',
    labelKey: 'tasbih.subhanallah',
    arabic: 'سُبْحَانَ ٱللَّٰهِ',
    pronunciation: 'Sub-haa-na ll-Laah',
    defaultTarget: 33,
  },
  {
    id: 'alhamdulillah',
    labelKey: 'tasbih.alhamdulillah',
    arabic: 'ٱلْحَمْدُ لِلَّٰهِ',
    pronunciation: 'Al-ham-du li-l-Laah',
    defaultTarget: 33,
  },
  {
    id: 'lailaha',
    labelKey: 'tasbih.lailaha',
    arabic: 'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ',
    pronunciation: 'Laa i-laa-ha il-la l-Laah',
    defaultTarget: 33,
  },
  {
    id: 'allahuakbar',
    labelKey: 'tasbih.allahuakbar',
    arabic: 'ٱللَّٰهُ أَكْبَرُ',
    pronunciation: 'Al-laa-hu Ak-bar',
    defaultTarget: 33,
  },
  {
    id: 'astaghfirullah',
    labelKey: 'tasbih.astaghfirullah',
    arabic: 'أَسْتَغْفِرُ ٱللَّٰهَ',
    pronunciation: 'As-tagh-fi-ru l-Laah',
    defaultTarget: 100,
    unboundedAfterTarget: true,
  },
  {
    id: 'salahonprophet',
    labelKey: 'tasbih.salahonprophet',
    arabic: 'ٱللَّٰهُمَّ صَلِّ عَلَىٰ سَيِّدِنَا مُحَمَّدٍ',
    pronunciation: "Al-laa-hum-ma sal-li 'a-laa Say-yi-di-naa Mu-ham-mad",
    defaultTarget: 100,
    unboundedAfterTarget: true,
  },
] as const;

export type TasbihPresetId = (typeof TASBIH_PRESETS)[number]['id'];

/** Find a preset by id, or fall back to the first one. */
export function findPreset(id: string): TasbihPreset {
  return TASBIH_PRESETS.find(p => p.id === id) ?? TASBIH_PRESETS[0];
}

/**
 * Returns the next count after an increment, plus whether this increment
 * crossed the target boundary (caller fires haptic + optional auto-reset).
 *
 * `target = 0` means "open counting" — never crosses a boundary.
 */
export function increment(
  count: number,
  target: number,
): { count: number; reachedTarget: boolean } {
  const next = count + 1;
  const reachedTarget = target > 0 && next === target;
  return { count: next, reachedTarget };
}

/** Sane bounds for the user-configurable target picker. */
export const TARGET_OPTIONS = [0, 33, 34, 100, 99, 33 * 3] as const;

/**
 * Step to the previous/next preset id. Wraps around at the ends so the
 * cycle is continuous and predictable.
 */
export function adjacentPresetId(
  current: TasbihPresetId,
  direction: 'prev' | 'next',
): TasbihPresetId {
  const idx = TASBIH_PRESETS.findIndex(p => p.id === current);
  const i = idx < 0 ? 0 : idx;
  const len = TASBIH_PRESETS.length;
  const nextIdx =
    direction === 'next' ? (i + 1) % len : (i - 1 + len) % len;
  return TASBIH_PRESETS[nextIdx].id;
}
