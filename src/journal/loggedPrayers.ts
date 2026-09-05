/**
 * Which prayers a day already holds a record for.
 *
 * Small enough to inline and separate on purpose: three callers need the
 * same answer and none of them should be the one that owns it. The
 * notification schedule asks it to leave a recorded prayer's boundaries
 * alone (issue #23), the Log asks it when a row is written, and the
 * action handler behind a notification asks it with no screen mounted.
 *
 * "Logged" means a record exists, whatever it says. A prayer marked
 * `missed` has been accounted for as surely as one marked on time, and
 * telling someone their missed prayer is about to become qaḍāʾ is the
 * same contradiction in a sadder key.
 */
import {
  coerceJournalEntries,
  getEntryStatus,
  type JournalEntry,
  type JournalPrayer,
} from './journal';
import { durableEncryptedGet } from '../storage/durableWrite';
import { JOURNAL_KEY } from '../practice/practiceStore';

const PRAYERS: readonly JournalPrayer[] = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
];

/** The prayers recorded on `date`, in the order the day runs. */
export function loggedPrayersOn(
  entries: JournalEntry[],
  date: string,
): JournalPrayer[] {
  return PRAYERS.filter(p => getEntryStatus(entries, date, p) != null);
}

/**
 * The same, for every date the caller cares about — the shape the
 * schedule wants, since it runs a week ahead and a day can be filled in
 * before it arrives.
 */
export function loggedByDate(
  entries: JournalEntry[],
  dates: readonly string[],
): Record<string, JournalPrayer[]> {
  const out: Record<string, JournalPrayer[]> = {};
  for (const d of dates) out[d] = loggedPrayersOn(entries, d);
  return out;
}

/**
 * The journal as stored, or [] when there is none or it cannot be read.
 *
 * The same read `endOfDayLog` does, in a place both schedulers can reach.
 * It decrypts, so callers ask for it only when the answer can change what
 * they do — see `syncPrayerNotifications`, which skips it entirely unless
 * a second-time alert is actually armed.
 */
export async function storedJournalEntries(): Promise<JournalEntry[]> {
  const raw = await durableEncryptedGet(JOURNAL_KEY).catch(() => null);
  if (!raw) return [];
  try {
    return coerceJournalEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}
