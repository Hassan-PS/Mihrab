/**
 * How two devices' records become one.
 *
 * Every rule here is a union, a max, or a newest-wins on a timestamp the
 * writer had already stored before any of this existed. That is not a style
 * choice — it is what buys the three properties a serverless peer-to-peer
 * cycle needs:
 *
 *   COMMUTATIVE   merge(a,b) == merge(b,a)   — no "primary" device
 *   IDEMPOTENT    merge(a,a) == a            — re-import, re-sync, no drift
 *   ASSOCIATIVE   order of pairings is free  — A→B→C == A→C→B
 *
 * Get those and phones can sync in any order, over any transport, as often
 * as they like, with no coordination and no agreement about whose clock is
 * right. Lose any one of them and you need a server to arbitrate, which this
 * app does not have and should not want.
 *
 * THE COST IS THAT NOTHING IS EVER DELETED. A bookmark removed on one phone
 * comes back from the other. That is a deliberate trade: the alternative is
 * tombstones and a rule for whose deletion wins, and the failure mode of
 * getting that wrong is a month of someone's prayers disappearing. A
 * resurrected bookmark is an annoyance; a deleted record is the product
 * failing at the only thing it is for.
 */
import type { JournalEntry } from '../journal/journal';
import type { FastEntry } from '../fasting/fasting';
import type { SunnahDay, SunnahLog } from '../journal/sunnah';
import type { DhikrLog } from '../practice/practiceStore';
import {
  ayahsThroughPage,
  type KhatmahPlan,
  type QuranState,
} from '../quran/quranState';
import { DEFAULT_RIWAYAH } from '../quran/riwayat';
import type { Snapshot, SnapshotData, SyncSelection } from './snapshot';

/** Epoch ms from an ISO string, or 0 when it is missing or nonsense. */
function at(iso: unknown): number {
  if (typeof iso !== 'string') return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Prayers: one entry per (date, prayer), the one written most recently wins.
 *
 * `loggedAt` is stamped by whoever wrote the entry, so this is a real answer
 * to "which of these two is the correction" rather than a guess from
 * whichever device happened to send last. A tie keeps the local one, which
 * makes the function idempotent against itself.
 */
export function mergeJournal(
  local: JournalEntry[],
  incoming: JournalEntry[],
): JournalEntry[] {
  const byKey = new Map<string, JournalEntry>();
  for (const e of local) byKey.set(`${e.date}|${e.prayer}`, e);
  for (const e of incoming) {
    const key = `${e.date}|${e.prayer}`;
    const mine = byKey.get(key);
    if (!mine || at(e.loggedAt) > at(mine.loggedAt)) byKey.set(key, e);
  }
  return [...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.prayer.localeCompare(b.prayer),
  );
}

/**
 * Fasting: one entry per (date, type). Newest `loggedAt` wins where the
 * entry carries one; otherwise "completed beats not completed", because the
 * only way a fast entry exists at all is that someone recorded something.
 */
export function mergeFasting(
  local: FastEntry[],
  incoming: FastEntry[],
): FastEntry[] {
  const byKey = new Map<string, FastEntry>();
  const key = (e: FastEntry) => `${e.date}|${e.type}`;
  for (const e of local) byKey.set(key(e), e);
  for (const e of incoming) {
    const mine = byKey.get(key(e));
    if (!mine) {
      byKey.set(key(e), e);
      continue;
    }
    const ta = at((e as { loggedAt?: string }).loggedAt);
    const tb = at((mine as { loggedAt?: string }).loggedAt);
    if (ta > tb) byKey.set(key(e), e);
    else if (ta === tb && e.completed && !mine.completed) byKey.set(key(e), e);
  }
  return [...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type),
  );
}

/**
 * Dhikr: completed sets per day, so the higher count is the fuller record.
 *
 * Max rather than sum. Summing would double every day that had already been
 * synced once, which is exactly the idempotence this whole file is built
 * around — and a phone that recorded 3 sets and one that recorded 5 is one
 * person who did 5, not 8.
 */
export function mergeDhikr(local: DhikrLog, incoming: DhikrLog): DhikrLog {
  const out: DhikrLog = { ...local };
  for (const [day, n] of Object.entries(incoming)) {
    out[day] = Math.max(out[day] ?? 0, n);
  }
  return out;
}

