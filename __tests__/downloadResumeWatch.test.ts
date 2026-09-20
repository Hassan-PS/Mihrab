/**
 * COMING BACK BY ITSELF, AND ONLY WHERE IT IS FREE — issue #55.
 *
 * The issue asks, as its last and optional suggestion, for the download
 * to resume on its own when the connection returns. It does — on wifi.
 * A reciter is about a gigabyte, and a phone that reconnects to mobile
 * data has not agreed to spend it; that download waits behind the button
 * instead, which is the rest of #55.
 *
 * What is pinned here is the policy and the brakes: the transition rather
 * than the state, unmetered rather than connected, and a job that stops
 * getting anywhere left alone rather than restarted for ever.
 */
type NetListener = (state: unknown) => void;

const mockListeners: NetListener[] = [];
/** `mock`-prefixed, which is what jest allows a module factory to see. */
let mockCurrentState: unknown = { isConnected: false, type: 'none', details: null };

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (fn: NetListener) => {
      mockListeners.push(fn);
      return () => {
        const at = mockListeners.indexOf(fn);
        if (at >= 0) mockListeners.splice(at, 1);
      };
    },
    fetch: () => Promise.resolve(mockCurrentState),
  },
}));

const mockResume = jest.fn(() => true);
let mockResumable: unknown = null;
let mockLast: { done: number; complete?: boolean; cancelled?: boolean } | null =
  null;
const mockManagerListeners: Array<(s: unknown) => void> = [];

jest.mock('../src/quran/quranDownloadManager', () => ({
  hydrateResumableJob: () => Promise.resolve(mockResumable),
  quranDownloadState: () => ({ running: null, progress: {}, last: mockLast }),
  resumableJob: () => mockResumable,
  resumeQuranDownload: () => mockResume(),
  subscribeQuranDownload: (fn: (s: unknown) => void) => {
    mockManagerListeners.push(fn);
    return () => undefined;
  },
}));

import {
  isFreeConnection,
  startDownloadResumeWatch,
  _resetResumeWatchForTests,
} from '../src/quran/quranDownloadResume';

const WIFI = { isConnected: true, type: 'wifi', details: { isConnectionExpensive: false } };
const CELLULAR = { isConnected: true, type: 'cellular', details: { isConnectionExpensive: true } };
const OFFLINE = { isConnected: false, type: 'none', details: null };

/** Let the hydrate-then-fetch chain inside the watcher settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => {
  mockListeners.length = 0;
  mockManagerListeners.length = 0;
  mockResume.mockClear();
  mockResumable = { kind: 'audio', reciterId: 'alafasy' };
  mockLast = { done: 5300 };
  mockCurrentState = OFFLINE;
  _resetResumeWatchForTests();
});

describe('which connections count as free', () => {
  it('wifi and ethernet, when nothing says they cost money', () => {
    expect(isFreeConnection(WIFI as never)).toBe(true);
    expect(
      isFreeConnection({ isConnected: true, type: 'ethernet', details: {} } as never),
    ).toBe(true);
  });

  it('never mobile data, and never a disconnected anything', () => {
    expect(isFreeConnection(CELLULAR as never)).toBe(false);
    expect(isFreeConnection(OFFLINE as never)).toBe(false);
    expect(isFreeConnection(null)).toBe(false);
  });

  it('and not a wifi the platform says is expensive — a tethered phone', () => {
    expect(
      isFreeConnection({
        isConnected: true,
        type: 'wifi',
        details: { isConnectionExpensive: true },
      } as never),
    ).toBe(false);
  });
});

describe('the watcher', () => {
  it('picks the download up when wifi arrives', async () => {
    const stop = startDownloadResumeWatch();
    await settle();
    expect(mockResume).not.toHaveBeenCalled();

    mockListeners.forEach(fn => fn(WIFI));
    expect(mockResume).toHaveBeenCalledTimes(1);
    stop();
  });

  it('leaves it alone on mobile data', async () => {
    const stop = startDownloadResumeWatch();
    await settle();
    mockListeners.forEach(fn => fn(CELLULAR));
    expect(mockResume).not.toHaveBeenCalled();
    stop();
  });

  it('acts on the transition, not on every event a live network sends', async () => {
    const stop = startDownloadResumeWatch();
    await settle();
    mockListeners.forEach(fn => fn(WIFI));
    mockListeners.forEach(fn => fn(WIFI));
    mockListeners.forEach(fn => fn(WIFI));
    expect(mockResume).toHaveBeenCalledTimes(1);
    stop();
  });

  it('resumes on launch when the phone is already on wifi', async () => {
    // The commonest shape of the report: the download stopped while they
    // were out, and they open the app at home.
    mockCurrentState = WIFI;
    const stop = startDownloadResumeWatch();
    await settle();
    expect(mockResume).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does nothing at all when there is nothing to resume', async () => {
    mockResumable = null;
    mockCurrentState = WIFI;
    const stop = startDownloadResumeWatch();
    await settle();
    mockListeners.forEach(fn => fn(WIFI));
    expect(mockResume).not.toHaveBeenCalled();
    stop();
  });

  it('stops trying when trying stops helping', async () => {
    // A connection that flaps, or a captive portal that answers
    // everything with a login page: the run comes back, gets nowhere, and
    // stops again. Retrying that on every reconnect for ever is how an
    // app eats a battery saying nothing.
    const stop = startDownloadResumeWatch();
    await settle();
    for (let i = 0; i < 6; i++) {
      mockListeners.forEach(fn => fn(OFFLINE));
      mockListeners.forEach(fn => fn(WIFI));
    }
    expect(mockResume).toHaveBeenCalledTimes(1);
    stop();
  });

  it('but keeps going while each attempt gets somewhere', async () => {
    const stop = startDownloadResumeWatch();
    await settle();
    for (let i = 1; i <= 4; i++) {
      mockLast = { done: 5300 + i * 100 };
      mockListeners.forEach(fn => fn(OFFLINE));
      mockListeners.forEach(fn => fn(WIFI));
    }
    // Three, which is the cap: progress buys another go, but not for ever.
    expect(mockResume).toHaveBeenCalledTimes(3);
    stop();
  });

  it('forgets the cap once a download finishes', async () => {
    const stop = startDownloadResumeWatch();
    await settle();
    for (let i = 0; i < 4; i++) {
      mockListeners.forEach(fn => fn(OFFLINE));
      mockListeners.forEach(fn => fn(WIFI));
    }
    const spent = mockResume.mock.calls.length;
    // A reciter that finished on the second go must not leave the NEXT
    // download in this session with one attempt left.
    mockManagerListeners.forEach(fn => fn({ last: { complete: true } }));
    mockLast = { done: 10 };
    mockListeners.forEach(fn => fn(OFFLINE));
    mockListeners.forEach(fn => fn(WIFI));
    expect(mockResume.mock.calls.length).toBe(spent + 1);
    stop();
  });

  it('lets go when the app does', async () => {
    const stop = startDownloadResumeWatch();
    await settle();
    stop();
    mockListeners.forEach(fn => fn(WIFI));
    expect(mockResume).not.toHaveBeenCalled();
  });
});
