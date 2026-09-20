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
 * IT USED TO COST EVERY DELETION. "Nothing is ever deleted" stood here for
 * a year, and it was a real trade at the time: the alternative is tombstones
 * and a rule for whose removal wins, and the failure mode of getting THAT
 * wrong is a month of someone's prayers disappearing. A resurrected bookmark
 * is an annoyance; a deleted record is the product failing at the only thing
 * it is for.
 *
 * What changed is that the annoyance turned out to have teeth. A khatmah pin
 * that came back did not just reappear — it dragged the plan's own "continue
 * here" back to a page the reader had finished with (`positionAt`), and an
 * un-marked page came back every round for ninety days. So removals travel
 * now, and they are the same shape everywhere: a REMOVAL IS A DATED FACT,
 * and it only ever buries a row older than itself. That keeps the three
 * properties above — a date is a max like any other — and it keeps the old
 * fear at arm's length, because no rule here can remove a record that was
 * written after the removal was made. Every tombstone is pruned at ninety
 * days, by which time it has reached every device or the device is gone.
 * docs/sync-conflict-rules.md has the inventory and the two places left
 * without one, with the reasons.
 *
 * ONE DELIBERATE ASYMMETRY. The khatmah's day baseline — `dayStartDate` and
 * the two numbers beside it — is not synced state at all: it answers "how
 * much has happened since MY day began", on this device's clock and this
 * device's calendar day. It is kept from the LOCAL side, so merging is not
 * symmetric in those three fields on purpose. Everything that travels is
 * still commutative.
 */