/**
 * Sunnah: the newer record of a day wins — including a cleared one.
 *
 * This used to be `Math.max` per field, which cannot express an un-log. A
 * user who cleared Fajr's sunnah got it back on the next foreground: their
 * removal reached this function as an ABSENCE, absence read as "no opinion",
 * and the peer's stale count won. The peer never learned of the removal
 * either, so it kept re-asserting it for ever. Reported 2026-08-26.
 *
 * A day now carries `at`, and an emptied day is kept as a tombstone rather
 * than deleted, so "cleared at 14:31" is a fact that can beat "two rak'ah,
 * recorded at 14:02".
 *
 * When only ONE side is timestamped the old rule still applies. That side is
 * not necessarily newer — it is only necessarily running a newer build — and
 * guessing in favour of it would let an old peer's silence delete a day it
 * never meant to touch. Max is wrong for deletions and right for everything
 * else, which is the correct trade while old builds are still out there.
 */
export function mergeSunnah(local: SunnahLog, incoming: SunnahLog): SunnahLog {
  const out: SunnahLog = { ...local };
  for (const [day, theirs] of Object.entries(incoming)) {
    const mine = out[day];
    if (!mine) {
      out[day] = theirs;
      continue;
    }
    if (typeof mine.at === 'number' && typeof theirs.at === 'number') {
      // Both sides can date their record: the newer one is the truth,
      // wholesale. Taken as a whole day rather than field by field, because
      // a cleared day is all-zero and merging it field-wise against an older
      // day would just resurrect it one field at a time.
      out[day] = theirs.at > mine.at ? theirs : mine;
      continue;
    }
    const merged: SunnahDay = {
      fajr: Math.max(mine.fajr, theirs.fajr),
      dhuhr: Math.max(mine.dhuhr, theirs.dhuhr),
      maghrib: Math.max(mine.maghrib, theirs.maghrib),
      isha: Math.max(mine.isha, theirs.isha),
      witr: mine.witr || theirs.witr,
      qiyam: Math.max(mine.qiyam, theirs.qiyam),
      // Keep whichever stamp exists so the day can take part in dated
      // merges from here on, instead of being stuck on the old rule.
      ...(mine.at !== undefined || theirs.at !== undefined
        ? { at: Math.max(mine.at ?? 0, theirs.at ?? 0) }
        : {}),
    };
    out[day] = merged;
  }
  return out;
}

/**
 * Khatmah plans: one per id, and progress only ever moves forward.
 *
 * `pagesRead` is a high-water mark, so max is both the honest answer and a
 * commutative one. A plan finished on either device is finished on both, and
 * the earlier completion timestamp is kept — that is when it actually
 * happened, whichever phone noticed first.
 */
