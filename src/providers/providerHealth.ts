/**
 * Provider health / cooldown — v2.7.28.
 *
 * The Swedish city source (islamiskaforbundet.se) is an HTML scraper
 * over a small origin that regularly times out. Before this module,
 * every daily fetch retried it first and logged a noisy failure chain.
 * Now: after N consecutive failures the provider enters a cooldown
 * window during which fetches silently use the global fallback
 * (AlAdhan) — the app keeps serving times from cache + fallback and
 * probes the Swedish source again only after the window expires.
 *
 * Persisted so the cooldown survives app restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'prayerapp.providerHealth.v1';

/** Consecutive failures before the cooldown starts. */
export const FAILURE_THRESHOLD = 3;
/** Cooldown length: half a day — long enough to stop the noise, short
 *  enough that a recovered origin is picked up the same day. */
export const COOLDOWN_MS = 12 * 60 * 60 * 1000;

type HealthState = {
  [providerId: string]: { failures: number; cooldownUntil: number };
};

let cache: HealthState | null = null;
let loading: Promise<HealthState> | null = null;

async function load(): Promise<HealthState> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      cache = raw ? (JSON.parse(raw) as HealthState) : {};
    } catch {
      cache = {};
    }
    return cache;
  })();
  return loading;
}

function persist(): void {
  if (!cache) return;
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(
    () => undefined,
  );
}

/** Is the provider inside a failure cooldown right now? */
export async function isProviderCoolingDown(
  providerId: string,
  now: number = Date.now(),
): Promise<boolean> {
  const state = await load();
  const entry = state[providerId];
  return entry != null && entry.cooldownUntil > now;
}

/** Record a fetch outcome; starts/clears the cooldown as needed. */
export async function recordProviderResult(
  providerId: string,
  ok: boolean,
  now: number = Date.now(),
): Promise<void> {
  const state = await load();
  const entry = state[providerId] ?? { failures: 0, cooldownUntil: 0 };
  if (ok) {
    entry.failures = 0;
    entry.cooldownUntil = 0;
  } else {
    entry.failures += 1;
    if (entry.failures >= FAILURE_THRESHOLD) {
      entry.cooldownUntil = now + COOLDOWN_MS;
      entry.failures = 0; // fresh count after the window
    }
  }
  state[providerId] = entry;
  persist();
}

/** Test-only: reset module state. */
export function __resetProviderHealthForTests(): void {
  cache = null;
  loading = null;
}
