/**
 * The Quran download outliving the screen that started it.
 *
 * The behaviour under test is not "does it download" — that is
 * mushafDownload's job — but who owns it. A screen that unmounts must not
 * take six hundred pages with it, a second screen must not start a second
 * download, and a run that ends while nobody is looking must still be
 * reportable to whoever shows up next.
 */
const mockHandles: Array<{
  cancel: jest.Mock;
  resolve: (complete: boolean) => void;
  onProgress: (p: { done: number; total: number; failed: number }) => void;
}> = [];

function mockMakeHandle(opts?: {
  onProgress?: (p: { done: number; total: number; failed: number }) => void;
}) {
  let resolve!: (complete: boolean) => void;
  const promise = new Promise<boolean>(r => {
    resolve = r;
  });
  const entry = {
    cancel: jest.fn(),
    resolve,
    onProgress: opts?.onProgress ?? (() => {}),
  };
  mockHandles.push(entry);
  return { promise, cancel: entry.cancel };
}

jest.mock('../src/quran/mushafFontStore', () => ({
  downloadAllPageFonts: (opts: Parameters<typeof mockMakeHandle>[0]) =>
    mockMakeHandle(opts),
}));

const mockPublish = jest.fn();
const mockFinish = jest.fn();
jest.mock('../src/quran/downloadNotification', () => ({
  publishDownloadProgress: (...a: unknown[]) => mockPublish(...a),
  finishDownloadNotification: (...a: unknown[]) => mockFinish(...a),
}));

import {
  cancelMushafDownload,
  mushafDownloadState,
  resetMushafDownloadState,
  startMushafDownload,
  subscribeMushafDownload,
} from '../src/quran/mushafDownloadManager';

beforeEach(() => {
  mockHandles.length = 0;
  mockPublish.mockClear();
  mockFinish.mockClear();
  resetMushafDownloadState();
});

describe('who owns the download', () => {
  it('keeps running when every subscriber has gone', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeMushafDownload(s =>
      seen.push(String(s.running)),
    );
    expect(startMushafDownload('fonts')).toBe(true);

    // The screen unmounts.
    unsubscribe();

    expect(mockHandles[0].cancel).not.toHaveBeenCalled();
    expect(mushafDownloadState().running).toBe('fonts');
    expect(seen).toContain('fonts');
  });

  it('refuses to start a second one over the first', () => {
    expect(startMushafDownload('fonts')).toBe(true);
    expect(startMushafDownload('fonts')).toBe(false);
    expect(mockHandles).toHaveLength(1);
  });

  it('reports how the last run ended to whoever asks later', async () => {
    startMushafDownload('fonts');
    mockHandles[0].onProgress({ done: 604, total: 604, failed: 0 });
    mockHandles[0].resolve(true);
    await Promise.resolve();
    await Promise.resolve();

    const state = mushafDownloadState();
    expect(state.running).toBeNull();
    expect(state.last).toEqual({
      kind: 'fonts',
      complete: true,
      cancelled: false,
      failed: 0,
    });
    expect(mockFinish).toHaveBeenCalledWith({
      complete: true,
      cancelled: false,
      failed: 0,
    });
  });

  it('tells the notification a cancel from a cancel', async () => {
    startMushafDownload('fonts');
    cancelMushafDownload();
    expect(mockHandles[0].cancel).toHaveBeenCalled();
    mockHandles[0].resolve(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(mushafDownloadState().last?.cancelled).toBe(true);
    // A cancelled run says nothing in the shade: the user knows.
    expect(mockFinish).toHaveBeenCalledWith(
      expect.objectContaining({ cancelled: true, complete: false }),
    );
  });

  it('publishes progress to the notification as it goes', () => {
    startMushafDownload('fonts');
    mockHandles[0].onProgress({ done: 12, total: 604, failed: 0 });
    expect(mushafDownloadState().progress.done).toBe(12);
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ done: 12, total: 604 }),
    );
  });
});
