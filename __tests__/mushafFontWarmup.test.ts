/**
 * The mushaf font warm-up: fill the store once, on Wi-Fi, silently.
 *
 * The complete set is 180 MB, so the two things that must never regress are
 * "not on a metered connection" and "not again once it is done".
 */
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStore[k];
  }),
}));

type NetState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
};
let mockListener: ((s: NetState) => void) | null = null;
let mockNet: NetState = {
  isConnected: true,
  isInternetReachable: true,
  type: 'cellular',
};
const mockUnsubscribe = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb: (s: NetState) => void) => {
      mockListener = cb;
      return mockUnsubscribe;
    }),
    fetch: jest.fn(async () => mockNet),
  },
}));

let mockDownloads = 0;
let mockCancels = 0;
let mockResolveDownload: ((ok: boolean) => void) | null = null;
let mockPagesOnDisk = 0;
jest.mock('../src/quran/mushafFontStore', () => ({
  FONT_RELEASE: 'mushaf-fonts-v2',
  downloadAllPageFonts: jest.fn(() => {
    mockDownloads += 1;
    return {
      promise: new Promise<boolean>(res => {
        mockResolveDownload = res;
      }),
      cancel: () => {
        mockCancels += 1;
        mockResolveDownload?.(false);
      },
    };
  }),
  fontStoreStats: jest.fn(async () => ({ pages: mockPagesOnDisk, bytes: 0 })),
}));

import {
  clearFontWarmupMarker,
  fontWarmupNeeded,
  startFontWarmup,
} from '../src/quran/mushafFontWarmup';

const flush = () => new Promise<void>(r => setImmediate(r));

describe('mushaf font warm-up', () => {
  beforeEach(async () => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    mockListener = null;
    mockDownloads = 0;
    mockCancels = 0;
    mockResolveDownload = null;
    mockPagesOnDisk = 0;
    mockNet = { isConnected: true, isInternetReachable: true, type: 'wifi' };
  });

  test('does not download on a metered connection', async () => {
    mockNet = { isConnected: true, isInternetReachable: true, type: 'cellular' };
    const w = startFontWarmup();
    await flush();
    mockListener?.(mockNet);
    await flush();
    expect(mockDownloads).toBe(0);
    w.stop();
  });

  test('downloads once Wi-Fi arrives, and records it when the store is full', async () => {
    mockNet = { isConnected: true, isInternetReachable: true, type: 'cellular' };
    const w = startFontWarmup();
    await flush();
    expect(mockDownloads).toBe(0);

    mockListener?.({ isConnected: true, isInternetReachable: true, type: 'wifi' });
    await flush();
    expect(mockDownloads).toBe(1);

    mockPagesOnDisk = 604;
    mockResolveDownload?.(true);
    await flush();
    await flush();

    expect(await fontWarmupNeeded()).toBe(false);
    w.stop();
  });

  test('leaving Wi-Fi cancels; work already done is kept', async () => {
    const w = startFontWarmup();
    await flush();
    mockListener?.({ isConnected: true, isInternetReachable: true, type: 'wifi' });
    await flush();
    expect(mockDownloads).toBe(1);

    mockListener?.({ isConnected: true, isInternetReachable: true, type: 'cellular' });
    await flush();
    expect(mockCancels).toBe(1);
    // Nothing recorded — the next Wi-Fi window has to pick it up.
    expect(await fontWarmupNeeded()).toBe(true);
    w.stop();
  });

  test('a completed store is not re-downloaded on the next start', async () => {
    mockPagesOnDisk = 604;
    const first = startFontWarmup();
    await flush();
    await flush();
    expect(mockDownloads).toBe(0); // the mockStore was already full
    first.stop();

    const second = startFontWarmup();
    await flush();
    await flush();
    expect(mockDownloads).toBe(0);
    second.stop();
  });

  test('a marker from a different font release does not count', async () => {
    mockStore['mihrab.quran.fontWarmup.v1'] = JSON.stringify({
      release: 'mushaf-fonts-v1',
      pages: 604,
      at: 1,
    });
    mockPagesOnDisk = 0;
    expect(await fontWarmupNeeded()).toBe(true);
  });

  test('deleting the fonts clears the marker so the store can refill', async () => {
    mockPagesOnDisk = 604;
    expect(await fontWarmupNeeded()).toBe(false); // writes the marker
    await clearFontWarmupMarker();
    mockPagesOnDisk = 0;
    expect(await fontWarmupNeeded()).toBe(true);
  });

  test('a partially failed run is not recorded as done', async () => {
    const w = startFontWarmup();
    await flush();
    mockListener?.({ isConnected: true, isInternetReachable: true, type: 'wifi' });
    await flush();
    mockPagesOnDisk = 300;
    mockResolveDownload?.(false);
    await flush();
    await flush();
    expect(await fontWarmupNeeded()).toBe(true);
    w.stop();
  });
});
