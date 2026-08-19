/**
 * The half of the snapshot that touches disk.
 *
 * `snapshot.ts` and `merge.ts` are pure so they can be tested exhaustively
 * without a device; this is the thin, boring layer that reads the six stores
 * and writes the result back. Keeping it thin is the point — every decision
 * worth arguing about lives next door, and this file should never need one.
 *
 * WHAT IS DELIBERATELY NOT HERE: the prayer-times cache, the city registry,
 * provider health, the reverse-geocode cache, the dataset caches, the
 * install date, the muted-adhan flag, the feature-tour flag, and every
 * downloaded mushaf page, font, recitation and tafsir file. Those are either
 * derived (they rebuild themselves), device-local (they describe THIS phone,
 * not the user), or enormous. Carrying `mihrab.first_seen_day` across would
 * be actively wrong: the Log's "fill in earlier days" button uses it as the
 * earliest day it may offer, so importing it would let a phone claim days it
 * never saw.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import { coerceJournalEntries } from '../journal/journal';
import { coerceFastEntries } from '../fasting/fasting';
import { coerceSunnahLog } from '../journal/sunnah';
import {
  coerceDhikrLog,
  DHIKR_KEY,
  FASTING_KEY,
  JOURNAL_KEY,
  SUNNAH_KEY,
  notifyPracticeChanged,
} from '../practice/practiceStore';
import { coerceQuranState, QURAN_STORAGE_KEY } from '../quran/quranState';
import { emptyData, type SnapshotData, type SyncSelection } from './snapshot';
import { mergeData, summarise, type MergeSummary } from './merge';
import type { Snapshot } from './snapshot';

/** Plaintext settings blob. Must match `KEY` in settings/storage.ts. */
export const SETTINGS_KEY = 'prayerapp.settings.v1';
/** Encrypted location blob. Must match `SECURE_KEY` in secureStorage.ts. */
export const LOCATION_KEY = 'prayerapp.location.v1';

function parse<T>(raw: string | null, coerce: (v: unknown) => T, fallback: T): T {
  if (!raw) return fallback;
  try {
    return coerce(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Read every syncable store, whatever state it is in.
 *
 * Every read is independently guarded: one unreadable store must not stop
 * the other five being exported. Someone whose Keychain entry was lost in a
 * device migration should still get their Quran bookmarks out.
 */
export async function collectData(): Promise<SnapshotData> {
  const [journal, fasting, dhikr, sunnah, quran, settings, location] =
    await Promise.all([
      durableEncryptedGet(JOURNAL_KEY).catch(() => null),
      durableEncryptedGet(FASTING_KEY).catch(() => null),
      durableEncryptedGet(DHIKR_KEY).catch(() => null),
      durableEncryptedGet(SUNNAH_KEY).catch(() => null),
      AsyncStorage.getItem(QURAN_STORAGE_KEY).catch(() => null),
      AsyncStorage.getItem(SETTINGS_KEY).catch(() => null),
      durableEncryptedGet(LOCATION_KEY).catch(() => null),
    ]);
  const base = emptyData();
  return {
    prayers: parse(journal, coerceJournalEntries, base.prayers),
    fasting: parse(fasting, coerceFastEntries, base.fasting),
    dhikr: parse(dhikr, coerceDhikrLog, base.dhikr),
    sunnah: parse(sunnah, coerceSunnahLog, base.sunnah),
    quran: parse(quran, coerceQuranState, base.quran),
    settings: parse(settings, asObject, base.settings),
    location: parse(location, asObject, base.location),
  };
}

/**
 * Write back only what changed.
 *
 * A store whose category the user declined is not rewritten at all, rather
 * than rewritten with the same bytes: on the encrypted stores each write is
 * a Keystore round-trip that can fail, and a failure that risks data has no
 * business happening for a category nobody asked to touch.
 */
export async function writeData(
  next: SnapshotData,
  touched: SyncSelection,
): Promise<void> {
  const jobs: Array<Promise<unknown>> = [];
  if (touched.prayers) {
    jobs.push(durableEncryptedSet(JOURNAL_KEY, JSON.stringify(next.prayers)));
  }
  if (touched.fasting) {
    jobs.push(durableEncryptedSet(FASTING_KEY, JSON.stringify(next.fasting)));
  }
  if (touched.dhikr) {
    jobs.push(durableEncryptedSet(DHIKR_KEY, JSON.stringify(next.dhikr)));
  }
  if (touched.sunnah) {
    jobs.push(durableEncryptedSet(SUNNAH_KEY, JSON.stringify(next.sunnah)));
  }
  if (touched.quran) {
    jobs.push(
      AsyncStorage.setItem(QURAN_STORAGE_KEY, JSON.stringify(next.quran)),
    );
  }
  if (touched.settings) {
    jobs.push(
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next.settings)),
    );
  }
  if (touched.location) {
    jobs.push(durableEncryptedSet(LOCATION_KEY, JSON.stringify(next.location)));
  }
  await Promise.all(jobs);
  notifyPracticeChanged();
}

export type ApplyResult = {
  summary: MergeSummary;
  /** The categories that were actually written. */
  applied: SyncSelection;
};

/**
 * Merge a snapshot into this device and persist the result.
 *
 * A category is only touched when the snapshot carries it AND the user
 * accepted it — two gates, so neither the sending device nor the receiving
 * one can decide alone.
 */
export async function applySnapshot(
  snapshot: Snapshot,
  accept: SyncSelection,
): Promise<ApplyResult> {
  const before = await collectData();
  const after = mergeData(before, snapshot, accept);
  const applied = {} as SyncSelection;
  for (const key of Object.keys(accept) as Array<keyof SyncSelection>) {
    applied[key] = accept[key] && snapshot.data[key] !== undefined;
  }
  await writeData(after, applied);
  return { summary: summarise(before, after), applied };
}
