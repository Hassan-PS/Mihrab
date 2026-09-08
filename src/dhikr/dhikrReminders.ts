/**
 * Reminders the user sets for themselves — issue #29.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ──────────────────────────────────
 *
 * Everything else this app announces is derived: the prayers come from
 * the sun, the adhkār windows from Fajr and ʿAṣr, the khatmah from a
 * plan. These are the first notifications in Mihrab that are simply a
 * time somebody chose, for words somebody chose, and that is the whole
 * request in #29: "fully programmable at any time of the day,
 * independently of the prayer times".
 *
 * So the model is deliberately plain — a time, the days it repeats on,
 * what to say, and whether it is on — and it lives in the settings blob
 * beside `locationPresets`, which is the app's existing shape for "a
 * short list of things the user made". That choice is worth a sentence:
 * a list in settings travels in backups and to a paired device for
 * free, needs no new storage key, and re-validates on load. A store of
 * its own would need all three arranged by hand, for a list that is
 * written when somebody edits a reminder and at no other time.
 *
 * ── CUSTOM REMINDERS ──────────────────────────────────────────────────
 *
 * `dhikr: null` means the user wrote this one. It carries its own title
 * and its own body and nothing in the app supplies either — which is
 * also why a custom reminder shows no source line: the app is not
 * claiming a report for words it did not choose. A preset reminder is
 * the opposite and names its report every time it is shown.
 *
 * ── SOUND, AND THE ROOM LEFT FOR AUDIO ────────────────────────────────
 *
 * `sound` is a string rather than a boolean on purpose. Today it is
 * `default` or `silent`, because a recording of dhikr is a licensing
 * question and not a scheduling one — the whole of #29's second step
 * (see the issue). When per-reminder audio does arrive it arrives as
 * another value in this field — `file:<token>`, pointing at something
 * the user imported themselves, which is the answer that sidesteps
 * licensing entirely — and `coerceSound` below already sends any value
 * it does not recognise back to `default`. So a build that does not
 * know about a sound plays the ordinary one instead of failing, and
 * nothing about the stored shape has to change to add it.
 */
import { isDhikrId, type DhikrId } from './dhikr';

/**
 * How many reminders one person may keep.
 *
 * Same reasoning as `MAX_LOCATION_PRESETS`, plus a harder one: every
 * enabled reminder is pending notifications, and iOS keeps only the 64
 * soonest an app has registered. This app already spends most of that
 * on prayers. Twelve reminders, at the look-ahead in
 * `src/notifications/dhikrReminders.ts`, cannot crowd a prayer alert
 * off a phone.
 */
export const MAX_DHIKR_REMINDERS = 12;

export type DhikrReminderSound = 'default' | 'silent';

export type DhikrReminder = {
  /** Stable across edits — the notification ids are built from it. */
  id: string;
  /** Which dhikr, or null for one the user wrote. */
  dhikr: DhikrId | null;
  /** Custom reminders only. Ignored, and not shown, for a preset one. */
  title?: string;
  body?: string;
  /** Local clock. 0–23 and 0–59; anything else is clamped on load. */
  hour: number;
  minute: number;
  /**
   * Weekdays this repeats on, `0` Sunday through `6` Saturday, sorted
   * and deduplicated. EMPTY MEANS EVERY DAY rather than never: a
   * reminder with no days chosen is what somebody creating one has
   * before they touch anything, and "never" is what the enabled switch
   * is for.
   */
  days: number[];
  enabled: boolean;
  sound: DhikrReminderSound;
};

const SOUNDS: readonly string[] = ['default', 'silent'];

export function coerceSound(value: unknown): DhikrReminderSound {
  return SOUNDS.includes(value as string)
    ? (value as DhikrReminderSound)
    : 'default';
}

