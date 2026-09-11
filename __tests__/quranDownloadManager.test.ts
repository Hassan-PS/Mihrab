/**
 * The Quran's downloads outliving the screen that started them.
 *
 * The behaviour under test is not "does it download" — that is the font
 * store's and the audio store's job — but who owns it. A screen that
 * unmounts must not take six hundred pages with it, a second screen must
 * not start a second download, and a run that ends while nobody is looking
 * must still be reportable to whoever shows up next.
 *
 * Since the manager took the recitations on as well, one more thing has to
 * hold: the two kinds share one owner, and a font run and a reciter run
 * cannot both be in flight. They share a pipe, a disk and — on Android —
 * one foreground service, whose notification IS the service.
 */
const mockHandles: Array<{
  cancel: jest.Mock;
  resolve: (complete: boolean) => void;
  onProgress: (p: { done: number; total: number; failed: number }) => void;
  what: string;
}> = [];

function mockMakeHandle(
  what: string,
  onProgress?: (p: { done: number; total: number; failed: number }) => void,
) {
  let resolve!: (complete: boolean) => void;
  const promise = new Promise<boolean>(r => {
    resolve = r;
  });
  const entry = {
    cancel: jest.fn(),
    resolve,
    onProgress: onProgress ?? (() => {}),
    what,
  };
  mockHandles.push(entry);
  return { promise, cancel: entry.cancel };
}

jest.mock('../src/quran/mushafFontStore', () => ({
  downloadAllPageFonts: (opts?: {
    onProgress?: (p: { done: number; total: number; failed: number }) => void;
  }) => mockMakeHandle('fonts', opts?.onProgress),
}));

jest.mock('../src/quran/audio/audioStore', () => ({
  downloadReciterAudio: (
    reciterId: string,
    onProgress?: (p: { done: number; total: number; failed: number }) => void,
  ) => mockMakeHandle(`audio:${reciterId}`, onProgress),
  downloadAyahs: (
    reciterId: string,
    refs: ReadonlyArray<{ surah: number; ayah: number }>,
    onProgress?: (p: { done: number; total: number; failed: number }) => void,
  ) => mockMakeHandle(`ayahs:${reciterId}:${refs.length}`, onProgress),
  downloadSurahAudio: (
    reciterId: string,
    surah: number,
    onProgress?: (p: { done: number; total: number; failed: number }) => void,
  ) => mockMakeHandle(`surah:${reciterId}:${surah}`, onProgress),
  totalAyahCount: () => 6236,
}));

const mockPublish = jest.fn();
const mockFinish = jest.fn();
jest.mock('../src/quran/downloadNotification', () => ({
  publishDownloadProgress: (...a: unknown[]) => mockPublish(...a),
  finishDownloadNotification: (...a: unknown[]) => mockFinish(...a),
}));

import {
  cancelQuranDownload,
  isJobRunning,
  quranDownloadState,
  resetQuranDownloadState,
  startQuranDownload,
  subscribeQuranDownload,
} from '../src/quran/quranDownloadManager';

const FONTS = { kind: 'fonts' } as const;
const HUSARY = { kind: 'audio', reciterId: 'husary' } as const;
const ALAFASY = { kind: 'audio', reciterId: 'alafasy' } as const;

beforeEach(() => {
  mockHandles.length = 0;
  mockPublish.mockClear();
  mockFinish.mockClear();
  resetQuranDownloadState();
});

describe('who owns the download', () => {
  it('keeps running when every subscriber has gone', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeQuranDownload(s =>
      seen.push(s.running?.kind ?? 'none'),
    );
    expect(startQuranDownload(FONTS)).toBe(true);

    // The screen unmounts.
    unsubscribe();

    expect(mockHandles[0].cancel).not.toHaveBeenCalled();
    expect(quranDownloadState().running).toEqual(FONTS);
    expect(seen).toContain('fonts');
  });

  it('refuses to start a second one over the first', () => {
    expect(startQuranDownload(FONTS)).toBe(true);
    expect(startQuranDownload(FONTS)).toBe(false);
    expect(mockHandles).toHaveLength(1);
  });

  it('reports how the last run ended to whoever asks later', async () => {
    startQuranDownload(FONTS);
    mockHandles[0].onProgress({ done: 604, total: 604, failed: 0 });
    mockHandles[0].resolve(true);
    await Promise.resolve();
    await Promise.resolve();

    const state = quranDownloadState();
    expect(state.running).toBeNull();
    expect(state.last).toEqual({
      job: FONTS,
      complete: true,
      cancelled: false,
      failed: 0,
    });
    expect(mockFinish).toHaveBeenCalledWith(
      expect.objectContaining({ complete: true, cancelled: false, failed: 0 }),
    );
  });

  it('tells the notification a cancel from a cancel', async () => {
    startQuranDownload(FONTS);
    cancelQuranDownload();
    expect(mockHandles[0].cancel).toHaveBeenCalled();
    mockHandles[0].resolve(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(quranDownloadState().last?.cancelled).toBe(true);
    // A cancelled run says nothing in the shade: the user knows.
    expect(mockFinish).toHaveBeenCalledWith(
      expect.objectContaining({ cancelled: true, complete: false }),
    );
  });

  it('publishes progress to the notification as it goes', () => {
    startQuranDownload(FONTS);
    mockHandles[0].onProgress({ done: 12, total: 604, failed: 0 });
    expect(quranDownloadState().progress.done).toBe(12);
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ done: 12, total: 604 }),
    );
  });
});

