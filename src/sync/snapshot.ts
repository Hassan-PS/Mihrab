/**
 * A portable snapshot of everything the user has actually put into this app.
 *
 * ONE FORMAT FOR TWO FEATURES. Exporting to a file and syncing to another
 * phone are the same problem twice: take the parts of the record the user
 * chose, put them somewhere, merge them into whatever is already on the
 * other side. Building the transfer twice would guarantee the two disagree
 * about what a khatmah plan is, so both go through this module.
 *
 * ── WHY THE CIPHERTEXT CANNOT SIMPLY BE COPIED ────────────────────────
 *
 * The journal, fasting, dhikr and sunnah stores are encrypted at rest with a
 * key that lives in the Android Keystore / iOS Keychain. That key is
 * device-bound and cannot be exported — that is the entire point of it. So a
 * byte copy of the encrypted blob is worthless on any other device, and a
 * snapshot has to carry DECRYPTED values. Confidentiality is therefore the
 * transport's job, not storage's: a file the user saves is as private as
 * where they save it, and a sync link is as private as the channel.
 *
 * ── MERGING IS COMMUTATIVE AND IDEMPOTENT, ON PURPOSE ─────────────────
 *
 * Every rule in `mergeData` is a union, a max, or a newest-wins on a
 * timestamp the writer had already stored. That means:
 *
 *   merge(a, b) == merge(b, a)          — order of devices does not matter
 *   merge(a, a) == a                    — importing twice changes nothing
 *   merge(merge(a,b),c) == merge(a,merge(b,c))
 *
 * Which is what makes a peer-to-peer cycle safe with no server, no agreement
 * about whose clock is right, and no vector clocks: three phones can sync in
 * any order, in any pairing, as often as they like, and land on the same
 * record. It also means a merge can never DELETE anything — the price of
 * that safety, and the right price for a record of someone's worship.
 * Deletions are a separate problem and deliberately out of scope: a bookmark
 * removed on one phone will come back from the other, which is a better
 * failure than a month of prayers vanishing because two devices disagreed
 * about which of them was newer.
 */
import { coerceJournalEntries, type JournalEntry } from '../journal/journal';
import { coerceFastEntries, type FastEntry } from '../fasting/fasting';
import { coerceSunnahLog, type SunnahLog } from '../journal/sunnah';
import { coerceDhikrLog, type DhikrLog } from '../practice/practiceStore';
import {
  coerceQuranState,
  DEFAULT_QURAN_STATE,
  type QuranState,
} from '../quran/quranState';

export const SNAPSHOT_FORMAT = 'mihrab.snapshot';
export const SNAPSHOT_FORMAT_VERSION = 1;

/**
 * The things a user can choose to take with them.
 *
 * Deliberately NOT one flag per storage key. These are the words a person
 * would use about their own data; the mapping from "quran" to bookmarks,
 * starred ayat, khatmah plans, last-read position and reader preferences is
 * this module's business, not theirs.
 */
export const SYNC_CATEGORIES = [
  'prayers',
  'fasting',
  'dhikr',
  'sunnah',
  'quran',
  'settings',
  'location',
] as const;

export type SyncCategory = (typeof SYNC_CATEGORIES)[number];
export type SyncSelection = Record<SyncCategory, boolean>;

/**
 * Everything on except location.
 *
 * Location is coordinates — home, work, wherever someone actually prays —
 * and it is the one category that is a liability rather than a record if it
 * lands somewhere unintended. Opt-in each time, not a switch that can be
 * turned on once and forgotten.
 */
export const DEFAULT_SELECTION: SyncSelection = {
  prayers: true,
  fasting: true,
  dhikr: true,
  sunnah: true,
  quran: true,
  settings: true,
  location: false,
};

export function everything(): SyncSelection {
  return { ...DEFAULT_SELECTION, location: true };
}

export function nothing(): SyncSelection {
  return {
    prayers: false,
    fasting: false,
    dhikr: false,
    sunnah: false,
    quran: false,
    settings: false,
    location: false,
  };
}

export function coerceSelection(input: unknown): SyncSelection {
  const out = { ...DEFAULT_SELECTION };
  if (!input || typeof input !== 'object') return out;
  const r = input as Record<string, unknown>;
  for (const key of SYNC_CATEGORIES) {
    if (typeof r[key] === 'boolean') out[key] = r[key] as boolean;
  }
  return out;
}

