/**
 * Typed wrapper for the SystemClock native module — issue #18.
 *
 * Answers one question: is the device clock set to 24-hour time? Neither
 * platform lets JavaScript see this. Android keeps it in
 * `Settings.System.TIME_12_24`, outside the locale entirely; iOS folds it
 * into the current locale in a way `Intl` on Hermes does not reliably
 * reproduce. So both sides answer natively and agree on one boolean.
 *
 * `null` means nobody could be asked — an older build without the module,
 * or the test environment — and `resolveHour12` then falls back to
 * 24-hour, which is what this app has shown since its first release.
 *
 * One store, not one per component. Every prayer time on screen asks this
 * question, and a month table has two hundred of them; a subscription per
 * caller would mean two hundred `AppState` listeners and two hundred
 * bridge calls on every foreground. So the answer lives here, is re-read
 * once when the app becomes active, and is published to whoever is
 * listening.
 *
 * ── THE CONSTANT AND THE METHOD HAVE DIFFERENT NAMES ──────────────────
 *
 * The native side exports a constant `is24Hour` (there at startup, no
 * round trip) and a method `readIs24Hour()` (re-asked on foreground).
 * They used to share a name, and one of them was unreachable in every
 * bridge mode: the New Architecture's interop layer resolves methods
 * first and never exposes a same-named constant, while the legacy bridge
 * `Object.assign`s the constants over the module and buries the method.
 * The visible result was `auto` starting as 24-hour on every cold start
 * and flipping once the promise came back. Now the constant is read
 * through `getConstants()` where the interop layer offers it and off the
 * module object where the legacy bridge puts it, and a refresh is kicked
 * off at module load rather than waiting for a subscriber.
 */
import { AppState, NativeModules, type AppStateStatus } from 'react-native';

type SystemClockNative = {
  is24Hour?: unknown;
  getConstants?: () => { is24Hour?: unknown } | undefined;
  readIs24Hour?: () => Promise<boolean>;
};

const native: SystemClockNative | undefined = (
  NativeModules as Record<string, SystemClockNative | undefined>
).SystemClock;

function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readConstant(): boolean | null {
  if (!native) return null;
  // New Architecture interop: constants live behind getConstants().
  try {
    const viaGetter = asBool(native.getConstants?.()?.is24Hour);
    if (viaGetter !== null) return viaGetter;
  } catch {
    // Fall through to the legacy shape.
  }
  // Legacy bridge: constants are properties of the module object.
  return asBool(native.is24Hour);
}

let cached: boolean | null = readConstant();

const listeners = new Set<() => void>();
let appStateSub: { remove: () => void } | null = null;

function publish(next: boolean | null): void {
  if (next === cached) return;
  cached = next;
  listeners.forEach(l => {
    l();
  });
}

/**
 * The last answer the device gave, with no round trip. Safe to call
 * during render, and stable enough to be a `useSyncExternalStore`
 * snapshot: it only changes identity when the device's answer does.
 */
export function systemIs24Hour(): boolean | null {
  return cached;
}

/**
 * Ask again. Called when the app comes back to the foreground, because
 * the trip to Settings the user just made may have been for this switch
 * — and once at load, so a build where the constant could not be read
 * still has the right answer before the first payload is built.
 */
export async function refreshSystemIs24Hour(): Promise<boolean | null> {
  const method = native?.readIs24Hour;
  if (typeof method !== 'function') return cached;
  try {
    const value = await method();
    if (typeof value === 'boolean') publish(value);
  } catch {
    // Keep the last known answer; a stale clock format is better than
    // a format that flips because a bridge call failed.
  }
  return cached;
}

/**
 * Subscribe to changes. The first subscriber installs the single
 * `AppState` listener; the last one to leave removes it.
 */
export function subscribeSystemIs24Hour(listener: () => void): () => void {
  listeners.add(listener);
  if (!appStateSub) {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void refreshSystemIs24Hour();
    };
    appStateSub = AppState.addEventListener('change', onChange);
    void refreshSystemIs24Hour();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && appStateSub) {
      appStateSub.remove();
      appStateSub = null;
    }
  };
}

// Belt and braces for the cold start: whatever `readConstant` managed,
// ask the device once now. Headless tasks and the first widget payload
// run before any component subscribes, and they read `cached`.
if (typeof native?.readIs24Hour === 'function') {
  void refreshSystemIs24Hour();
}

/** Test seam. */
export function _setSystemIs24HourForTests(value: boolean | null): void {
  publish(value);
}