export function mergeKhatmah(
  local: KhatmahPlan[],
  incoming: KhatmahPlan[],
): KhatmahPlan[] {
  const byId = new Map<string, KhatmahPlan>();
  for (const p of local) byId.set(p.id, p);
  for (const p of incoming) {
    const mine = byId.get(p.id);
    if (!mine) {
      byId.set(p.id, p);
      continue;
    }
    const pagesRead = Math.max(mine.pagesRead, p.pagesRead);
    // Ayahs are the authoritative measure and merge the same way — a
    // high-water mark, so max is both honest and commutative. A device
    // still on an older version sends no `ayahsRead`; taking the max with
    // what its `pagesRead` implies keeps its progress rather than letting
    // a silent undefined win.
    // Only when at least one side actually carries it. Deriving a value
    // for a pair that has none would add a field to the output that was
    // not in either input, and merging a snapshot with ITSELF would stop
    // returning itself — the idempotence the whole P2P cycle rests on.
    const ayahsRead =
      mine.ayahsRead === undefined && p.ayahsRead === undefined
        ? undefined
        : Math.max(
            mine.ayahsRead ?? ayahsThroughPage(mine.pagesRead, DEFAULT_RIWAYAH),
            p.ayahsRead ?? ayahsThroughPage(p.pagesRead, DEFAULT_RIWAYAH),
          );
    const completedAt =
      mine.completedAt != null && p.completedAt != null
        ? Math.min(mine.completedAt, p.completedAt)
        : (mine.completedAt ?? p.completedAt);
    // The pinned position is a "where I am", so the further-through one is
    // the later one; ties keep whichever the local device already had.
    const position =
      (p.position?.page ?? -1) > (mine.position?.page ?? -1)
        ? p.position
        : mine.position;
    byId.set(p.id, {
      ...mine,
      ...p,
      startedAt: Math.min(mine.startedAt, p.startedAt),
      pagesRead,
      ...(ayahsRead !== undefined ? { ayahsRead } : {}),
      completedAt,
      ...(position !== undefined ? { position } : {}),
    });
  }
  return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Quran state: bookmarks and stars unite, khatmah merges, last-read and the
 * reader preferences go to whoever wrote most recently.
 *
 * `prefs` is taken whole rather than field-by-field. They are one coherent
 * choice about how to read — renderer, reciter, repeat counts, tafsir
 * edition — and a half-and-half blend of two devices' preferences is a
 * configuration neither user chose. `lastRead.updatedAt` is the only
 * timestamp the Quran store keeps, so it doubles as the tiebreak.
 */
export function mergeQuran(local: QuranState, incoming: QuranState): QuranState {
  const bookmarks = new Map(local.bookmarks.map(b => [b.id, b]));
  for (const b of incoming.bookmarks) if (!bookmarks.has(b.id)) bookmarks.set(b.id, b);

  const starred = [...new Set([...local.starred, ...incoming.starred])].sort();

  const mineAt = local.lastRead?.updatedAt ?? 0;
  const theirsAt = incoming.lastRead?.updatedAt ?? 0;
  const theirsIsNewer = theirsAt > mineAt;

  return {
    version: 1,
    lastRead: theirsIsNewer ? incoming.lastRead : local.lastRead,
    bookmarks: [...bookmarks.values()].sort((a, b) => a.createdAt - b.createdAt),
    starred,
    khatmah: mergeKhatmah(local.khatmah, incoming.khatmah),
    prefs: theirsIsNewer ? incoming.prefs : local.prefs,
  };
}

/**
 * Settings and location presets: the incoming device's values win, field by
 * field, for the fields it actually carries.
 *
 * Settings have no timestamps anywhere, so there is nothing honest to
 * compare — and unlike the record, a preference is not a fact about the past
 * that can be lost. The user asked for these to come over; they come over.
 * Fields the snapshot does not mention are left exactly as they are, so a
 * snapshot from an older build cannot erase a setting it never knew about.
 */
export function mergeShallow(
  local: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return { ...local, ...incoming };
}

/**
 * Fold a snapshot into the local data, honouring BOTH what the snapshot
 * carries and what the user asked to accept.
 *
 * Two gates, not one: the sending device chose what to put in, and the
 * receiving device chooses what to take out. Either can say no.
 */
export function mergeData(
  local: SnapshotData,
  snapshot: Snapshot,
  accept: SyncSelection,
): SnapshotData {
  const d = snapshot.data;
  return {
    prayers:
      accept.prayers && d.prayers
        ? mergeJournal(local.prayers, d.prayers)
        : local.prayers,
    fasting:
      accept.fasting && d.fasting
        ? mergeFasting(local.fasting, d.fasting)
        : local.fasting,
    dhikr:
      accept.dhikr && d.dhikr ? mergeDhikr(local.dhikr, d.dhikr) : local.dhikr,
    sunnah:
      accept.sunnah && d.sunnah
        ? mergeSunnah(local.sunnah, d.sunnah)
        : local.sunnah,
    quran:
      accept.quran && d.quran ? mergeQuran(local.quran, d.quran) : local.quran,
    settings:
      accept.settings && d.settings
        ? mergeShallow(local.settings, d.settings)
        : local.settings,
    location:
      accept.location && d.location
        ? mergeShallow(local.location, d.location)
        : local.location,
  };
}

/** What a merge would change, for a confirmation screen that means it. */
export type MergeSummary = Record<
  'prayers' | 'fasting' | 'dhikr' | 'sunnah' | 'bookmarks' | 'khatmah',
  { before: number; after: number }
>;

export function summarise(
  before: SnapshotData,
  after: SnapshotData,
): MergeSummary {
  return {
    prayers: { before: before.prayers.length, after: after.prayers.length },
    fasting: { before: before.fasting.length, after: after.fasting.length },
    dhikr: {
      before: Object.keys(before.dhikr).length,
      after: Object.keys(after.dhikr).length,
    },
    sunnah: {
      before: Object.keys(before.sunnah).length,
      after: Object.keys(after.sunnah).length,
    },
    bookmarks: {
      before: before.quran.bookmarks.length,
      after: after.quran.bookmarks.length,
    },
    khatmah: {
      before: before.quran.khatmah.length,
      after: after.quran.khatmah.length,
    },
  };
}
