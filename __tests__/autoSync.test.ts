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
  // The real one adopts the platform's default folder; here there is no
  // platform, so the answer is whatever the test stored.
  ensureSyncFolder: async () => {
    const raw = mockStore.get('prayerapp.sync.settings.v1');
    return raw ? (JSON.parse(raw).folder ?? null) : null;
  },
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
  folder: { handle: 'content://tree/1', label: 'Sync', kind: 'picked' as const },
  autoFrequency: 'open' as const,
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
    await updateSyncSettings({ ...READY, autoFrequency: 'off' });
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

describe('how often', () => {
  // The mocked runSyncNow does not stamp anything, so the stored time is
  // set here — which is also how a cold start sees it.
  const at = (ms: number) => ({ ...READY, lastSyncAt: new Date(ms).toISOString() });
  const start = 1_756_000_000_000;
  const HOUR = 60 * 60 * 1000;

  it('holds an hourly round back until the hour is up', async () => {
    await updateSyncSettings({ ...at(start - 30 * 60 * 1000), autoFrequency: 'hourly' });
    expect(await maybeAutoSync({ now: start })).toBeNull();

    forgetCachedSyncSettings();
    resetAutoSyncThrottle();
    await updateSyncSettings({ ...at(start - HOUR - 1000), autoFrequency: 'hourly' });
    expect(await maybeAutoSync({ now: start })).not.toBeNull();
  });

  it('measures a daily round against the stored time, not the launch', async () => {
    // The throttle is fresh, as it is on every cold start. If the gap were
    // measured against memory, killing the app would be a way to make
    // "once a day" mean "every time you open it".
    await updateSyncSettings({ ...at(start - 3 * HOUR), autoFrequency: 'daily' });
    expect(await maybeAutoSync({ now: start })).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('lets the timer run a due round while the app sits open', async () => {
    await updateSyncSettings({ ...at(start - 2 * HOUR), autoFrequency: 'hourly' });
    expect(await maybeAutoSync({ now: start, trigger: 'tick' })).not.toBeNull();
  });

  it('does not let the timer turn "on open" into every few minutes', async () => {
    await updateSyncSettings({ ...at(start - 2 * HOUR), autoFrequency: 'open' });
    expect(await maybeAutoSync({ now: start, trigger: 'tick' })).toBeNull();
    expect(await maybeAutoSync({ now: start, trigger: 'open' })).not.toBeNull();
  });

  it('treats a clock moved backwards as due rather than as due next year', async () => {
    await updateSyncSettings({ ...at(start + 30 * 24 * HOUR), autoFrequency: 'daily' });
    expect(await maybeAutoSync({ now: start })).not.toBeNull();
  });

  it('reads a switch stored by an earlier build', async () => {
    // The field used to be a boolean. Someone who turned it off must not
    // find it back on because it was renamed.
    mockStore.set(
      'prayerapp.sync.settings.v1',
      JSON.stringify({ ...READY, autoOnOpen: false, autoFrequency: undefined }),
    );
    forgetCachedSyncSettings();
    expect(await maybeAutoSync({ now: start })).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
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

    // Let the first round actually reach runSyncNow before releasing it.
    // How many microtask ticks that takes depends on how much the round
    // awaits on the way in, and a fixed number of `await`s here would make
    // this test fail every time that changes.
    while (!gate.release) {
      await new Promise(resolve => setImmediate(resolve));
    }
    gate.release();
    await first;
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});