/** The decrypted, in-memory shape of everything worth carrying. */
export type SnapshotData = {
  prayers: JournalEntry[];
  fasting: FastEntry[];
  dhikr: DhikrLog;
  sunnah: SunnahLog;
  quran: QuranState;
  settings: Record<string, unknown>;
  location: Record<string, unknown>;
};

/**
 * The document itself.
 *
 * A category the user left out is ABSENT rather than empty, because on the
 * way back in those mean opposite things: an absent `prayers` must leave the
 * receiving device's prayers alone, while an empty one would be a claim that
 * there are none.
 */
export type Snapshot = {
  format: typeof SNAPSHOT_FORMAT;
  version: number;
  createdAt: string;
  /** Free-form, for diagnosing a file someone mails in. Never identifying. */
  meta?: Record<string, unknown>;
  data: Partial<SnapshotData>;
};

export function emptyData(): SnapshotData {
  return {
    prayers: [],
    fasting: [],
    dhikr: {},
    sunnah: {},
    quran: DEFAULT_QURAN_STATE,
    settings: {},
    location: {},
  };
}

/** Build a snapshot from already-loaded data. Pure — no storage, no clock. */
export function buildSnapshot(
  data: SnapshotData,
  selection: SyncSelection,
  createdAt: string,
  meta?: Record<string, unknown>,
): Snapshot {
  const out: Partial<SnapshotData> = {};
  if (selection.prayers) out.prayers = data.prayers;
  if (selection.fasting) out.fasting = data.fasting;
  if (selection.dhikr) out.dhikr = data.dhikr;
  if (selection.sunnah) out.sunnah = data.sunnah;
  if (selection.quran) out.quran = data.quran;
  if (selection.settings) out.settings = data.settings;
  if (selection.location) out.location = data.location;
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_FORMAT_VERSION,
    createdAt,
    ...(meta ? { meta } : {}),
    data: out,
  };
}

/** Which categories a snapshot actually carries. */
export function categoriesIn(snapshot: Snapshot): SyncCategory[] {
  return SYNC_CATEGORIES.filter(c => snapshot.data[c] !== undefined);
}

export class SnapshotError extends Error {}

/**
 * Read a snapshot from anything at all, running every category through the
 * same validator the app already uses on its own stored blob.
 *
 * Hostile by assumption. This is the one place foreign data enters — a file
 * someone edited by hand, a different app version, another device on the
 * network — and every store it feeds has a validator already, because they
 * all had to survive their own disk first.
 */
export function readSnapshot(raw: unknown): Snapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SnapshotError('not-an-object');
  }
  const r = raw as Record<string, unknown>;
  if (r.format !== SNAPSHOT_FORMAT) throw new SnapshotError('not-a-snapshot');
  const version = typeof r.version === 'number' ? r.version : 0;
  if (version > SNAPSHOT_FORMAT_VERSION) {
    // Refusing beats guessing: a newer format may have moved something this
    // build would then silently drop on its next export.
    throw new SnapshotError('from-a-newer-version');
  }
  const rawData =
    r.data && typeof r.data === 'object' && !Array.isArray(r.data)
      ? (r.data as Record<string, unknown>)
      : {};

  const data: Partial<SnapshotData> = {};
  if (rawData.prayers !== undefined) {
    data.prayers = coerceJournalEntries(rawData.prayers);
  }
  if (rawData.fasting !== undefined) {
    data.fasting = coerceFastEntries(rawData.fasting);
  }
  if (rawData.dhikr !== undefined) data.dhikr = coerceDhikrLog(rawData.dhikr);
  if (rawData.sunnah !== undefined) {
    data.sunnah = coerceSunnahLog(rawData.sunnah);
  }
  if (rawData.quran !== undefined) data.quran = coerceQuranState(rawData.quran);
  if (rawData.settings !== undefined) {
    data.settings = plainObject(rawData.settings);
  }
  if (rawData.location !== undefined) {
    data.location = plainObject(rawData.location);
  }

  return {
    format: SNAPSHOT_FORMAT,
    version,
    createdAt:
      typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
    ...(r.meta && typeof r.meta === 'object'
      ? { meta: r.meta as Record<string, unknown> }
      : {}),
    data,
  };
}

function plainObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** A cheap "is this even ours" for a paste box that wants to hint early. */
export function isSnapshot(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>).format === SNAPSHOT_FORMAT
  );
}
