/**
 * Loading a riwayah's own data, if this build has it.
 *
 * Split from `riwayat.ts` so the registry can describe a riwayah without
 * importing its (potentially large) data, and so the `require` that may
 * legitimately fail sits in exactly one place.
 *
 * `require` rather than `import` on purpose, and wrapped: the Warsh files
 * are produced by `tools/riwayat/` from a dataset that is NOT committed —
 * its licence is unresolved (`docs/design/riwayat-plan.md`) — so a
 * checkout that has never run the importer simply does not have them. A
 * missing riwayah is a build that offers Hafs only, which is the correct
 * behaviour rather than a build failure.
 */
import type { MushafPageRange, SurahMeta } from './pages';
import type { RiwayahId } from './riwayat';

/** One riwayah's pagination: the same shape `pages.json` has for Hafs. */
export type RiwayahPageTable = {
  pages: ReadonlyArray<MushafPageRange>;
  surahs: ReadonlyArray<SurahMeta>;
};

/** Ayah text for a `unicode` riwayah, keyed `"surah:ayah"`. */
export type RiwayahTextTable = Record<string, string>;

const pageCache = new Map<RiwayahId, RiwayahPageTable | null>();
const textCache = new Map<RiwayahId, RiwayahTextTable | null>();

/**
 * The pagination for a riwayah, or null when this build lacks it.
 *
 * Hafs is not handled here — it has `pages.ts` and always exists.
 */
export function loadRiwayahPages(id: RiwayahId): RiwayahPageTable | null {
  if (pageCache.has(id)) return pageCache.get(id) ?? null;
  let table: RiwayahPageTable | null = null;
  try {
    if (id === 'warsh') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      table = require('./data/warsh/pages.json') as RiwayahPageTable;
    }
  } catch {
    table = null;
  }
  // A file that exists but is empty is not a riwayah — treat it as absent
  // rather than shipping a reader with nothing to read.
  if (table && (!Array.isArray(table.pages) || table.pages.length === 0)) {
    table = null;
  }
  pageCache.set(id, table);
  return table;
}

/** The ayah text for a `unicode` riwayah, or null when absent. */
export function loadRiwayahText(id: RiwayahId): RiwayahTextTable | null {
  if (textCache.has(id)) return textCache.get(id) ?? null;
  let text: RiwayahTextTable | null = null;
  try {
    if (id === 'warsh') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      text = require('./data/warsh/text.json') as RiwayahTextTable;
    }
  } catch {
    text = null;
  }
  if (text && Object.keys(text).length === 0) text = null;
  textCache.set(id, text);
  return text;
}

/** Tests only — the caches are process-lifetime otherwise. */
export function _resetRiwayahDataCacheForTests(): void {
  pageCache.clear();
  textCache.clear();
}
