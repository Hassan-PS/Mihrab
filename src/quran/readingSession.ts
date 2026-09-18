/**
 * Whose reading this is — decided at the door, not by the page.
 *
 * A reader can keep several places in the book at once: a khatmah, a
 * surah read now and then, Al-Mulk every evening, a passage under
 * revision. The question every page turn has to answer is WHICH of them
 * just moved, and there are two ways to answer it.
 *
 * By position — the marker nearest the page claims the turn — is the
 * rule the khatmah already uses, and it works for the khatmah because
 * there is only one. With several following bookmarks it breaks in a way
 * that cannot be fixed: two of them a few pages apart, or one inside the
 * khatmah's pages, and the app has to guess. Sometimes it guesses wrong,
 * silently, about where somebody was — the worst failure a place-keeper
 * can have.
 *
 * By intent — whatever you OPENED owns the session — has no such
 * ambiguity, because you already said which reading this is by the door
 * you came in through. Open a following bookmark and it records the
 * turns; come in through the surah index and nothing does but the
 * ordinary marker, which is exactly what happened before any of this
 * existed. Overlap stops mattering: two bookmarks on one page are fine,
 * because you opened one of them.
 *
 * Position keeps one job, as a GUARD rather than the rule. Open the
 * revision bookmark in Al-Baqarah, then swipe fifty pages to look
 * something up in Al-Kahf, and the bookmark must not be dragged across
 * the book after you — `withinBookmarkReach` is what stops that. It does
 * not change whose visit it is: you opened that bookmark, it is still
 * where you come back to, and an excursion records nothing anywhere.
 * Handing such a turn to the marker is worse than recording nothing,
 * because the marker is the only record of a reading nobody bookmarked
 * and it would be overwritten by a glance.
 *
 * IN MEMORY ONLY. A session is a fact about this visit to the reader —
 * set when it opens, forgotten when it closes — so it is never stored
 * and never synced.
 *
 * THE KHATMAH IS A DOOR, NOT A RULE. Its crediting keeps deciding for
 * itself, first, however the reader was entered: read today's portion
 * having come in from the surah index and it counts, which is what the
 * reader asked for and what `khatmahTracksPage` does. What the khatmah
 * owner is for is the CHROME — the done-marks beside the surah name
 * belong to a khatmah reading and to nothing else. Opening Al-Fatiha
 * from the index, months into a plan, used to put a green check in the
 * header of a reading that had nothing to do with the khatmah.
 */
/**
 * THREE TRAILS, ONE BOOK, ONE NAME FOR EACH.
 *
 * `reading` is not a new mechanism: it is the name for what used to be
 * `null`, the visit nobody claimed, whose turns the reading marker takes
 * because nothing else did. Naming it is what lets the chrome say which
 * trail is recording — the marker was the one trail that never said so,
 * which made it the one that could overwrite your place in silence.
 */
export type ReadingOwner =
  | { kind: 'bookmark'; id: string }
  | { kind: 'khatmah' }
  | { kind: 'reading' };

/** What a visit belongs to when nothing claimed it. */
const MARKER: ReadingOwner = { kind: 'reading' };

let active = false;
let owner: ReadingOwner | null = null;

/**
 * Subscribers, because the chrome draws from this: the pulsing dot beside
 * the surah name is how a reader knows the visit is being tracked and by
 * which bookmark, now that a following bookmark no longer washes an ayah.
 * It used to land on the first ayah of every page it moved to, which read
 * as "you bookmarked this line" and was never what happened.
 */
const listeners = new Set<() => void>();

/**
 * Whether the owner's ayah is DRAWN on the page right now.
 *
 * Same distinction the reading marker has always made (`LastRead.pinned`):
 * a place put somewhere on purpose is drawn, because the reader wants to
 * find it again; a place that merely recorded a page turn is not. So the
 * bookmark's ayah is washed when the visit opens on it, and when the
 * reader bookmarks an ayah or scrubs to a page — all deliberate — and the
 * wash goes the moment reading carries it along, rather than reappearing
 * under the first line of every page turned to.
 */
let anchorVisible = false;

export type ReadingSessionState = {
  owner: ReadingOwner | null;
  /** The owner's ayah is drawn. False whenever there is no owner. */
  anchorVisible: boolean;
};

const EMPTY: ReadingSessionState = { owner: null, anchorVisible: false };

/** Stable while unchanged — `useSyncExternalStore` requires that. */
let snapshot: ReadingSessionState = EMPTY;

/** One string per owner, so identity is a comparison and not a switch. */
const keyOf = (o: ReadingOwner | null): string | null =>
  o == null ? null : o.kind === 'bookmark' ? `bookmark:${o.id}` : o.kind;

function refresh(): void {
  const o = active ? owner : null;
  const a = o ? anchorVisible : false;
  if (keyOf(o) !== keyOf(snapshot.owner) || a !== snapshot.anchorVisible) {
    snapshot = o ? { owner: o, anchorVisible: a } : EMPTY;
  }
  for (const l of [...listeners]) l();
}

export function subscribeReadingSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readingSessionSnapshot(): ReadingSessionState {
  return snapshot;
}

/** Reading carried the place along: stop drawing it. */
export function noteReadingMoved(): void {
  if (!anchorVisible) return;
  anchorVisible = false;
  refresh();
}

/** The place was put here on purpose: draw it. */
export function noteReadingPlaced(): void {
  if (anchorVisible) return;
  anchorVisible = true;
  refresh();
}

/**
 * The reader opened. `owner` is what was opened; null means the index or
 * any other door that claims nothing, and that visit is the MARKER's —
 * the same thing it always was, now with a name.
 */
export function beginReadingSession(o: ReadingOwner | null): void {
  active = true;
  owner = o ?? MARKER;
  // The visit opens ON the bookmark's ayah, so it is drawn — which is
  // also what makes closing and re-entering show it again. Only a
  // bookmark has an ayah to draw: the other two are trails, not marks.
  anchorVisible = o?.kind === 'bookmark';
  refresh();
}

/** The reader closed. Nothing about the visit outlives it. */
export function endReadingSession(): void {
  active = false;
  owner = null;
  anchorVisible = false;
  refresh();
}

/**
 * Hand the open session to a bookmark mid-visit: tapping one in the
 * reader's own index, or switching a bookmark to following while
 * standing on it. A no-op with no reader open — a toggle flipped from
 * the Qur'an tab's list is not a reading.
 */
export function claimReadingSession(o: ReadingOwner): void {
  if (!active) return;
  owner = o;
  anchorVisible = o.kind === 'bookmark';
  refresh();
}

/**
 * The owner has been read away from. The visit goes on as the marker's,
 * which is what `recordReading` does with the turns from here — and now
 * the dot changes colour to say so, at the moment it happens.
 */
export function releaseReadingOwner(): void {
  owner = MARKER;
  anchorVisible = false;
  refresh();
}

export function readingSessionOwner(): ReadingOwner | null {
  return active ? owner : null;
}

/** For tests. */
export function _resetReadingSession(): void {
  active = false;
  owner = null;
  anchorVisible = false;
  snapshot = EMPTY;
  listeners.clear();
}
