/**
 * The buttons on a prayer alert — built in ONE place.
 *
 * They were built twice: once for the alert that fires at prayer time and
 * once for the copy a snooze re-fires. The two had already drifted — the
 * snoozed copy lost its "Log prayer" button, so snoozing a prayer quietly
 * cost you the ability to log it from the notification at all. One builder,
 * one drift-free answer.
 *
 * ── THE SNOOZE CHIPS SAY WHAT THEY DO ─────────────────────────────────
 *
 * They used to read "5" "10" "15" "30" — four bare numbers under a text
 * field labelled "Minutes", which is a puzzle rather than a control. They now
 * read "Snooze 5 min", and tapping one snoozes immediately: the free-form
 * field is gone, and with it the second tap on a send button that a wrist
 * cannot comfortably find.
 *
 * Free-form typing went for a second reason. `allowGeneratedReplies` defaults
 * to TRUE in notifee, so a watch could offer its own smart-reply chips on
 * this action — "Sure, on my way" lands in the input, parses to nothing, and
 * the old parser silently snoozed ten minutes the user never asked for.
 * Choices-only, generated replies off, and the parser matches the exact label
 * it generated before it ever falls back to digits.
 *
 * ── WHY THERE IS NO "STOP ADHAN" HERE ─────────────────────────────────
 *
 * `AdhanPlayer` is an iOS module — on Android every one of its methods is a
 * documented no-op, because there the adhan IS the channel sound. So the
 * Android button's only effect was cancelling the notification, which
 * swiping it away already does. It was spending one of the three slots
 * Android gives us to duplicate a swipe. iOS keeps its own Stop action,
 * declared on the category, where it does real work.
 */
import i18n from '../i18n';
import { SUNNAH_UNITS } from '../journal/sunnah';
import type { JournalPrayer } from '../journal/journal';
import {
  JOURNAL_LOG_ACTION_ID,
  JOURNAL_LOG_SUNNAH_ACTION_ID,
} from './prayerLogAction';
import { ADHAN_ACTION_SNOOZE } from './adhanActionIds';

/** Quick-choice minute presets offered on the snooze action. */
export const SNOOZE_PRESETS = [5, 10, 15, 30] as const;
/** Used when a snooze arrives with nothing legible in it. */
export const SNOOZE_DEFAULT_MIN = 10;
/** Hard clamp so a fat-fingered "9999" can't schedule days out. */
export const SNOOZE_MAX_MIN = 180;

/** The label on one snooze chip, in the active language. */
export function snoozeChoiceLabel(minutes: number): string {
  return i18n.t('alertCopy.snoozeChoice', {
    defaultValue: 'Snooze {{minutes}} min',
    minutes,
  });
}

/** All four chips, in order. */
export function snoozeChoices(): string[] {
  return SNOOZE_PRESETS.map(snoozeChoiceLabel);
}

/**
 * Digits in any script — Arabic-Indic and Eastern Arabic-Indic included.
 * A localised chip built by i18n may carry ٥ rather than 5, and a snooze
 * that silently became ten minutes because the parser only knew ASCII is
 * exactly the class of bug this whole file exists to stop.
 */
function asciiDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c >= 0x30 && c <= 0x39) out += ch;
    else if (c >= 0x0660 && c <= 0x0669) out += String(c - 0x0660);
    else if (c >= 0x06f0 && c <= 0x06f9) out += String(c - 0x06f0);
    else out += ' ';
  }
  return out;
}

/**
 * The minutes a snooze press asked for.
 *
 * Matches the exact label we generated first, which is locale-proof and
 * cannot be fooled by a translation that puts the number in the middle of a
 * sentence. Only then does it go looking for digits, for the iOS text field
 * and for anything a watch may substitute.
 */
export function parseSnoozeMinutes(
  input: unknown,
  fallback: number = SNOOZE_DEFAULT_MIN,
): number {
  if (typeof input !== 'string') return fallback;
  const s = input.trim();
  if (!s) return fallback;
  for (const m of SNOOZE_PRESETS) {
    if (snoozeChoiceLabel(m) === s) return m;
  }
  const flat = asciiDigits(s);
  const at = flat.search(/\d/);
  if (at < 0) return fallback;
  // A minus sign is erased into a space by `asciiDigits`, which would turn
  // "-4" into a four-minute snooze rather than a rejected one. Look back at
  // the ORIGINAL string for it.
  if (s[at] === '-' || s[at - 1] === '-') return fallback;
  const n = parseInt(flat.slice(at), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, SNOOZE_MAX_MIN);
}

export type PrayerAlertAction = {
  title: string;
  pressAction: { id: string };
  input?: {
    allowFreeFormInput: boolean;
    allowGeneratedReplies: boolean;
    choices: string[];
  };
};

/**
 * The Android action row for one prayer's alert.
 *
 * Three slots, and Android shows no more than three:
 *
 *   Snooze          — the four chips, straight through
 *   Log prayer      — the fard, on time
 *   Log with sunnah — the fard AND that prayer's sunnah
 *
 * The third is omitted for Asr, which carries no sunnah mu'akkadah: a button
 * offering to log a sunnah that does not exist would either lie about what it
 * wrote or do the same as the button beside it.
 */
export function prayerAlertActions(prayer: string): PrayerAlertAction[] {
  const actions: PrayerAlertAction[] = [
    {
      title: i18n.t('alertCopy.snoozeAction', 'Snooze'),
      pressAction: { id: ADHAN_ACTION_SNOOZE },
      input: {
        // Both false: a chip tap must snooze, not open a keyboard, and the
        // watch must not be allowed to invent its own replies. See header.
        allowFreeFormInput: false,
        allowGeneratedReplies: false,
        choices: snoozeChoices(),
      },
    },
    {
      title: i18n.t('journal.logActionTitle', 'Log prayer'),
      // The prayer travels in the id so the handler can route without the
      // payload, which a relay is free to drop.
      pressAction: { id: `${JOURNAL_LOG_ACTION_ID}:${prayer}` },
    },
  ];
  if ((SUNNAH_UNITS[prayer as JournalPrayer] ?? 0) > 0) {
    actions.push({
      title: i18n.t('journal.logSunnahActionTitle', 'Log with sunnah'),
      pressAction: { id: `${JOURNAL_LOG_SUNNAH_ACTION_ID}:${prayer}` },
    });
  }
  return actions;
}
