/**
 * The refresh glyph on a home-screen widget, as the user means it.
 *
 * It used to redraw the card from the payload already on disk. That is a
 * reasonable reading of "refresh" and not the one anybody has: a person
 * tapping it has noticed that what they are looking at is not what they
 * expect, and the most common reason for that — on a phone paired with
 * another device — is that the record on the other device has not arrived
 * yet. Redrawing the same stale bytes answers a question nobody asked.
 *
 * So the button now runs a real sync round first, then rebuilds the payload
 * so anything that arrived is on the card before it is drawn again. The
 * native side redraws immediately as well, so the tap still feels instant
 * and this catches up behind it.
 *
 * ── WHY THIS IS ALLOWED TO COST SOMETHING ─────────────────────────────
 *
 * 2.11.0 went to some trouble to stop the app doing work in the background
 * nobody asked for. This is the opposite case: a deliberate press, in front
 * of the user, on a control whose whole purpose is "go and check". It is
 * also the only way to sync from outside the app — auto-sync runs while the
 * app is open, and a widget is precisely what someone looks at instead of
 * opening the app.
 *
 * It still declines to do the expensive half when there is nothing to gain:
 * `syncIsReady()` is a cached read of the settings and the peer list, and
 * without a folder AND a paired device a round has nothing to write and
 * nowhere to write it.
 */
import { syncIsReady, runSyncNow } from '../sync/runSync';
import { republishWidgetPayload } from './republishWidgetPayload';

/**
 * Two presses in quick succession are one intent.
 *
 * The glyph is small and the card does not visibly change while a round is
 * in flight, so it gets tapped again — and a second round behind the first
 * reads the same folder for the same answer at twice the cost. Short enough
 * that a genuine "no, really, check again" a few seconds later still runs.
 */
export const WIDGET_SYNC_MIN_GAP_MS = 5_000;

let lastSyncAt = 0;
let running = false;

/** For tests. */
export function resetWidgetRefreshThrottle(): void {
  lastSyncAt = 0;
  running = false;
}

export type WidgetRefreshResult = {
  /** Whether a sync round actually ran. */
  synced: boolean;
  /** Whether the payload was rebuilt and pushed. */
  republished: boolean;
};

/**
 * Sync, then republish. Never throws: this is a HeadlessJS entry point, and
 * an unhandled rejection here is a crash in a process the user did not open.
 */
export async function widgetRefreshTask(): Promise<WidgetRefreshResult> {
  let synced = false;
  const now = Date.now();
  // Claimed synchronously, before the first await — two broadcasts can land
  // in the same tick and a guard set after an await lets both through.
  const canSync = !running && now - lastSyncAt >= WIDGET_SYNC_MIN_GAP_MS;
  if (canSync) running = true;

  try {
    if (canSync && (await syncIsReady())) {
      lastSyncAt = now;
      const result = await runSyncNow();
      synced = result.ok;
    }
  } catch {
    // A round that failed is already recorded, and the Sync screen says so.
    // The republish below is still worth doing — the card should show the
    // right day even when the folder is unreachable.
  } finally {
    if (canSync) running = false;
  }

  let republished = false;
  try {
    republished = await republishWidgetPayload('widget-refresh');
  } catch {
    // Leaves the previous payload in place, which is the honest fallback.
  }
  return { synced, republished };
}
