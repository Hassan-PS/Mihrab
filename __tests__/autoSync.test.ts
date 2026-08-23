/**
 * Automatic sync: when it runs, and — mostly — when it does not.
 *
 * `active` is not "the user came back to the app". It fires when a share
 * sheet closes, when a permission dialog is dismissed, when the phone
 * unlocks with the app in front. The interesting behaviour here is all
 * refusal, so that is what this pins.
 */
const mockStore = new Map<string, string>();
const mockRun = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockStore.delete(k);
    }),
  },
}));

jest.mock('../src/sync/runSync', () => ({
  runSyncNow: (...args: unknown[]) => mockRun(...args),
}));

import {
  AUTO_SYNC_MIN_GAP_MS,
  maybeAutoSync,
  resetAutoSyncThrottle,
} from '../src/sync/autoSync';
import {
  forgetCachedSyncSettings,
  updateSyncSettings,
} from '../src/sync/syncSettings';

const READY = {
  folder: { handle: 'content://tree/1', label: 'Sync' },
  autoOnOpen: true,
};

beforeEach(() => {
  mockStore.clear();
  mockRun.mockReset();
  mockRun.mockResolvedValue({ ok: true, outcome: null, at: 'now' });
  forgetCachedSyncSettings();
  resetAutoSyncThrottle();
});

describe('declining, quietly', () => {
  it('does nothing when no folder has been chosen', async () => {
    expect(await maybeAutoSync()).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('does nothing when the user turned it off', async () => {
    await updateSyncSettings({ ...READY, autoOnOpen: false });
    expect(await maybeAutoSync()).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('swallows a failure rather than throwing out of a listener', async () => {
    await updateSyncSettings(READY);
    mockRun.mockRejectedValue(new Error('folder went away'));
    // Nobody asked for this round; an unhandled rejection would be the app
    // shouting about work the user did not request.
    await expect(maybeAutoSync()).resolves.toBeNull();
  });
});

describe('the throttle', () => {
  it('runs the first time and then not again for two minutes', async () => {
    await updateSyncSettings(READY);
    const start = 1_756_000_000_000;

    expect(await maybeAutoSync({ now: start })).not.toBeNull();
    expect(await maybeAutoSync({ now: start + 1000 })).toBeNull();
    expect(await maybeAutoSync({ now: start + AUTO_SYNC_MIN_GAP_MS - 1 })).toBeNull();
    expect(await maybeAutoSync({ now: start + AUTO_SYNC_MIN_GAP_MS })).not.toBeNull();

    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('does not arm the clock when it declines to run', async () => {
    // No folder: the round is declined before it starts, so the throttle
    // must NOT be armed — otherwise turning sync on would sit idle for two
    // minutes for no reason.
    const start = 1_756_000_000_000;
    expect(await maybeAutoSync({ now: start })).toBeNull();

    await updateSyncSettings(READY);
    expect(await maybeAutoSync({ now: start + 1000 })).not.toBeNull();
  });

  it('does not start a second round behind a slow one', async () => {
    await updateSyncSettings(READY);
    // Held in an object rather than a `let`: TypeScript's control-flow
    // analysis cannot see the executor run, and narrows a plain variable to
    // `never` at the call below.
    const gate: { release: (() => void) | null } = { release: null };
    mockRun.mockImplementation(
      () =>
        new Promise(resolve => {
          gate.release = () => resolve({ ok: true });
        }),
    );

    const first = maybeAutoSync({ now: 1_000_000 });
    // Far past the throttle window, so only the in-flight guard can stop it.
    const second = await maybeAutoSync({ now: 9_000_000 });
    expect(second).toBeNull();

    gate.release?.();
    await first;
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});
