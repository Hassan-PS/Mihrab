/**
 * Per-prayer time offsets — task #22.
 *
 * Some users follow a mosque whose schedule differs from any single
 * calculation method (e.g. Maghrib is delayed by 5 min for sunset clarity).
 * The offsets module lets the user nudge each prayer ±N minutes.
 *
 * Offsets are applied AFTER `validateTimings` succeeds but BEFORE the
 * timings are cached or surfaced to the widget. The `reviewer` subagent's
 * rule: a buggy offset must never poison the cache — pure functional
 * application makes this easy to test.
 */

import type { TimingsMap } from '../types/prayer';

export type PrayerOffsetMinutes = {
  Fajr?: number;
  Sunrise?: number;
  Dhuhr?: number;
  Asr?: number;
  Maghrib?: number;
  Isha?: number;
  Imsak?: number;
};

/** Maximum absolute offset per prayer (minutes). Wider than this is almost
 *  certainly a config error — clamp defensively. */
export const MAX_OFFSET_MAGNITUDE = 30;

export function clampOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const n = Math.round(value);
  if (n > MAX_OFFSET_MAGNITUDE) return MAX_OFFSET_MAGNITUDE;
  if (n < -MAX_OFFSET_MAGNITUDE) return -MAX_OFFSET_MAGNITUDE;
  return n;
}

/** Coerce raw stored input into a clean offsets object. Drops unknown keys. */
export function coercePrayerOffsets(input: unknown): PrayerOffsetMinutes {
  if (!input || typeof input !== 'object') return {};
  const r = input as Record<string, unknown>;
  const out: PrayerOffsetMinutes = {};
  const keys: Array<keyof PrayerOffsetMinutes> = [
    'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Imsak',
  ];
  for (const k of keys) {
    if (r[k] !== undefined) {
      const v = clampOffset(r[k]);
      if (v !== 0) out[k] = v;
    }
  }
  return out;
}

/** Add minutes to a HH:MM string, wrapping past midnight if needed. */
function addMinutesToHhmm(hhmm: string, minutes: number): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + minutes;
  let mod = total % (24 * 60);
  if (mod < 0) mod += 24 * 60;
  const h = Math.floor(mod / 60);
  const mm = mod % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Apply per-prayer offsets to a timings map. Returns a NEW timings map
 * (input is never mutated). Unknown keys in the input are passed through
 * unchanged.
 *
 * No-op (returns the original reference) when there are no offsets, so
 * downstream memo equality stays cheap.
 */
export function applyOffsets(
  timings: TimingsMap,
  offsets: PrayerOffsetMinutes,
): TimingsMap {
  const keys = Object.keys(offsets) as Array<keyof PrayerOffsetMinutes>;
  const hasAny = keys.some(k => offsets[k] !== undefined && offsets[k] !== 0);
  if (!hasAny) return timings;
  const out: TimingsMap = { ...timings };
  for (const k of keys) {
    const off = offsets[k];
    if (off === undefined || off === 0) continue;
    const raw = timings[k];
    if (typeof raw === 'string') {
      out[k] = addMinutesToHhmm(raw, off);
    }
  }
  return out;
}