describe('one at a time, across both kinds', () => {
  it('will not start a recitation over a font run', () => {
    expect(startQuranDownload(FONTS)).toBe(true);
    expect(startQuranDownload(HUSARY)).toBe(false);
    expect(mockHandles).toHaveLength(1);
  });

  it('will not start a font run over a recitation', () => {
    expect(startQuranDownload(HUSARY)).toBe(true);
    expect(startQuranDownload(FONTS)).toBe(false);
    expect(mockHandles).toHaveLength(1);
  });

  it('will not start a second reciter over the first', () => {
    expect(startQuranDownload(HUSARY)).toBe(true);
    expect(startQuranDownload(ALAFASY)).toBe(false);
  });

  it('starts the next one once the first has ended', async () => {
    startQuranDownload(FONTS);
    mockHandles[0].resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(startQuranDownload(HUSARY)).toBe(true);
    expect(mockHandles[1].what).toBe('audio:husary');
  });
});

describe('which reciter is running', () => {
  it('names the one it started', () => {
    startQuranDownload(HUSARY);
    expect(quranDownloadState().running).toEqual(HUSARY);
    expect(mockHandles[0].what).toBe('audio:husary');
  });

  it('answers isJobRunning per reciter, not per kind', () => {
    startQuranDownload(HUSARY);
    // A screen listing forty-two voices has to be able to put the spinner
    // on the right row.
    expect(isJobRunning(HUSARY)).toBe(true);
    expect(isJobRunning(ALAFASY)).toBe(false);
    expect(isJobRunning(FONTS)).toBe(false);
  });

  it('is false for everything once nothing is running', async () => {
    startQuranDownload(HUSARY);
    mockHandles[0].resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(isJobRunning(HUSARY)).toBe(false);
  });
});

describe('the bar knows what it is counting', () => {
  it('starts a recitation at its real total, not at zero of zero', () => {
    // A bar that reads "0 of 0" and then jumps to "1 of 6236" looks like a
    // stall. The total is known before the first file lands.
    startQuranDownload(HUSARY);
    expect(quranDownloadState().progress.total).toBe(6236);
  });

  it('gives the notification a body, in the unit this job counts', () => {
    startQuranDownload(HUSARY);
    mockHandles[0].onProgress({ done: 40, total: 6236, failed: 0 });
    const call = mockPublish.mock.calls.at(-1)?.[0] as {
      label: string;
      body: string;
    };
    expect(typeof call.body).toBe('string');
    expect(call.body.length).toBeGreaterThan(0);
    // The mushaf's own wording counts pages; this one must not.
    expect(call.body).not.toMatch(/page/i);
  });

  it('names the reciter in the shade', () => {
    startQuranDownload(HUSARY);
    mockHandles[0].onProgress({ done: 1, total: 6236, failed: 0 });
    const call = mockPublish.mock.calls.at(-1)?.[0] as { label: string };
    expect(call.label).toMatch(/Husary/i);
  });
});

/**
 * One surah in one voice — the tilāwah download in the ayah sheet.
 *
 * It was the last download still owned by a screen: the handle lived in
 * `RecitationControls`, so closing the sheet cancelled it, and the shade
 * was never told it was happening at all.
 */
