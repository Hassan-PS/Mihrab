/**
 * Which riwayat this DEVICE has, held in memory for the render path.
 *
 * ── WHY A CACHE AND NOT A `require` ───────────────────────────────────
 *
 * `pages.ts` answers "which page is 2:142 on" from inside a render, and
 * `MushafUnicodePage` asks for a page's ayahs the same way. Both are
 * synchronous and neither may become async — a reader that awaited its
 * own pagination would paint a blank page first and the right one after.
 *
 * The data itself is not in the bundle any more (`riwayahStore.ts` has
 * the reasoning: Mihrab has no right to distribute the Warsh corpus, so
 * it does not). It is on the device, which means reading it is I/O. So it
 * is read ONCE, at hydration, into these maps — and everything after that
 * is a map lookup.
 *
 * A build that has never been given a riwayah has empty maps, which is
 * exactly the old behaviour: Hafs, no toggle, nothing to turn off.
 *
 * ── WHY IT NOTIFIES ───────────────────────────────────────────────────
 *
 * Availability used to be a build-time fact. Now a reader can add a
 * muṣḥaf while the app is running, and the toggle that was hidden a
 * second ago has to appear. `useRiwayahAvailability()` is how the screens
 * find out; nothing polls.
 */
import { useSyncExternalStore } from 'react';
import type { MushafPageRange, SurahMeta } from './pages';
import type { RiwayahDataset } from './riwayahImport';
import {
  eraseRiwayahDataset,
  readRiwayahDataset,
  readRiwayahProvenance,
  writeRiwayahDataset,
  type RiwayahProvenance,
} from './riwayahStore';
import { RIWAYAT, type RiwayahId } from './riwayat';

/** One riwayah's pagination: the same shape `pages.json` has for Hafs. */
export type RiwayahPageTable = {
  pages: ReadonlyArray<MushafPageRange>;
  surahs: ReadonlyArray<SurahMeta>;
  /**
   * Ayahs per surah in THIS riwayah, indexed from 0.
   *
   * Optional because a muṣḥaf stored by 2.13 has none — that build assumed
   * every riwayah counted like Ḥafṣ. `readRiwayahDataset` derives it from
   * the stored text in that case, so this is only ever absent in memory
   * for a table built by hand in a test.
   */
  ayahCounts?: ReadonlyArray<number>;
};

/** Ayah text for a `unicode` riwayah, keyed `"surah:ayah"`. */
export type RiwayahTextTable = Record<string, string>;

const pageCache = new Map<RiwayahId, RiwayahPageTable>();
const textCache = new Map<RiwayahId, RiwayahTextTable>();
const provenanceCache = new Map<RiwayahId, RiwayahProvenance>();

let hydrated = false;
let hydrating: Promise<void> | null = null;

const listeners = new Set<() => void>();
/** Bumped on every change, so `useSyncExternalStore` has a snapshot. */
let version = 0;

function publish(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** The riwayat that could be stored — Hafs is drawn from the bundle. */
function storable(): RiwayahId[] {
  return RIWAYAT.filter(r => r.render === 'unicode').map(r => r.id);
}

/**
 * Read whatever this device has. Safe to call repeatedly; does the work
 * once.
 */
export function hydrateRiwayahData(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    for (const id of storable()) {
      const dataset = await readRiwayahDataset(id);
      if (!dataset) continue;
      const provenance = await readRiwayahProvenance(id);
      // No provenance means the write did not finish — see
      // `writeRiwayahDataset`. Treat it as absent rather than draw a
      // muṣḥaf nobody can account for.
      if (!provenance) continue;
      pageCache.set(id, { pages: dataset.pages, surahs: dataset.surahs });
      textCache.set(id, dataset.text);
      provenanceCache.set(id, provenance);
    }
    hydrated = true;
    publish();
  })();
  return hydrating;
}

/** Has the store been read yet? Screens use it to avoid flashing "none". */
export function riwayahDataHydrated(): boolean {
  return hydrated;
}

/**
 * The pagination for a riwayah, or null when this device lacks it.
 *
 * Hafs is not handled here — it has `pages.ts` and always exists.
 */
export function loadRiwayahPages(id: RiwayahId): RiwayahPageTable | null {
  return pageCache.get(id) ?? null;
}

/** The ayah text for a `unicode` riwayah, or null when absent. */
export function loadRiwayahText(id: RiwayahId): RiwayahTextTable | null {
  return textCache.get(id) ?? null;
}

/** Where this device's copy came from, or null when it has none. */
export function riwayahProvenance(id: RiwayahId): RiwayahProvenance | null {
  return provenanceCache.get(id) ?? null;
}

/**
 * Store a VERIFIED dataset and make it live.
 *
 * Verified is the caller's job and there is exactly one way to do it —
 * `verifyRiwayahDataset`. This function does not re-check, because a
 * second implementation of the checks is how the two drift apart; it
 * takes the type that only that function can produce.
 */
export async function installRiwayahDataset(
  id: RiwayahId,
  dataset: RiwayahDataset,
  from: string,
): Promise<RiwayahProvenance> {
  const provenance = await writeRiwayahDataset(id, dataset, from);
  pageCache.set(id, { pages: dataset.pages, surahs: dataset.surahs });
  textCache.set(id, dataset.text);
  provenanceCache.set(id, provenance);
  publish();
  return provenance;
}

/** Remove a riwayah from this device. */
export async function uninstallRiwayah(id: RiwayahId): Promise<void> {
  await eraseRiwayahDataset(id);
  pageCache.delete(id);
  textCache.delete(id);
  provenanceCache.delete(id);
  publish();
}

/**
 * Re-render when what this device carries changes.
 *
 * Returns the version rather than a list: the list would be a new array
 * every call and `useSyncExternalStore` would loop. Callers ask
 * `availableRiwayat()` for the answer once this tells them it moved.
 */
export function useRiwayahAvailability(): number {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => version,
  );
}

/** Tests only — the caches are process-lifetime otherwise. */
export function _resetRiwayahDataCacheForTests(): void {
  pageCache.clear();
  textCache.clear();
  provenanceCache.clear();
  hydrated = false;
  hydrating = null;
  version = 0;
}

/** Tests only — install without touching the filesystem. */
export function _setRiwayahDataForTests(
  id: RiwayahId,
  dataset: RiwayahDataset,
): void {
  pageCache.set(id, { pages: dataset.pages, surahs: dataset.surahs });
  textCache.set(id, dataset.text);
  provenanceCache.set(id, {
    from: 'test',
    at: new Date(0).toISOString(),
    ayahs: Object.keys(dataset.text).length,
    pages: dataset.pages.length,
    bytes: 0,
  });
  hydrated = true;
  publish();
}
