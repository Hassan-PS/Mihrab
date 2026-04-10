import type { NextSalahName, TimingsMap } from '../types/prayer';
import { NEXT_SALAH_ORDER } from '../types/prayer';

export function extractClock(timeStr: string): { hour: number; minute: number } {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    throw new Error(`Unrecognized time format: ${timeStr}`);
  }
  return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
}

export function formatDisplayTime(timeStr: string): string {
  const { hour, minute } = extractClock(timeStr);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatLocalTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function combineLocalDateAndTime(day: Date, timeStr: string): Date {
  const { hour, minute } = extractClock(timeStr);
  const out = new Date(day);
  out.setHours(hour, minute, 0, 0);
  return out;
}

export function addDays(day: Date, days: number): Date {
  const out = new Date(day);
  out.setDate(out.getDate() + days);
  return out;
}

export function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function computeNextSalah(
  timings: TimingsMap,
  now: Date,
): { name: NextSalahName; at: Date } | null {
  const dayStart = startOfLocalDay(now);
  for (const name of NEXT_SALAH_ORDER) {
    const raw = timings[name];
    if (!raw) {
      continue;
    }
    const at = combineLocalDateAndTime(dayStart, raw);
    if (at > now) {
      return { name, at };
    }
  }
  return null;
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '0m';
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

export function getNextPrayerDisplay(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
): { name: string; at: Date } | null {
  const next = computeNextSalah(today, now);
  if (next) {
    return { name: next.name, at: next.at };
  }
  const fajr = tomorrow?.Fajr;
  if (!fajr) {
    return null;
  }
  const tomorrowDay = addDays(startOfLocalDay(now), 1);
  const at = combineLocalDateAndTime(tomorrowDay, fajr);
  return { name: 'Fajr', at };
}

const NOTIFICATION_BUFFER_MS = 15_000;

export function buildUpcomingSalahEvents(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
): { name: string; at: Date }[] {
  const dayStart = startOfLocalDay(now);
  const events: { name: string; at: Date }[] = [];
  for (const name of NEXT_SALAH_ORDER) {
    const raw = today[name];
    if (raw) {
      events.push({ name, at: combineLocalDateAndTime(dayStart, raw) });
    }
  }
  if (tomorrow) {
    const nextDayStart = addDays(dayStart, 1);
    for (const name of NEXT_SALAH_ORDER) {
      const raw = tomorrow[name];
      if (raw) {
        events.push({ name, at: combineLocalDateAndTime(nextDayStart, raw) });
      }
    }
  }
  const cutoff = now.getTime() + NOTIFICATION_BUFFER_MS;
  return events.filter(e => e.at.getTime() > cutoff);
}
