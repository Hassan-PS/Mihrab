/**
 * What to tell the user about a round of sync.
 *
 * The Sync screen and the header button both run a round and both have to
 * say how it went, and they had grown two copies of the same ladder of
 * conditions. One of them was wrong in a way the other was not, which is
 * the usual fate of duplicated logic — so the decision lives here, as a
 * pure function of the outcome and the peer list, and both screens render
 * whatever it returns.
 *
 * ── "SYNCED" IS A CLAIM, AND IT HAS TO BE EARNED ──────────────────────
 *
 * A round that opens a peer's file counts as `read: 1`, and both screens
 * used to call that success. But nothing in the shared folder is ever
 * deleted, so a peer's file is still there — still readable, still
 * mergeable — long after the thing that carries files between the two
 * devices has stopped. The round genuinely reads it, genuinely merges it,
 * and genuinely learns nothing, every two minutes, for ever.
 *
 * That is not a hypothetical. It is what a Nextcloud folder that quietly
 * stopped syncing looked like from inside the app on 2026-08-26: a Mac
 * reporting "Synced" all day against a snapshot the phone had written the
 * previous afternoon, while four prayers logged on the phone sat in a file
 * that never moved. The app had the evidence — the snapshot says when it
 * was built — and said nothing.
 *
 * So a peer's record now carries its own age (`Peer.dataAt`), and when
 * every dated peer's record is stale the round is reported as the nothing
 * it was, naming the device and the date so the user can tell "my tablet
 * has been in a drawer" from "the folder is broken" — which the app cannot
 * tell apart and should not pretend to.
 */
import { peerIsStale, type Peer } from './peers';
import type { SyncRunResult } from './runSync';

export type RoundReport = {
  /** i18n key for the dialog title. */
  title: string;
  /** i18n key for the body. */
  body: string;
  /** Interpolations the body key expects. */
  vars?: Record<string, string>;
};

/** How a date is written for the user. Injected so tests are not tied to
 *  the machine's locale. */
export type WhenFormatter = (iso: string) => string;

const defaultFormat: WhenFormatter = iso => new Date(iso).toLocaleString();

function failure(result: Extract<SyncRunResult, { ok: false }>): RoundReport {
  switch (result.reason) {
    case 'folder-gone':
      return { title: 'sync.syncFailedTitle', body: 'sync.errorFolderGone' };
    case 'no-folder':
      return { title: 'sync.syncFailedTitle', body: 'sync.folderHelp' };
    case 'unsupported':
    case 'no-identity':
      return { title: 'sync.syncFailedTitle', body: 'sync.errorUnsupported' };
    default:
      return {
        title: 'sync.syncFailedTitle',
        body: 'sync.syncFailedBody',
        vars: { detail: result.detail ?? '' },
      };
  }
}

type DatedPeer = Peer & { dataAt: string };

export function reportForRound(
  result: SyncRunResult,
  peers: Peer[],
  options: {
    now?: number;
    formatWhen?: WhenFormatter;
    /** What to call a device that has never sent a name. */
    unnamedDevice?: string;
  } = {},
): RoundReport {
  if (!result.ok) return failure(result);

  const now = options.now ?? Date.now();
  const format = options.formatWhen ?? defaultFormat;

  // Only peers that have ever told us when their record was built can be
  // judged stale. One paired by an older build has no `dataAt` and is not
  // evidence either way, so it neither triggers the warning nor suppresses
  // it — it simply does not vote.
  const dated = peers.filter((p): p is DatedPeer => typeof p.dataAt === 'string');
  if (dated.length > 0 && dated.every(p => peerIsStale(p, now))) {
    // Name the LEAST stale one. If even the best case is a day old, saying
    // so is the whole message; naming the worst would overstate it.
    const freshest = dated.reduce((best, p) =>
      Date.parse(p.dataAt) > Date.parse(best.dataAt) ? p : best,
    );
    return {
      title: 'sync.syncQuietTitle',
      body: 'sync.syncStale',
      vars: {
        device: freshest.name ?? options.unnamedDevice ?? 'Unnamed device',
        when: format(freshest.dataAt),
      },
    };
  }

  if (result.outcome.read > 0) {
    return { title: 'sync.syncDoneTitle', body: 'sync.syncDoneBody' };
  }

  // Nothing was opened at all. A paired device that has NEVER been seen
  // almost always means the two are looking at different folders — which is
  // invisible from either screen, so it has to be said.
  const neverAnyone = peers.length > 0 && peers.every(p => !p.lastSeenAt);
  return {
    title: 'sync.syncQuietTitle',
    body: neverAnyone ? 'sync.syncNothingArrived' : 'sync.syncNothing',
  };
}