import type { JournalEntry } from '../journal/journal';
import type { FastEntry } from '../fasting/fasting';
import type { SunnahDay, SunnahLog } from '../journal/sunnah';
import type { DhikrLog } from '../practice/practiceStore';
import {
  applyMarks,
  contiguousFrom,
  mergeMarks,
  unionRanges,
} from '../quran/khatmahDone';
import {
  ayahsThroughPage,
  khatmahDone,
  khatmahStartAyah,
  mergeRemovals,
  pagesThroughAyahs,
  removedAfter,
  KHATMAH_TOTAL_AYAHS as TOTAL_AYAHS,
  type KhatmahPlan,
  type QuranState,
  type QuranBookmark,
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
    // Same breath: a deletion is the stronger claim — it is the one the
    // absence could never express (`FastEntry.cleared`) — and between two
    // live rows the completed one still wins, as it always has.
    else if (ta === tb && e.cleared === true && mine.cleared !== true) {
      byKey.set(key(e), e);
    } else if (
      ta === tb &&
      e.cleared !== true &&
      mine.cleared !== true &&
      e.completed &&
      !mine.completed
    ) {
      byKey.set(key(e), e);
    }
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
/**
 * Which pin survives a merge — see the note inside `mergeKhatmah`.
 *
 * Undefined is not a value here: the caller only writes the key when one
 * of the two sides carried it, so "no pin" comes back as null.
 */
function pickPin(a: KhatmahPlan, b: KhatmahPlan): KhatmahPlan['position'] {
  const sa = a.positionAt ?? 0;
  const sb = b.positionAt ?? 0;
  if (sa !== sb) return (sa > sb ? a.position : b.position) ?? null;
  /**
   * NEITHER SIDE DATED — two plans from before `positionAt`, where a
   * missing pin cannot be told from a pin nobody ever made. The old rule
   * is the only honest one here: keep the pin, because "removal wins"
   * would throw away every pin an un-updated device makes.
   */
  if (sa === 0) {
    return ((b.position?.page ?? -1) > (a.position?.page ?? -1)
      ? b.position
      : a.position) ?? null;
  }
  // Both dated, in the same millisecond: a removal is the stronger claim,
  // and two live pins are ordered by how far through the book they sit.
  // Decided identically on both devices, which a "keep local" tie is not.
  if (!a.position || !b.position) return null;
  return b.position.page > a.position.page ? b.position : a.position;
}

/**
 * Which date a plan is due by — see the note inside `mergeKhatmah`.
 *
 * Decided the same way on both devices, including the ties: taking the
 * deadline OFF is the stronger claim in the same breath (it is the one an
 * absence could never make), and between two live dates the later one
 * wins, because a merge that shortened someone's deadline behind their
 * back would be asking for reading they never agreed to.
 */
function pickDeadline(a: KhatmahPlan, b: KhatmahPlan): string | undefined {
  const sa = a.deadlineAt ?? 0;
  const sb = b.deadlineAt ?? 0;
  if (sa !== sb) return (sa > sb ? a : b).deadline;
  if (sa > 0 && (!a.deadline || !b.deadline)) return undefined;
  if (!a.deadline || !b.deadline) return a.deadline ?? b.deadline;
  return a.deadline >= b.deadline ? a.deadline : b.deadline;
}

/** Today's cut, when the two devices hold different ones — see the note. */
function pickPace(a: KhatmahPlan, b: KhatmahPlan): KhatmahPlan['pace'] {
  if (!a.pace || !b.pace) return a.pace ?? b.pace;
  if (a.pace.day !== b.pace.day) return a.pace.day > b.pace.day ? a.pace : b.pace;
  if (a.pace.from !== b.pace.from) {
    return a.pace.from < b.pace.from ? a.pace : b.pace;
  }
  return a.pace.to <= b.pace.to ? a.pace : b.pace;
}

/** The per-device day baseline, copied only when the device has one. */
function dayStateOf(
  plan: KhatmahPlan,
): Pick<KhatmahPlan, 'dayStartDate' | 'dayStartPagesRead' | 'dayStartAyahsRead'> {
  return {
    ...(plan.dayStartDate !== undefined ? { dayStartDate: plan.dayStartDate } : {}),
    ...(plan.dayStartPagesRead !== undefined
      ? { dayStartPagesRead: plan.dayStartPagesRead }
      : {}),
    ...(plan.dayStartAyahsRead !== undefined
      ? { dayStartAyahsRead: plan.dayStartAyahsRead }
      : {}),
  };
}

/**
 * The plan without its day baseline — so that putting THIS device's back
 * is a decision and not a coincidence of spread order. Absent here has to
 * survive as absent: a device with no baseline must not inherit one from
 * a peer whose day began somewhere else.
 */
function withoutDayState(plan: KhatmahPlan): KhatmahPlan {
  const rest = { ...plan };
  delete rest.dayStartDate;
  delete rest.dayStartPagesRead;
  delete rest.dayStartAyahsRead;
  return rest;
}

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
    const hasSet = mine.done != null || p.done != null;
    const maxAyahsRead =
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
    // ABANDONMENT WINS, and it is why this field exists. A plan deleted
    // on one device used to be simply absent from its snapshot, which is
    // indistinguishable from a plan the OTHER device had just made — so
    // the union put it straight back and the delete undid itself on the
    // next round. The tombstone travels instead, and one side carrying it
    // is enough: earliest date if both do, so the merge stays commutative
    // and merging a snapshot with itself still returns itself.
    /**
     * WHICH PAGES, UNIONED. Two devices that each read part of the book
     * have both read those parts, so neither side can lose a range — and
     * union is commutative and idempotent, which is what keeps merging
     * order-free and a snapshot merged with itself equal to itself. The
     * high-water fields below still take the max, for a device that has
     * not been updated yet and reads only those.
     */
    /**
     * BOTH DEVICES' READING, THEN BOTH DEVICES' CLAIMS, IN TIME ORDER.
     *
     * The union is what lets two devices reading different parts keep
     * both. It is also why it alone cannot carry an un-mark: a union only
     * grows, so a page removed here came back from there, every round —
     * the same shape as the khatmah delete that resurrected itself. The
     * dated claims are merged like everything else and replayed over the
     * union, so the last thing the reader actually said about a page is
     * what it says, whichever device they said it on. See `AyahMark`.
     */
    const marks = mergeMarks(mine.marks, p.marks);
    const doneRanges = applyMarks(
      unionRanges(khatmahDone(mine), khatmahDone(p), TOTAL_AYAHS),
      marks,
      TOTAL_AYAHS,
    );
    /**
     * THE MIRROR FOLLOWS THE SET, once there is one. Taking the max of the
     * two mirrors was right while the mirrors were the whole story; with
     * a set that can carry a hole, the max can point past one — the other
     * device's number, over a page this device just un-marked — and an
     * older build reading only the mirror is told about pages nobody
     * read. The contiguous run of the merged set is what both writers
     * store locally, so it is also what keeps a snapshot merged with
     * itself equal to itself.
     */
    const contiguous = hasSet
      ? Math.max(
          0,
          contiguousFrom(doneRanges, khatmahStartAyah(mine), TOTAL_AYAHS),
        )
      : undefined;
    const ayahsRead = contiguous ?? maxAyahsRead;
    const pagesReadOut = contiguous !== undefined ? pagesThroughAyahs(contiguous) : pagesRead;
    const abandonedAt =
      mine.abandonedAt != null && p.abandonedAt != null
        ? Math.min(mine.abandonedAt, p.abandonedAt)
        : (mine.abandonedAt ?? p.abandonedAt);
    /**
     * THE PIN IS WHOEVER SPOKE LAST, because taking one off is speaking.
     *
     * It used to be "the further-through page wins", which reads as a
     * rule about progress and is really a rule that cannot say NO. A pin
     * the reader cleared is a `null` with no page in it, so the other
     * device's pin beat it every round; and since `khatmahCurrentPage`
     * answers with the pinned page while a pin is set, a plan read well
     * past its pin was dragged back to it and "Continue khatmah" kept
     * opening ground the reader had finished with. Reading past a pin
     * spends it, so this arrived without anyone touching anything — the
     * two halves of the report of 2026-09-20, one cause.
     *
     * `positionAt` dates both halves of the act (see `KhatmahPlan`), and
     * a dated claim beats an undated one: only a dated side can say "no
     * pin", and a device old enough to send none converges as soon as it
     * is updated. Equal stamps are not a tie to keep locally — that
     * would make the merge depend on which device ran it — so they are
     * decided the same way on both: a removal beats a pin, and between
     * two pins the further-through one wins, which is the old rule doing
     * the only job it was ever right for.
     */
    /**
     * THE DEADLINE IS A CLAIM WITH A DATE ON IT (issue #53).
     *
     * Unlike `targetDays`, which is set once and can therefore be settled
     * with a max, a deadline is MOVED — that is the whole answer to a
     * plan that has fallen behind, and taking it off again turns the plan
     * back into a duration. Neither of those can be said by a value that
     * is merely absent, so the field travels with `deadlineAt` beside it
     * and the newest word wins, exactly as the pin does.
     */
    const deadlineStamp = Math.max(mine.deadlineAt ?? 0, p.deadlineAt ?? 0);
    const deadline = pickDeadline(mine, p);
    /**
     * AND THE DAY'S CUT TRAVELS WITH IT, atomically.
     *
     * Two devices opening the same day must show the same quota, which is
     * the reason this is stored at all rather than derived from the
     * per-device day baseline (`khatmahPace.ts`). Later day wins — it is
     * a fact about a day, and the newer day is the one in hand. Within
     * one day the EARLIEST opening wins, by its `from`: the first device
     * to look pinned the cut, and the second must not re-cut it against
     * reading that has happened since, or the day would shrink as it was
     * read. Ties go to the shorter `to` for no reason but determinism.
     */
    const pace = pickPace(mine, p);
    const pinStamp = Math.max(mine.positionAt ?? 0, p.positionAt ?? 0);
    const position = pickPin(mine, p);
    const hadPin = 'position' in mine || 'position' in p;
    const merged: KhatmahPlan = {
      ...withoutDayState(mine),
      ...withoutDayState(p),
      startedAt: Math.min(mine.startedAt, p.startedAt),
      pagesRead: pagesReadOut,
      ...(ayahsRead !== undefined ? { ayahsRead } : {}),
      completedAt,
      // Spread conditionally: writing `abandonedAt: undefined` onto a pair
      // that has none adds a key neither input had, and merging a snapshot
      // with itself would stop returning itself.
      ...(abandonedAt != null ? { abandonedAt } : {}),
      // Only when one of them actually carried a set, or a pair that had
      // none would come out with a key neither input had.
      ...(mine.done || p.done ? { done: doneRanges } : {}),
      // Same rule: a pair that never claimed anything must not gain a key.
      ...(marks.length > 0 ? { marks } : {}),
      // Only when one of them actually carried the key. A pair that
      // never pinned anything must not come out of the merge with a
      // pin-shaped null on it, or a snapshot merged with itself stops
      // equalling itself.
      ...(hadPin ? { position } : {}),
      ...(pinStamp > 0 ? { positionAt: pinStamp } : {}),
      // Present only when one of them had it — a pair of duration plans
      // must not come out of the merge carrying deadline-shaped keys.
      ...(deadline ? { deadline } : {}),
      ...(deadlineStamp > 0 ? { deadlineAt: deadlineStamp } : {}),
      ...(pace && deadline ? { pace } : {}),
      /**
       * THE DAY'S BASELINE IS THIS DEVICE'S, always — see the long note
       * on `dayStateOf`. It is not synced state: it answers "how much has
       * happened since MY day began", on this device's clock.
       */
      ...dayStateOf(mine),
      /**
       * Set once, when the plan is made, and never edited — so the two
       * sides agree and this only has to be DECIDED, not resolved. Max
       * and min respectively, because a rule that reads the same on both
       * devices is the whole requirement: a plan cannot come out of a
       * merge one length here and another there.
       */
      targetDays: Math.max(mine.targetDays, p.targetDays),
      ...(mine.fromPage != null || p.fromPage != null
        ? { fromPage: Math.min(mine.fromPage ?? 0, p.fromPage ?? 0) }
        : {}),
    };
    /**
     * A DEADLINE TAKEN OFF IS AN ABSENT KEY, and absent is exactly what
     * the spread above puts back: the other device still carries the date
     * it was given, so the plan would come back paced by a calendar the
     * reader had opted out of. Written as a delete rather than as a
     * `deadline: undefined`, because a key holding undefined is not the
     * same shape on the wire and would stop a plan round-tripping.
     */
    if (!deadline) {
      delete merged.deadline;
      delete merged.pace;
    }
    byId.set(p.id, merged);
      /**
       * THE DAY'S BASELINE IS THIS DEVICE'S, always.
       *
       * `dayStartDate` and the two numbers beside it answer "how much of
       * this has happened since MY day began" — a local clock, a local
       * calendar day, and a snapshot taken when this device first looked
       * today. The spread above handed all three to whichever side was
       * incoming, so a phone that had not been opened since last week
       * reset the Mac's "today" to last week's baseline and today's
       * reading appeared to jump; merging the other way round gave the
       * other answer, which is the same bug wearing its other face — the
       * merge was not commutative in these fields at all.
       *
       * They are not synced state. They stay whatever this device said,
       * including staying ABSENT if it had none, and `withDaySnapshot`
       * re-takes them on the next local write anyway.
       */
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
 * configuration neither user chose.
 *
 * They have their own timestamp now. They used to ride on
 * `lastRead.updatedAt`, the only one this store kept, which tied a
 * settings change to whether that device had also read: change a
 * preference on the Mac, read on the phone, and the Mac's choice was
 * dropped on the next sync without a word. `prefsUpdatedAt` is written
 * by `setQuranPrefs` and by nothing else.
 */
export function mergeQuran(local: QuranState, incoming: QuranState): QuranState {
  // NEWEST COPY WINS, by id. It used to be first copy wins — the local one
  // kept, the incoming one dropped — which was correct while a bookmark
  // could not change after it was made. A following bookmark can: it
  // moves as it is read from, and with the old rule it moved on one
  // device and never on the other, silently. `updatedAt` is written on
  // every change; a bookmark from before it existed has never changed,
  // so `createdAt` is its truthful stand-in. Ties keep the local copy,
  // so merging a snapshot with itself still returns itself.
  const stamp = (b: QuranBookmark) => b.updatedAt ?? b.createdAt;
  const bookmarks = new Map(local.bookmarks.map(b => [b.id, b]));
  for (const b of incoming.bookmarks) {
    const mine = bookmarks.get(b.id);
    if (!mine || stamp(b) > stamp(mine)) bookmarks.set(b.id, b);
  }
  /**
   * AND THEN THE REMOVALS, which the union above cannot express.
   *
   * A bookmark deleted on one device was simply absent from its
   * snapshot, and absence is exactly what a union ignores: the other
   * device still carried the row, so the delete undid itself on the next
   * round — the khatmah-plan bug, the removed-peer bug and the cleared
   * sunnah day, one more time (reported 2026-09-20). The removals travel
   * as dated facts and are applied after the union, so the last thing
   * the reader did about a bookmark is what holds.
   *
   * `>=` on the stamp, not `>`: a removal is written a millisecond past
   * the copy it buries (`removeBookmark`), and a bookmark that is NOT
   * older than its removal is a re-make, which survives.
   */
  const bookmarksRemoved = mergeRemovals(
    local.bookmarksRemoved,
    incoming.bookmarksRemoved,
  );
  const liveBookmarks = [...bookmarks.values()].filter(
    b => !removedAfter(bookmarksRemoved, b.id, stamp(b)),
  );

  // Stars: the same union with the same blind spot, and the same answer.
  // A star carries its own date now (`starsAt`), so an ayah starred again
  // after being un-starred elsewhere keeps the newer claim.
  const starsRemoved = mergeRemovals(local.starsRemoved, incoming.starsRemoved);
  const starsAt: Record<string, number> = { ...(local.starsAt ?? {}) };
  for (const [k, at] of Object.entries(incoming.starsAt ?? {})) {
    if (!(starsAt[k] >= at)) starsAt[k] = at;
  }
  const starred = [...new Set([...local.starred, ...incoming.starred])]
    .filter(k => !removedAfter(starsRemoved, k, starsAt[k] ?? 0))
    .sort();
  for (const k of Object.keys(starsAt)) {
    if (!starred.includes(k)) delete starsAt[k];
  }

  const mineAt = local.lastRead?.updatedAt ?? 0;
  const theirsAt = incoming.lastRead?.updatedAt ?? 0;
  const theirsIsNewer = theirsAt > mineAt;

  /**
   * Its own question, its own answer — falling back to the reading stamp
   * for a side that has none.
   *
   * A snapshot written before `prefsUpdatedAt` existed, or exported by an
   * older build, carries no preference time at all. Reading 0 for it
   * would make an import of such a snapshot bring nothing: the receiving
   * device is also at 0, the tie keeps local, and the imported reciter,
   * tafsir and reading choices are silently dropped. So an unstamped
   * side is judged the way it always was, by `lastRead.updatedAt`, and a
   * stamped one by the stamp. Both are wall-clock milliseconds.
   *
   * Ties keep the local copy, like every other tie here, so merging a
   * snapshot with itself returns it.
   */
  const prefsStamp = (s: QuranState) =>
    s.prefsUpdatedAt && s.prefsUpdatedAt > 0
      ? s.prefsUpdatedAt
      : (s.lastRead?.updatedAt ?? 0);
  const minePrefsAt = prefsStamp(local);
  const theirPrefsAt = prefsStamp(incoming);
  const theirPrefsAreNewer = theirPrefsAt > minePrefsAt;

  return {
    version: 1,
    lastRead: theirsIsNewer ? incoming.lastRead : local.lastRead,
    bookmarks: liveBookmarks.sort((a, b) => a.createdAt - b.createdAt),
    starred,
    // Present only when there is something to say, so two blobs that
    // never removed anything merge to one that has no such key either.
    ...(bookmarksRemoved.length > 0 ? { bookmarksRemoved } : {}),
    ...(starsRemoved.length > 0 ? { starsRemoved } : {}),
    ...(Object.keys(starsAt).length > 0 ? { starsAt } : {}),
    khatmah: mergeKhatmah(local.khatmah, incoming.khatmah),
    prefs: theirPrefsAreNewer ? incoming.prefs : local.prefs,
    // The stamp travels with the choice, or the loser's own next sync
    // would look newer than the winner it just accepted. Left out when
    // neither side ever had one, so two old snapshots merge to an old
    // snapshot rather than gaining a field.
    ...(Math.max(local.prefsUpdatedAt ?? 0, incoming.prefsUpdatedAt ?? 0) > 0
      ? {
          prefsUpdatedAt: Math.max(
            local.prefsUpdatedAt ?? 0,
            incoming.prefsUpdatedAt ?? 0,
          ),
        }
      : {}),
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
