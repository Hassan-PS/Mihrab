/**
 * What is marked on a muṣḥaf page, and in what colour.
 *
 * ── WHY THIS IS SHARED ────────────────────────────────────────────────
 *
 * The image renderer has drawn bookmarks and the khatmah position since
 * v2.7.28 — `MushafPageOverlay` puts a translucent box over each of the
 * ayah's line rectangles, using the page geometry table. The two TEXT
 * renderers have no geometry table and no overlay: they draw a page as
 * text, so a mark there is a background on the ayah's own runs.
 *
 * That difference in mechanism was why the text muṣḥaf showed none of it.
 * It is not a reason for the two to disagree about WHAT is marked or what
 * colour it takes, so that part lives here, in one place, and each
 * renderer applies it in whatever way it draws.
 *
 * ── THE ONE RULE ABOUT ALPHA ──────────────────────────────────────────
 *
 * A mark must never compete with the ink. These are the opacities the
 * image overlay already uses, and they are low on purpose: the page reads
 * exactly as it did, and the colour is a wash under the words rather than
 * a band over them. Night mode gets more because a translucent colour on
 * a near-black ground is much weaker than the same colour on cream.
 */
import { BOOKMARK_COLORS, KHATMAH_COLOR, type QuranBookmark } from './quranState';

export type AyahRefLike = { surah: number; ayah: number };

/** The background an ayah is drawn on, or null for the page's own ground. */
export type AyahTint = (surah: number, ayah: number) => string | null;

export const NO_AYAH_TINT: AyahTint = () => null;

/**
 * Opacity per kind, light and night. Ordered by how loudly each should
 * speak: a bookmark is a note the reader left, the khatmah marks are the
 * plan speaking, and the selection and the reciter are happening NOW.
 */
const ALPHA = {
  bookmark: [0.16, 0.28],
  khatmah: [0.18, 0.3],
  /** The ayah today's portion ends on — the loudest of the standing marks. */
  target: [0.22, 0.34],
  selected: [0.18, 0.3],
  playing: [0.22, 0.35],
} as const;

/** `#rrggbb` at an opacity, as the colour string both renderers take. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map(c => c + c)
          .join('')
      : hex;
  if (full.length !== 6) return color;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return color;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

export type AyahMarkSources = {
  /** The ayah the action sheet is open on. */
  selected?: AyahRefLike | null;
  /** The ayah being recited. */
  playing?: AyahRefLike | null;
  /** Every bookmark the reader has; only the ones on the page can match. */
  bookmarks?: readonly QuranBookmark[];
  /** The khatmah's pinned "I am here", when the plan has one. */
  khatmahPosition?: AyahRefLike | null;
  /** The ayah the portion in hand ends on — where today's reading stops. */
  khatmahTarget?: AyahRefLike | null;
  accentColor: string;
  nightMode: boolean;
};

const key = (surah: number, ayah: number) => `${surah}:${ayah}`;

/**
 * A lookup from ayah to background colour.
 *
 * Built once per page render and closed over, rather than handed down as
 * a list, because the renderers ask it a question per WORD — a page is
 * ~260 drawn pieces — and a map lookup is the only shape that stays free
 * at that rate.
 *
 * Applied weakest first, so the strongest claim on an ayah is the one
 * left standing: a bookmark under the khatmah's marks, and both under
 * whatever is happening right now.
 */
export function ayahTint({
  selected,
  playing,
  bookmarks,
  khatmahPosition,
  khatmahTarget,
  accentColor,
  nightMode,
}: AyahMarkSources): AyahTint {
  const night = nightMode ? 1 : 0;
  const marks = new Map<string, string>();
  const put = (
    ref: AyahRefLike | null | undefined,
    color: string,
    alpha: readonly [number, number],
  ) => {
    if (!ref) return;
    marks.set(key(ref.surah, ref.ayah), withAlpha(color, alpha[night]));
  };

  for (const b of bookmarks ?? []) {
    put(b, BOOKMARK_COLORS[b.color] ?? accentColor, ALPHA.bookmark);
  }
  put(khatmahTarget, KHATMAH_COLOR, ALPHA.target);
  put(khatmahPosition, KHATMAH_COLOR, ALPHA.khatmah);
  put(playing, accentColor, ALPHA.playing);
  put(selected, accentColor, ALPHA.selected);

  if (marks.size === 0) return NO_AYAH_TINT;
  return (surah, ayah) => marks.get(key(surah, ayah)) ?? null;
}
