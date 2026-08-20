/**
 * Drain the Log Today widget's queue into the journal.
 *
 * The thin part: everything that decides anything lives in
 * `widgetLogQueue.ts` and is tested there. This wires it to the native
 * module and the real writer, and is careful about exactly one thing —
 * never throwing.
 *
 * WHERE THIS IS CALLED FROM, and why more than one place:
 *
 *   • App foreground. The common case; the user taps the widget, opens the
 *     app later, and the journal already agrees with what the widget showed.
 *
 *   • The notification background handler. Any notification interaction
 *     already spins the JS runtime headlessly, so draining there costs
 *     nothing and means the queue empties for someone who answers prayer
 *     notifications without opening the app for days.
 *
 * There is no third place and deliberately no timer: a queue that drains on
 * a schedule would need a background task whose only job is to move data
 * the user cannot see is stuck.
 */
import { Platform } from 'react-native';
import { getPrayerWidgetModule } from '../native/PrayerWidget';
import { logPrayerOnTime } from '../notifications/prayerLogAction';
import { drainWidgetLogQueue, type DrainResult } from './widgetLogQueue';

const EMPTY: DrainResult = { written: 0, skipped: 0, dropped: 0, failed: 0 };

export async function syncWidgetLogQueue(
  now: number = Date.now(),
): Promise<DrainResult> {
  // Both platforms queue, for the same reason: the journal is encrypted and
  // its one writer is here. Android's widget is a PendingIntent to a
  // receiver, iOS 17's is an AppIntent in the extension — and neither of
  // those processes can, or should, write the blob.
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return EMPTY;

  const mod = getPrayerWidgetModule();
  // `takeLogQueue` is absent on any build older than this one, which is the
  // normal state of affairs during a staged rollout rather than an error.
  if (!mod?.takeLogQueue) return EMPTY;

  try {
    const result = await drainWidgetLogQueue({
      take: async () => {
        const json = await mod.takeLogQueue!();
        if (!json) return [];
        return JSON.parse(json) as unknown;
      },
      write: logPrayerOnTime,
      now,
    });
    if (result.failed > 0) {
      console.warn(
        `syncWidgetLogQueue: ${result.failed} queued tap(s) could not be written`,
      );
    }
    return result;
  } catch (e) {
    // The queue has already been taken by the time anything in here can
    // fail, so there is nothing to retry and nothing to put back. Report and
    // carry on — the alternative is an unhandled rejection on app start.
    console.warn('syncWidgetLogQueue failed:', e);
    return EMPTY;
  }
}
