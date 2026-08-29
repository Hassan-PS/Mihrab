/**
 * The third drain trigger.
 *
 * The widget queue drained on app mount and on `AppState` going `active`,
 * and a widget tap is neither — the intent runs in the extension and brings
 * nothing forward. iPhone hid it: you cannot see a Home Screen widget while
 * the app is in front of you. macOS did not, because Notification Center
 * opens over an app that stays active, and two taps were measured sitting in
 * the queue with the app open throughout (2026-08-29). Entries are discarded
 * after a fortnight, so those taps were on their way to being lost, not late.
 *
 * What is testable here is the wiring, not the notification: the subscribe
 * must survive every way the native side can be absent, because the caller
 * is an effect in the navigation root and a throw there costs the app its
 * first render — for a listener whose absence only means the drain keeps the
 * two triggers it always had.
 *
 * Static imports, not `await import()`: this project's jest has no
 * `--experimental-vm-modules`, and the module reads `Platform.OS` and
 * `NativeModules` inside the function rather than at import time, so one
 * import serves every case.
 */
import { NativeModules, Platform } from 'react-native';
import {
  onWidgetQueueChanged,
  WIDGET_QUEUE_CHANGED_EVENT,
} from '../src/native/WidgetQueueWatcher';

const listeners: Record<string, Array<() => void>> = {};
const removed: string[] = [];

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {} as Record<string, unknown>,
  NativeEventEmitter: class {
    addListener(event: string, cb: () => void) {
      (listeners[event] ||= []).push(cb);
      return {
        remove: () => {
          removed.push(event);
        },
      };
    }
  },
}));

describe('onWidgetQueueChanged', () => {
  beforeEach(() => {
    for (const k of Object.keys(listeners)) delete listeners[k];
    removed.length = 0;
    (Platform as { OS: string }).OS = 'ios';
    for (const k of Object.keys(NativeModules)) {
      delete (NativeModules as Record<string, unknown>)[k];
    }
  });

  it('subscribes to the native event and calls back', () => {
    (NativeModules as Record<string, unknown>).WidgetQueueWatcher = {};
    const drain = jest.fn();
    onWidgetQueueChanged(drain);
    expect(listeners[WIDGET_QUEUE_CHANGED_EVENT]).toHaveLength(1);
    listeners[WIDGET_QUEUE_CHANGED_EVENT][0]();
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes', () => {
    (NativeModules as Record<string, unknown>).WidgetQueueWatcher = {};
    onWidgetQueueChanged(jest.fn())();
    expect(removed).toEqual([WIDGET_QUEUE_CHANGED_EVENT]);
  });

  // The two ways the native side is legitimately absent. Each returns a
  // usable unsubscribe rather than throwing, because the caller unsubscribes
  // unconditionally on unmount.
  it('is a no-op when the module is missing — an older build, mid-rollout', () => {
    expect(() => onWidgetQueueChanged(jest.fn())()).not.toThrow();
    expect(listeners).toEqual({});
  });

  it('is a no-op on android, which has no Darwin notifications', () => {
    (Platform as { OS: string }).OS = 'android';
    (NativeModules as Record<string, unknown>).WidgetQueueWatcher = {};
    expect(() => onWidgetQueueChanged(jest.fn())()).not.toThrow();
    expect(listeners).toEqual({});
  });
});