/** Unique enough for a list of twelve, and readable in a log. */
export function newDhikrReminderId(): string {
  return `dhk_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function coerceDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = new Set<number>();
  for (const raw of value) {
    const n = Math.trunc(Number(raw));
    if (Number.isInteger(n) && n >= 0 && n <= 6) days.add(n);
  }
  return [...days].sort((a, b) => a - b);
}

/** One reminder from whatever was on disk, or null if it is not one. */
export function coerceDhikrReminder(value: unknown): DhikrReminder | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const dhikr = isDhikrId(raw.dhikr) ? raw.dhikr : null;
  // A stored reminder for a dhikr this build no longer ships becomes a
  // custom one holding its own words, rather than vanishing: the time
  // and the days are the user's work either way.
  const title = typeof raw.title === 'string' ? raw.title : undefined;
  const body = typeof raw.body === 'string' ? raw.body : undefined;
  if (!dhikr && !title && !body) return null;
  return {
    id: raw.id,
    dhikr,
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
    hour: clampInt(raw.hour, 0, 23, 9),
    minute: clampInt(raw.minute, 0, 59, 0),
    days: coerceDays(raw.days),
    // Absent means on: an older blob that predates the field was written
    // by somebody who had no way to turn one off.
    enabled: raw.enabled !== false,
    sound: coerceSound(raw.sound),
  };
}

/** The whole list, from whatever was on disk. Malformed entries drop. */
export function coerceDhikrReminders(value: unknown): DhikrReminder[] {
  if (!Array.isArray(value)) return [];
  const out: DhikrReminder[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const one = coerceDhikrReminder(raw);
    if (!one || seen.has(one.id)) continue;
    seen.add(one.id);
    out.push(one);
    if (out.length >= MAX_DHIKR_REMINDERS) break;
  }
  return out;
}

/** New array every time; the input is never touched. */
export function addDhikrReminder(
  list: readonly DhikrReminder[],
  draft: Omit<DhikrReminder, 'id'>,
): DhikrReminder[] {
  if (list.length >= MAX_DHIKR_REMINDERS) return [...list];
  return [...list, { ...draft, id: newDhikrReminderId() }];
}

export function updateDhikrReminder(
  list: readonly DhikrReminder[],
  id: string,
  patch: Partial<Omit<DhikrReminder, 'id'>>,
): DhikrReminder[] {
  return list.map(r => (r.id === id ? { ...r, ...patch } : r));
}

export function removeDhikrReminder(
  list: readonly DhikrReminder[],
  id: string,
): DhikrReminder[] {
  return list.filter(r => r.id !== id);
}

/** Does this reminder repeat on `date`'s weekday? Empty days means yes. */
export function runsOn(reminder: DhikrReminder, date: Date): boolean {
  return reminder.days.length === 0 || reminder.days.includes(date.getDay());
}

/**
 * Every instant this reminder should fire in the next `days` days.
 *
 * Strictly in the future, for the same reason `surahReminders` filters
 * the same way: a TIMESTAMP trigger in the past fires the moment it is
 * registered, so a resync would re-deliver this morning's reminder every
 * time the app came to the foreground.
 */
export function reminderOccurrences(opts: {
  reminder: DhikrReminder;
  now: Date;
  days: number;
}): Date[] {
  const { reminder, now } = opts;
  if (!reminder.enabled) return [];
  const out: Date[] = [];
  for (let i = 0; i <= opts.days; i++) {
    const at = new Date(now);
    at.setDate(at.getDate() + i);
    at.setHours(reminder.hour, reminder.minute, 0, 0);
    if (at.getTime() <= now.getTime()) continue;
    if (!runsOn(reminder, at)) continue;
    out.push(at);
  }
  return out;
}

/**
 * One short string that changes whenever anything about the schedule
 * does — for the daily resync's fingerprint.
 *
 * Only the fields that decide WHEN a notification fires and WHAT it
 * says. A reminder that is off contributes nothing but its id, so
 * turning one off is a change and editing a disabled one is not.
 */
export function dhikrFingerprint(list: readonly DhikrReminder[]): string {
  return list
    .map(r =>
      r.enabled
        ? [
            r.id,
            r.dhikr ?? 'custom',
            r.hour,
            r.minute,
            r.days.join('') || 'all',
            r.sound,
            r.title ?? '',
            r.body ?? '',
          ].join('|')
        : `${r.id}|off`,
    )
    .join(';');
}
