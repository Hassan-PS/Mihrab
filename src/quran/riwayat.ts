/**
 * Which reading tradition the muṣḥaf is drawn in.
 *
 * ── A TABLE, NOT AN `if (warsh)` ──────────────────────────────────────
 *
 * Sweden was the only regional prayer-times source until Morocco arrived,
 * and the `if (isCoordinateInSweden(...))` that had been honest for a year
 * became a liability in an afternoon — every call site hardcoded the same
 * country and would have needed editing in step for the next one
 * (`settings/regionalProviders.ts`). The same shape is waiting here: QUL
 * publishes QPC fonts for Warsh, Qālūn, al-Dūrī, al-Sūsī and Shuʿbah, and
 * the only reason four of them are not in this table today is that nobody
 * has published their TEXT. When one appears it should be a row here and a
 * data file, not a search for every place that assumed two riwayat.
 *
 * ── WHY `available` IS COMPUTED, NOT DECLARED ─────────────────────────
 *
 * A riwayah's data is a separate artefact with its own provenance, and
 * Warsh's licence is unresolved (`docs/design/riwayat-plan.md`). So the
 * table describes what the app COULD draw and `available` says what this
 * build actually has, by trying to load it. A build without the data
 * offers Hafs and nothing else, with no dead entry in the picker and no
 * flag to remember to turn off.
 */
import { FONTS } from '../theme/typography';
import type { RiwayahPageTable } from './riwayahData';
import { loadRiwayahPages } from './riwayahData';

export type RiwayahId = 'hafs' | 'warsh';

/** The one every install has, and the one every default points at. */
export const DEFAULT_RIWAYAH: RiwayahId = 'hafs';

export type RiwayahDefinition = {
  id: RiwayahId;
  /** i18n key for the display name. */
  nameKey: string;
  /** Arabic name — what the toggle actually shows. */
  arabic: string;
  /**
   * How a page is drawn.
   *
   * `glyph` is the Hafs pipeline: one downloaded font per page, private-use
   * codepoints, hand-justified from advance tables — exact printed lines
   * at the cost of ~188 MB.
   *
   * `unicode` is ordinary text in one bundled font. Exact text and exact
   * page boundaries; the LINES fall where the platform puts them, because
   * no open Warsh dataset carries line assignments. See the plan.
   */
  render: 'glyph' | 'unicode';
  /**
   * Pages in this muṣḥaf.
   *
   * Not a constant, and deliberately not defaulted to 604: that number is
   * a fact about the Madinah Hafs print and inheriting it untested is how
   * a second riwayah would silently mis-paginate. The importer asserts it
   * against the data.
   */
  totalPages: number;
  /** Font family for `unicode` riwayat; the glyph pipeline picks its own. */
  fontFamily?: string;
  /**
   * Is that font actually IN this build?
   *
   * Separate from `fontFamily` because the two arrive together and neither
   * is here yet. The QPC Warsh face is a QUL resource under the same
   * unresolved licence as the text (`docs/design/riwayat-plan.md` §1), so
   * it lands in `assets/fonts/` and the iOS Info.plist in the same data
   * drop that produces `data/warsh/`, and this flag is what that drop
   * flips.
   *
   * Naming a family the build does not carry is not harmless: Android
   * silently substitutes whatever it likes and iOS logs "Unrecognized font
   * family" on every page. Falling back to the bundled AmiriQuran instead
   * is a deliberate choice — it is a Qur'anic face that shapes the marks
   * correctly, so the text is right even before its own face arrives.
   */
  fontBundled?: boolean;
};

/**
 * Every riwayah the app knows how to draw.
 *
 * Order is display order. Hafs first because it is the default and the one
 * most of the world reads.
 */
export const RIWAYAT: readonly RiwayahDefinition[] = [
  {
    id: 'hafs',
    nameKey: 'quran.riwayahHafs',
    arabic: 'حفص',
    render: 'glyph',
    totalPages: 604,
  },
  {
    id: 'warsh',
    nameKey: 'quran.riwayahWarsh',
    arabic: 'ورش',
    render: 'unicode',
    // Asserted against the dataset at import time rather than trusted —
    // the KFGQPC Warsh print is 604 pages, but that is a claim the data
    // has to back up before the reader believes it.
    totalPages: 604,
    fontFamily: 'UthmanicWarsh',
    fontBundled: false,
  },
];

export function riwayahById(id: RiwayahId): RiwayahDefinition {
  return RIWAYAT.find(r => r.id === id) ?? RIWAYAT[0];
}

/** The face to draw a `unicode` riwayah in — see `fontBundled`. */
export function riwayahFontFamily(def: RiwayahDefinition): string {
  return def.fontBundled && def.fontFamily ? def.fontFamily : FONTS.arabicQuran;
}

/** Does this build actually carry this riwayah's pages? */
export function riwayahAvailable(id: RiwayahId): boolean {
  if (id === DEFAULT_RIWAYAH) return true;
  return loadRiwayahPages(id) !== null;
}

/** The riwayat this build can actually offer, in display order. */
export function availableRiwayat(): RiwayahDefinition[] {
  return RIWAYAT.filter(r => riwayahAvailable(r.id));
}

/**
 * Is there a choice to offer at all?
 *
 * The toggle hides itself rather than showing a control with one option,
 * which is what every build looks like until the Warsh data lands.
 */
export function riwayahChoiceExists(): boolean {
  return availableRiwayat().length > 1;
}

/** Falls back to Hafs for a stored id this build cannot draw. */
export function resolveRiwayah(id: string | null | undefined): RiwayahId {
  if (id === 'warsh' && riwayahAvailable('warsh')) return 'warsh';
  return DEFAULT_RIWAYAH;
}

export type { RiwayahPageTable };
