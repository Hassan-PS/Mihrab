/**
 * The third drain trigger: a widget queue changed.
 *
 * The queue drained on app mount and on `AppState` going `active`, and a
 * widget tap is neither. iPhone hides that — you cannot see a Home Screen
 * widget while the app is in front of you, so a tap always happens with the
 * app backgrounded, and opening it fires `active`. macOS does not:
 * Notification Center opens over an app that stays active, which is the
 * ordinary way to use the widget and so the ordinary way to strand a tap.
 * Measured 2026-08-29 — two taps sat in the queue with the app open the whole
 * time, and only a relaunch wrote them.
 *
 * The cost of that is not a delay. `MAX_QUEUE_AGE_MS` discards entries after
 * a fortnight because an undrained queue is taken to mean an unopened app,
 * which on a Mac it does not; a fortnight of prayers logged on the widget
 * would be dropped while the widget showed their ticks throughout.
 *
 * The native side posts a Darwin notification when either queue actually
 * changes and `WidgetQueueWatcher` turns it into this event. It carries no
 * payload: the queue is the state, and the drain that reads it is the one
 * that already existed.
 */
import {
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

export const WIDGET_QUEUE_CHANGED_EVENT = 'MihrabWidgetQueueChanged';

/**
 * Run `onChange` whenever a widget queue changes. Returns an unsubscribe.
 *
 * Every failure here is silent and returns a no-op unsubscribe, because the
 * caller is an effect in the navigation root and the drain still has its two
 * original triggers. A missing module is the normal state on a build older
 * than this one, not an error.
 *
 * TWO MECHANISMS, because the two platforms are not in the same position.
 * The iOS widget runs in a separate extension process, so the change has to
 * cross a process boundary — a Darwin notification, turned into an event by
 * the `WidgetQueueWatcher` module. Android's widget tap is a PendingIntent
 * to a receiver in the app's OWN process, so it can emit straight to JS with
 * `RCTDeviceEventEmitter` and there is no module to look up.
 */
export function onWidgetQueueChanged(onChange: () => void): () => void {
  if (Platform.OS === 'android') {
    const sub = DeviceEventEmitter.addListener(
      WIDGET_QUEUE_CHANGED_EVENT,
      onChange,
    );
    return () => {
      try {
        sub.remove();
      } catch {
        // Nothing to do: the bridge is going away with us.
      }
    };
  }
  if (Platform.OS !== 'ios') return () => {};
  const mod = NativeModules.WidgetQueueWatcher;
  if (!mod) return () => {};
  try {
    const emitter = new NativeEventEmitter(mod);
    const sub = emitter.addListener(WIDGET_QUEUE_CHANGED_EVENT, onChange);
    return () => {
      try {
        sub.remove();
      } catch {
        // Nothing to do: the bridge is going away with us.
      }
    };
  } catch {
    return () => {};
  }
}