describe('one surah of tilawah', () => {
  // Al-Fatihah, with three of its seven already on disk.
  const REFS = [
    { surah: 1, ayah: 5 },
    { surah: 1, ayah: 6 },
    { surah: 1, ayah: 7 },
  ];
  const FATIHAH = { kind: 'surah', reciterId: 'husary', surah: 1 } as const;

  it('queues the missing ayahs, not the whole surah', () => {
    expect(startQuranDownload({ ...FATIHAH, refs: REFS })).toBe(true);
    // A bar counting to seven when three are missing tells somebody to
    // expect more than twice the wait.
    expect(mockHandles[0].what).toBe('ayahs:husary:3');
    expect(quranDownloadState().progress.total).toBe(3);
  });

  it('falls back to the whole surah when nobody read the disk', () => {
    startQuranDownload(FATIHAH);
    expect(mockHandles[0].what).toBe('surah:husary:1');
    // Seven ayahs, from the catalogue rather than from the caller.
    expect(quranDownloadState().progress.total).toBe(7);
  });

  it('survives the sheet that started it', () => {
    const unsubscribe = subscribeQuranDownload(() => {});
    startQuranDownload({ ...FATIHAH, refs: REFS });
    unsubscribe();
    expect(mockHandles[0].cancel).not.toHaveBeenCalled();
    expect(quranDownloadState().running).not.toBeNull();
  });

  it('is identified by voice and surah, not by the ayahs it queued', () => {
    startQuranDownload({ ...FATIHAH, refs: REFS });
    // The row asking is drawing a bar; it has no idea which ayahs were
    // missing when somebody else pressed the button.
    expect(isJobRunning(FATIHAH)).toBe(true);
    expect(isJobRunning({ kind: 'surah', reciterId: 'husary', surah: 2 })).toBe(
      false,
    );
    expect(
      isJobRunning({ kind: 'surah', reciterId: 'alafasy', surah: 1 }),
    ).toBe(false);
    expect(isJobRunning(HUSARY)).toBe(false);
  });

  it('shares the one pipe with the mushaf and the reciters', () => {
    expect(startQuranDownload({ ...FATIHAH, refs: REFS })).toBe(true);
    expect(startQuranDownload(FONTS)).toBe(false);
    expect(startQuranDownload(HUSARY)).toBe(false);
    expect(mockHandles).toHaveLength(1);
  });

  it('names the surah and the voice in the shade, counting ayahs', () => {
    startQuranDownload({ ...FATIHAH, refs: REFS });
    mockHandles[0].onProgress({ done: 1, total: 3, failed: 0 });
    const call = mockPublish.mock.calls.at(-1)?.[0] as {
      label: string;
      body: string;
    };
    expect(call.label).toMatch(/Husary/i);
    expect(call.label).toMatch(/Fatihah/i);
    expect(call.body).not.toMatch(/page/i);
  });

  it('puts the bar up on the tap, not on the first file that lands', () => {
    // Seven ayahs on a slow connection left several seconds between the
    // button and anything in the shade, which reads as a dead button.
    startQuranDownload({ ...FATIHAH, refs: REFS });
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ done: 0, total: 3 }),
    );
  });

  it('says so in the shade when it finishes', async () => {
    startQuranDownload({ ...FATIHAH, refs: REFS });
    mockHandles[0].onProgress({ done: 3, total: 3, failed: 0 });
    mockHandles[0].resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    const call = mockFinish.mock.calls.at(-1)?.[0] as {
      complete: boolean;
      doneTitle: string;
    };
    expect(call.complete).toBe(true);
    expect(call.doneTitle).toMatch(/Fatihah/i);
  });
});

describe('the flood a whole-Quran download makes', () => {
  it('publishes on percent, not on every one of 6,236 files', () => {
    // Every publish drags each subscribed screen through a render, and the
    // listening page subscribes above a 114-row list. The bar cannot show
    // one ayah anyway: it is a few hundred points wide.
    startQuranDownload(HUSARY);
    let renders = 0;
    subscribeQuranDownload(() => {
      renders += 1;
    });
    for (let done = 1; done <= 700; done++) {
      mockHandles[0].onProgress({ done, total: 6236, failed: 0 });
    }
    // 700 files of 6236 is 11%, so at most a dozen publications.
    expect(renders).toBeGreaterThan(0);
    expect(renders).toBeLessThanOrEqual(12);
  });

  it('always publishes the last one exactly', () => {
    // "6236 of 6236" is the one number that has to be right, whatever
    // percent the previous event happened to land on.
    startQuranDownload(HUSARY);
    const seen: number[] = [];
    subscribeQuranDownload(s => seen.push(s.progress.done));
    mockHandles[0].onProgress({ done: 6235, total: 6236, failed: 0 });
    mockHandles[0].onProgress({ done: 6236, total: 6236, failed: 0 });
    expect(seen).toContain(6236);
  });

  it('starts each run from a clean slate', () => {
    // A second download whose first percent matched the last one of the
    // previous run would publish nothing until it passed it.
    startQuranDownload(FONTS);
    mockHandles[0].onProgress({ done: 302, total: 604, failed: 0 });
    mockHandles[0].resolve(true);
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        startQuranDownload(HUSARY);
        const seen: number[] = [];
        subscribeQuranDownload(s => seen.push(s.progress.done));
        mockHandles[1].onProgress({ done: 3118, total: 6236, failed: 0 });
        expect(seen).toContain(3118);
      });
  });
});
