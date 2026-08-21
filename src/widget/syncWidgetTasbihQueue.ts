/**
 * Replay the Tasbih widget's queued taps into the counter.
 *
 * The thin part: everything that decides anything lives in
 * `widgetTasbihQueue.ts` and is tested there. This wires it to the native
 * module and the real store, and is careful about exactly one thing — never
 * throwing.
 *
 * Called from the same two places the log queue drains from: app foreground,
 * and the notification background handler. There is no timer, for the same
 * reason there is no timer there.
 */
import { Platform } from 'react-native';

import { getPrayerWidgetModule } from '../native/PrayerWidget';
import { recordDhikrSet } from '../practice/practiceStore';
import { adjacentPresetId, type TasbihPresetId } from '../tasbih/tasbih';
import {
  getTasbihState,
  hydrateTasbihState,
  incrementTasbih,
  resetTasbih,
  setActiveTasbih,
} from '../tasbih/tasbihStore';
import {
  drainWidgetTasbihQueue,
  type TasbihDrainResult,
} from './widgetTasbihQueue';

const EMPTY: TasbihDrainResult = { applied: 0, dropped: 0, failed: 0 };

export async function syncWidgetTasbihQueue(
  now: number = Date.now(),
): Promise<TasbihDrainResult> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return EMPTY;

  const mod = getPrayerWidgetModule();
  // Absent on any build older than the one that added it — the normal state
  // during a staged rollout rather than an error.
  if (!mod?.takeTasbihQueue) return EMPTY;

  try {
    // The store has to be readable before `next` can ask what follows the
    // current preset.
    await hydrateTasbihState();
    // Rounds finished on the widget, so they can be written to the practice
    // log after the drain — see below.
    let rounds = 0;
    const result = await drainWidgetTasbihQueue({
      take: async () => {
        const json = await mod.takeTasbihQueue!();
        if (!json) return [];
        return JSON.parse(json) as unknown;
      },
      increment: () => {
        const { reachedTarget } = incrementTasbih();
        if (reachedTarget) rounds += 1;
      },
      reset: () => {
        resetTasbih();
      },
      next: () => {
        const active = getTasbihState().activeId as TasbihPresetId;
        setActiveTasbih(adjacentPresetId(active, 'next'));
      },
      now,
    });
    if (result.failed > 0) {
      console.warn(
        `syncWidgetTasbihQueue: ${result.failed} queued tap(s) could not be applied`,
      );
    }
    // A round completed ON THE WIDGET is still a round completed.
    //
    // The screen writes one to the practice log the moment the target is
    // reached (TasbihScreen.onIncrement); the widget's taps replayed through
    // here did not, so the counter agreed with the widget while Home's Today
    // summary and the practice graph quietly disagreed with both — a set
    // recorded nowhere, for the one part of dhikr worth remembering past the
    // screen. Sequentially, because each one is a read-modify-write of the
    // encrypted store.
    for (let i = 0; i < rounds; i++) {
      await recordDhikrSet();
    }
    return result;
  } catch (e) {
    console.warn('syncWidgetTasbihQueue failed:', e);
    return EMPTY;
  }
}
