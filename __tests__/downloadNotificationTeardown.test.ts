/**
 * The download bar has to go away when the download does.
 *
 * Reported 2026-09-04: "Downloading the Quran text" was still in the shade
 * after the download had finished.
 *
 * The progress notification is not an ordinary notification — it IS the
 * Android foreground service, which is what keeps the download alive while
 * the app is in the background. Cancelling it asks the platform to tear a
 * service down, and that has not happened by the time the next line runs.
 * The old code then posted the "finished" notification under the SAME id,
 * into that gap, where it could inherit the ongoing flag: a notification
 * saying the download was done that could not be swiped away.
 *
 * There was no test because there could not be one: `stopForegroundService`
 * was missing from the notifee mock, so the call threw, the module's own
 * try/catch swallowed it, and the teardown was never exercised at all.
 * That mock gap is fixed in jest.setup.js, and this is what it enables.
 */
import { Platform } from 'react-native';
import notifee from '@notifee/react-native';

// The module is Android-only by design: iOS has neither a progress
// notification nor a way to keep a JS download alive once the app is
// suspended. Jest runs as iOS, where every function here is a no-op.
Object.defineProperty(Platform, 'OS', {
  configurable: true,
  get: () => 'android',
});

const mockNotifee = notifee as unknown as {
  displayNotification: jest.Mock;
  cancelNotification: jest.Mock;
  stopForegroundService: jest.Mock;
  createChannel: jest.Mock;
};

const PROGRESS_ID = 'mihrab.quran.download';

import {
  clearStaleDownloadNotification,
  finishDownloadNotification,
  publishDownloadProgress,
} from '../src/quran/downloadNotification';

const displayed = () =>
  mockNotifee.displayNotification.mock.calls.map(
    c => c[0] as { id: string; android?: { ongoing?: boolean } },
  );

beforeEach(() => {
  mockNotifee.displayNotification.mockClear();
  mockNotifee.cancelNotification.mockClear();
  mockNotifee.stopForegroundService.mockClear();
  mockNotifee.createChannel.mockClear();
});

describe('the progress bar', () => {
  it('is ongoing and is the foreground service', async () => {
    await publishDownloadProgress({
      done: 10,
      total: 604,
      label: 'Downloading',
      body: '10 of 604 pages',
    });
    const [note] = displayed();
    expect(note.id).toBe(PROGRESS_ID);
    expect(note.android?.ongoing).toBe(true);
    expect(
      (note.android as { asForegroundService?: boolean }).asForegroundService,
    ).toBe(true);
  });

  it('says what the caller counts, not what it assumes', async () => {
    // A bar reading "pages" while it downloads a recitation is a small lie
    // that is easy to leave in, so the unit comes from the caller.
    await publishDownloadProgress({
      done: 40,
      total: 6236,
      label: 'Downloading Al-Husary',
      body: '40 of 6236 ayahs',
    });
    const [note] = displayed() as unknown as Array<{ body: string }>;
    expect(note.body).toBe('40 of 6236 ayahs');
  });
});

describe('finishing', () => {
  it('takes the bar down before it says anything else', async () => {
    await finishDownloadNotification({
      complete: true,
      cancelled: false,
      failed: 0,
    });
    expect(mockNotifee.stopForegroundService).toHaveBeenCalled();
    expect(mockNotifee.cancelNotification).toHaveBeenCalledWith(PROGRESS_ID);
  });

  it('posts the result under an id of its own', async () => {
    // THE BUG. Reusing the progress id put the result into a gap where the
    // service was still being torn down, and it came out ongoing.
    await finishDownloadNotification({
      complete: true,
      cancelled: false,
      failed: 0,
    });
    const notes = displayed();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).not.toBe(PROGRESS_ID);
  });

  it('leaves the result swipeable', async () => {
    await finishDownloadNotification({
      complete: true,
      cancelled: false,
      failed: 0,
    });
    const [note] = displayed() as unknown as Array<{
      android: { ongoing?: boolean; autoCancel?: boolean };
    }>;
    expect(note.android.ongoing).toBeUndefined();
    expect(note.android.autoCancel).toBe(true);
  });

  it('says nothing at all after a cancel', async () => {
    // The user pressed cancel. They know.
    await finishDownloadNotification({
      complete: false,
      cancelled: true,
      failed: 0,
    });
    expect(mockNotifee.stopForegroundService).toHaveBeenCalled();
    expect(mockNotifee.cancelNotification).toHaveBeenCalledWith(PROGRESS_ID);
    expect(displayed()).toHaveLength(0);
  });

  it('uses the words the caller gave it', async () => {
    await finishDownloadNotification({
      complete: true,
      cancelled: false,
      failed: 0,
      doneTitle: 'Al-Husary is ready',
      doneBody: 'Every ayah is on this device.',
    });
    const [note] = displayed() as unknown as Array<{
      title: string;
      body: string;
    }>;
    expect(note.title).toBe('Al-Husary is ready');
    expect(note.body).toBe('Every ayah is on this device.');
  });

  it('falls back to the mushaf wording when given none', async () => {
    // The mushaf's strings were here first and stay the default, so its
    // own call site did not have to change.
    await finishDownloadNotification({
      complete: false,
      cancelled: false,
      failed: 3,
    });
    const [note] = displayed() as unknown as Array<{ title: string }>;
    expect(typeof note.title).toBe('string');
    expect(note.title.length).toBeGreaterThan(0);
  });
});

describe('a bar left behind by a process that is gone', () => {
  it('is cleared at startup, and posts nothing in its place', async () => {
    // A crash, a Force stop, or an install over the top of a running
    // download leaves an ongoing notification with nothing behind it —
    // which the user cannot even swipe away. We are booting, so anything
    // under that id is a ghost.
    await clearStaleDownloadNotification();
    expect(mockNotifee.cancelNotification).toHaveBeenCalledWith(PROGRESS_ID);
    expect(mockNotifee.stopForegroundService).toHaveBeenCalled();
    expect(displayed()).toHaveLength(0);
  });

  it('is safe when there is nothing to clear', async () => {
    mockNotifee.stopForegroundService.mockRejectedValueOnce(
      new Error('no service running'),
    );
    await expect(clearStaleDownloadNotification()).resolves.toBeUndefined();
  });
});
