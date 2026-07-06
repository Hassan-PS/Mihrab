/**
 * Small persisted record of "where the app's prayer data is coming from" —
 * powers the Settings → data statistics panel (gated by `showDataStats`).
 *
 * Two independent facts are tracked:
 *   • the SOURCE that produced the most recent fresh fetch (cdn / seed / scrape
 *     / aladhan / local), recorded by the fetch chain in prayerStorage; and
 *   • the SERVER index snapshot (Sweden prepared dataset) — last build time,
 *     status, min coverage — recorded by the dataset provider when it polls
 *     `index.json`, plus when the client last checked and when it will next.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataSource } from '../providers/types';

const KEY = 'mihrab.dataStatus.v1';

export type ServerStatus = 'ok' | 'warning' | 'unknown';

export type DataStatus = {
  lastSource: DataSource | null;
  lastSourceAt: string | null; // ISO
  serverBuiltAt: string | null; // ISO — when the server last rebuilt the dataset
  serverStatus: ServerStatus;
  serverMinCoverageDays: number | null;
  serverDeadCities: number | null;
  serverCheckedAt: string | null; // ISO — when the client last read index.json
  nextServerCheckDue: string | null; // ISO — earliest next client check
};

const EMPTY: DataStatus = {
  lastSource: null,
  lastSourceAt: null,
  serverBuiltAt: null,
  serverStatus: 'unknown',
  serverMinCoverageDays: null,
  serverDeadCities: null,
  serverCheckedAt: null,
  nextServerCheckDue: null,
};

let mem: DataStatus | null = null;

async function load(): Promise<DataStatus> {
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    mem = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<DataStatus>) } : { ...EMPTY };
  } catch {
    mem = { ...EMPTY };
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

/** Record a server index.json snapshot + the next client check time. */
export async function recordServerIndex(
  idx: {
    builtAt?: string | null;
    serverStatus?: ServerStatus;
    minCoverageDays?: number | null;
    deadCities?: number | null;
  },
  nextDue: Date,
): Promise<void> {
  const s = await load();
  await save({
    ...s,
    serverBuiltAt: idx.builtAt ?? s.serverBuiltAt,
    serverStatus: idx.serverStatus ?? s.serverStatus,
    serverMinCoverageDays: idx.minCoverageDays ?? s.serverMinCoverageDays,
    serverDeadCities: idx.deadCities ?? s.serverDeadCities,
    serverCheckedAt: new Date().toISOString(),
    nextServerCheckDue: nextDue.toISOString(),
  });
}

export async function getDataStatus(): Promise<DataStatus> {
  return { ...(await load()) };
}

/** Test seam. */
export function _resetDataStatusMemoForTests(): void {
  mem = null;
}
