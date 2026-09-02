/**
 * Small persisted record of "where the app's prayer data is coming from" —
 * powers the Settings → data statistics panel (gated by `showDataStats`).
 *
 * Two independent facts are tracked:
 *   • the SOURCE that produced the most recent fresh fetch (cdn / seed / scrape
 *     / aladhan / local), recorded by the fetch chain in prayerStorage; and
 *   • the SERVER index snapshot for each prepared dataset — last build time,
 *     status, min coverage — recorded by that dataset's provider when it polls
 *     its `index.json`, plus when the client last checked and when it will
 *     next.
 *
 * THE SERVER SNAPSHOT IS PER DATASET, and for a while it was not.
 *
 * Sweden (Islamiska Förbundet) and Morocco (Habous) are two servers, built by
 * two jobs, covering different windows: the Swedish set runs most of a year
 * ahead, the Moroccan one a couple of weeks. Both wrote into a single slot, so
 * the panel showed whichever had polled most recently under a heading that
 * named neither. A phone in Stockholm reported eleven days of coverage — the
 * Moroccan number, on a Swedish screen, with nothing to say so.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataSource } from '../providers/types';

const KEY = 'mihrab.dataStatus.v1';

export type ServerStatus = 'ok' | 'warning' | 'unknown';

/** The prepared datasets that publish an `index.json`. */
export const SERVER_DATASETS = ['ifis', 'habous'] as const;
export type ServerDatasetId = (typeof SERVER_DATASETS)[number];

export type ServerIndexStatus = {
  builtAt: string | null; // ISO — when the server last rebuilt the dataset
  status: ServerStatus;
  minCoverageDays: number | null;
  deadCities: number | null;
  checkedAt: string | null; // ISO — when the client last read index.json
  nextCheckDue: string | null; // ISO — earliest next client check
};

export type DataStatus = {
  lastSource: DataSource | null;
  lastSourceAt: string | null; // ISO
  servers: Record<ServerDatasetId, ServerIndexStatus>;
};

const EMPTY_SERVER: ServerIndexStatus = {
  builtAt: null,
  status: 'unknown',
  minCoverageDays: null,
  deadCities: null,
  checkedAt: null,
  nextCheckDue: null,
};

function emptyServers(): Record<ServerDatasetId, ServerIndexStatus> {
  return {
    ifis: { ...EMPTY_SERVER },
    habous: { ...EMPTY_SERVER },
  };
}

const EMPTY: DataStatus = {
  lastSource: null,
  lastSourceAt: null,
  servers: emptyServers(),
};

let mem: DataStatus | null = null;

/**
 * Read the stored blob, dropping the pre-split server fields.
 *
 * Those fields cannot be migrated: nothing in them says which of the two
 * servers wrote them, and guessing would carry the exact wrong number this
 * split exists to remove. They are diagnostics, and the next poll — minutes
 * away, on the screen that shows them — fills them back in correctly.
 */
function parse(raw: string | null): DataStatus {
  if (!raw) return { ...EMPTY, servers: emptyServers() };
  try {
    const p = JSON.parse(raw) as Partial<DataStatus>;
    const servers = emptyServers();
    for (const id of SERVER_DATASETS) {
      const s = p.servers?.[id];
      if (s) servers[id] = { ...EMPTY_SERVER, ...s };
    }
    return {
      lastSource: p.lastSource ?? null,
      lastSourceAt: p.lastSourceAt ?? null,
      servers,
    };
  } catch {
    return { ...EMPTY, servers: emptyServers() };
  }
}

async function load(): Promise<DataStatus> {
  if (mem) return mem;
  try {
    mem = parse(await AsyncStorage.getItem(KEY));
  } catch {
    mem = { ...EMPTY, servers: emptyServers() };
  }
  return mem;
}

async function save(next: DataStatus): Promise<void> {
  mem = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* non-critical: stats are diagnostic only */
  }
}

/** Record the source of a fresh fetch (called from the fetch/store path). */
export async function recordDataSource(source: DataSource): Promise<void> {
  const s = await load();
  await save({ ...s, lastSource: source, lastSourceAt: new Date().toISOString() });
}

/** Record one dataset's `index.json` snapshot + the next client check time. */
export async function recordServerIndex(
  dataset: ServerDatasetId,
  idx: {
    builtAt?: string | null;
    serverStatus?: ServerStatus;
    minCoverageDays?: number | null;
    deadCities?: number | null;
  },
  nextDue: Date,
): Promise<void> {
  const s = await load();
  const prev = s.servers[dataset];
  await save({
    ...s,
    servers: {
      ...s.servers,
      [dataset]: {
        builtAt: idx.builtAt ?? prev.builtAt,
        status: idx.serverStatus ?? prev.status,
        minCoverageDays: idx.minCoverageDays ?? prev.minCoverageDays,
        deadCities: idx.deadCities ?? prev.deadCities,
        checkedAt: new Date().toISOString(),
        nextCheckDue: nextDue.toISOString(),
      },
    },
  });
}

export async function getDataStatus(): Promise<DataStatus> {
  const s = await load();
  return { ...s, servers: { ...s.servers } };
}

/** Test seam. */
export function _resetDataStatusMemoForTests(): void {
  mem = null;
}
