/**
 * What this device remembers about sync: the folder, what it sends, and
 * when it last ran.
 *
 * ── DEVICE-LOCAL, ALL OF IT ───────────────────────────────────────────
 *
 * The folder handle is a Storage Access Framework URI on Android and a
 * security-scoped bookmark on iOS. Both are meaningless on any other
 * device — a bookmark resolved on the wrong phone is at best nothing and
 * at worst somebody else's directory — so this never travels, and
 * `syncCompleteness.test.ts` records that.
 *
 * ── PLAINTEXT, UNLIKE THE IDENTITY AND THE PEER LIST ──────────────────
 *
 * Those two are in the Keystore / Keychain because one is a secret key and
 * the other is a map of someone's devices. This is configuration: which
 * folder, which categories, when it last ran. A secure read that fails
 * would mean sync silently stops, which is a worse outcome than a
 * preference sitting in the same store as every other preference.
 *
 * ── THE SELECTION HAS A DIFFERENT DEFAULT FROM EXPORT ─────────────────
 *
 * Export defaults to everything, because a backup that leaves things out
 * is not a backup. Sync defaults to the RECORD — prayers, fasting, dhikr,
 * sunnah, Quran — and leaves settings and location off, because those two
 * describe a device rather than a person. Nobody wants the adhan volume
 * they set on a tablet at home pushed onto the phone in their pocket, and
 * coordinates are the one category where being wrong is worse than being
 * absent. Both are one toggle away for anyone who does want them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  coerceSelection,
  SYNC_CATEGORIES,
  type SyncSelection,
} from './snapshot';

const SYNC_SETTINGS_KEY = 'prayerapp.sync.settings.v1';

/** How this device gets back to the folder the user chose. */
export type FolderHandle = {
  /**
   * Android: the tree URI, `content://…`. iOS: base64 bookmark data.
   * Opaque here on purpose — only the native module interprets it.
   */
  handle: string;
  /** What to show the user. Best effort; providers vary. */
  label: string;
};

export type SyncSettings = {
  folder: FolderHandle | null;
  selection: SyncSelection;
  /** Run a round when the app comes to the foreground. */
  autoOnOpen: boolean;
  lastSyncAt: string | null;
  /** Set when the last round failed, so the screen can say what happened. */
  lastError: string | null;
};

/** The record, not the device. See the note at the top of this file. */
export function defaultSyncSelection(): SyncSelection {
  return {
    prayers: true,
    fasting: true,
    dhikr: true,
    sunnah: true,
    quran: true,
    settings: false,
    location: false,
  };
}

export function defaultSyncSettings(): SyncSettings {
  return {
    folder: null,
    selection: defaultSyncSelection(),
    autoOnOpen: true,
    lastSyncAt: null,
    lastError: null,
  };
}

function coerceFolder(value: unknown): FolderHandle | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.handle !== 'string' || !r.handle) return null;
  return {
    handle: r.handle,
    label: typeof r.label === 'string' && r.label ? r.label : r.handle,
  };
}

export function coerceSyncSettings(value: unknown): SyncSettings {
  const base = defaultSyncSettings();
  if (!value || typeof value !== 'object') return base;
  const r = value as Record<string, unknown>;
  return {
    folder: coerceFolder(r.folder),
    // A stored selection missing a category gets the default for it rather
    // than false: a category added in a later version should start syncing
    // for people who already had sync on, not stay silently off forever.
    selection: r.selection
      ? mergeSelection(base.selection, coerceSelection(r.selection), r.selection)
      : base.selection,
    autoOnOpen: typeof r.autoOnOpen === 'boolean' ? r.autoOnOpen : true,
    lastSyncAt: typeof r.lastSyncAt === 'string' ? r.lastSyncAt : null,
    lastError: typeof r.lastError === 'string' ? r.lastError : null,
  };
}

/**
 * Take the stored value for categories the stored object actually mentions,
 * and the default for the rest.
 *
 * `coerceSelection` fills every field, so on its own it cannot tell "the
 * user turned settings off" from "this build did not exist when they chose".
 * The raw object can.
 */
function mergeSelection(
  defaults: SyncSelection,
  coerced: SyncSelection,
  raw: unknown,
): SyncSelection {
  const mentioned = raw && typeof raw === 'object' ? (raw as object) : {};
  const out = { ...defaults };
  for (const category of SYNC_CATEGORIES) {
    if (Object.prototype.hasOwnProperty.call(mentioned, category)) {
      out[category] = coerced[category];
    }
  }
  return out;
}

let cached: Promise<SyncSettings> | null = null;

export function getSyncSettings(): Promise<SyncSettings> {
  if (!cached) cached = read();
  return cached;
}

async function read(): Promise<SyncSettings> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_SETTINGS_KEY);
    return coerceSyncSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultSyncSettings();
  }
}

/**
 * Change some fields and persist the whole thing.
 *
 * Returns what is now stored, so a caller can put it straight into state
 * without a second read.
 */
export async function updateSyncSettings(
  patch: Partial<SyncSettings>,
): Promise<SyncSettings> {
  const next = { ...(await getSyncSettings()), ...patch };
  cached = Promise.resolve(next);
  try {
    await AsyncStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // The setting holds for this run and is lost on the next launch. Worth
    // less than failing the action the user just took — and unlike the peer
    // list, nothing here is a record of anything.
  }
  return next;
}

/** For tests. */
export function forgetCachedSyncSettings(): void {
  cached = null;
}
