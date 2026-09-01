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
 * Mihrab does not ship it — nobody publishes a Warsh text under terms the
 * app could redistribute under, so the reader obtains it from whoever
 * does (`riwayahStore.ts`, `docs/design/riwayat-plan.md` §0). The table
 * therefore describes what the app knows how to DRAW; what this device
 * actually HAS is a question for `riwayahData.ts`, and it can change
 * while the app is running.
 *
 * That is why there is no `totalPages` here either. A muṣḥaf's page count
 * is a fact about the print that arrives WITH the data — inheriting the
 * Madinah Hafs 604 and hoping is exactly how a second riwayah would
 * silently mis-paginate — so it is derived from the pagination itself
 * (`totalPagesForRiwayah`) and never declared.
 */
import { FONTS } from '../theme/typography';
import type { RiwayahPageTable } from './riwayahData';
import { loadRiwayahPages } from './riwayahData';

/**
 * Where a riwayah's muṣḥaf can be obtained, and by whom it is published.
 *
 * Shown to the reader, not just recorded: someone about to put scripture
 * on their device is entitled to know whose edition it is and what the
 * publisher says about using it, and "the app got it from somewhere" is
 * not an answer.
 */
export type RiwayahSource = {
  /** Who publishes the dataset. */
  publisher: string;
  /** The page a reader goes to in order to get it. */
  page: string;
  /**
   * A direct link, when the publisher offers a stable one.
   *
   * Present means the app can simply fetch the muṣḥaf and the screen
   * offers a button. Absent means the publisher generates its download
   * URLs per request — QUL does — so there is nothing honest to hardcode,
   * and a URL guessed from a rendered page is one that breaks silently
   * later; the screen then asks for a link or a file instead.
   */
  direct?: string;
  /** Whom the publisher credits upstream. */
  credits: string;
};

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
  /** Where a `unicode` riwayah's data comes from; Hafs is in the build. */
  source?: RiwayahSource;
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
  },
  {
    id: 'warsh',
    nameKey: 'quran.riwayahWarsh',
    arabic: 'ورش',
    render: 'unicode',
    source: {
      publisher: 'Quranpedia',
      page: 'https://quranpedia.net',
      // ── WHY THERE IS A DIRECT LINK NOW ──────────────────────────────
      //
      // There was not one, and the comment on `direct` said why: QUL mints
      // its download URLs in the browser, so there was nothing honest to
      // hardcode and the screen had to ask the reader to paste a link or
      // find a file. That was the whole reason this feature was awkward.
      //
      // Quranpedia serves the muṣḥaf at a fixed path, so the app can
      // simply fetch it — one button, like the page fonts. It is the same
      // KFGQPC Warsh text: measured against QUL's own copy, all 114
      // surahs agree on their ayah counts and all 6,214 ayahs are
      // identical once the diacritics are normalised.
      //
      // And it carries what QUL's ayah export does not: page_number, juz,
      // and `number_in_hafs`, which is what lets `hafsAlignment.ts` read
      // every ayah against the Qur'an rather than sixty of them.
      direct: 'https://api.quranpedia.net/v1/mushafs/4',
      credits: 'King Fahd Glorious Quran Printing Complex',
    },
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

/**
 * Falls back to Hafs for a riwayah this DEVICE cannot draw right now.
 *
 * Called where a riwayah is used, never where one is stored — see
 * `coerceRiwayahId`. The answer changes during a session now: a reader
 * who adds a muṣḥaf in Manage downloads has not changed their preference,
 * they have changed what this function is able to honour.
 */
export function resolveRiwayah(id: string | null | undefined): RiwayahId {
  const known = coerceRiwayahId(id);
  return riwayahAvailable(known) ? known : DEFAULT_RIWAYAH;
}

/**
 * The stored form of a riwayah preference: known ids survive, junk does
 * not, and AVAILABILITY IS NOT CONSULTED.
 *
 * This distinction is the whole reason there are two functions. The data
 * lives on the device and is read asynchronously, so for the first
 * moments of a cold start nothing is available yet. If loading a stored
 * `warsh` resolved to `hafs` at that instant, the next write of any
 * preference would persist `hafs` — and a reader would find their choice
 * quietly reverted every few launches, by a race they could never see.
 * Storage keeps the intent; `resolveRiwayah` decides what can be drawn.
 */
export function coerceRiwayahId(id: string | null | undefined): RiwayahId {
  return RIWAYAT.some(r => r.id === id) ? (id as RiwayahId) : DEFAULT_RIWAYAH;
}

export type { RiwayahPageTable };
