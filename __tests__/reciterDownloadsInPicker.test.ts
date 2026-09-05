/**
 * Which voices do I have offline?
 *
 * Tilāwah used to answer that with a card under the transport — "Keep
 * <name> on this device" — which described exactly one reciter: the
 * selected one. Answering it for the catalog meant selecting each of
 * forty-two in turn and reading the card again, and the card itself sat
 * between the player and the surah list on every visit, downloaded or
 * not.
 *
 * The question is about the list of reciters, so it is answered on the
 * list of reciters: one folder read, then every row knows whether it
 * offers a download or a delete. These tests pin both halves — the read
 * that makes it possible, and the fact that the card did not quietly
 * come back.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  downloadedReciters,
  totalAyahCount,
} from '../src/quran/audio/audioStore';

const fs = ReactNativeBlobUtil.fs as unknown as {
  exists: jest.Mock;
  ls: jest.Mock;
  lstat: jest.Mock;
};

const BASE = '/mock/documents/quran/audio';

/** An lstat entry the way blob-util shapes it. */
const mp3 = (n: number, size: number) => ({
  filename: `${String(n).padStart(6, '0')}.mp3`,
  size,
});

function folders(map: Record<string, { filename: string; size: number }[]>) {
  fs.exists.mockImplementation(async (path: string) =>
    path === BASE || Object.keys(map).some(id => path === `${BASE}/${id}`),
  );
  fs.ls.mockImplementation(async (path: string) =>
    path === BASE ? Object.keys(map) : [],
  );
  fs.lstat.mockImplementation(async (path: string) => {
    const id = path.slice(`${BASE}/`.length);
    return map[id] ?? [];
  });
}

describe('one read answers for the whole catalog', () => {
  afterEach(() => {
    fs.exists.mockReset();
    fs.ls.mockReset();
    fs.lstat.mockReset();
  });

  it('returns a row only for reciters with audio on disk', async () => {
    folders({
      husary: [mp3(1, 300_000), mp3(2, 250_000)],
      alafasy: [mp3(1, 400_000)],
    });
    const map = await downloadedReciters();
    expect(Object.keys(map).sort()).toEqual(['alafasy', 'husary']);
    expect(map.husary.files).toBe(2);
    expect(map.husary.bytes).toBe(550_000);
  });

  it('does not offer to delete what a cancelled run left behind', async () => {
    // An empty folder, or one holding only the truncated file a cancel
    // interrupted, is not a download. A row that offered "delete" for it
    // would be offering to delete nothing — and, worse, would answer
    // "yes, you have this offline" when the person does not.
    folders({ husary: [], shatri: [mp3(1, 40)], minshawi: [mp3(1, 200_000)] });
    const map = await downloadedReciters();
    expect(Object.keys(map)).toEqual(['minshawi']);
  });

  it('marks a reciter complete only at the full muṣḥaf', async () => {
    const all = Array.from({ length: totalAyahCount() }, (_, i) =>
      mp3(i + 1, 120_000),
    );
    folders({ husary: all, alafasy: all.slice(0, 10) });
    const map = await downloadedReciters();
    expect(map.husary.complete).toBe(true);
    expect(map.alafasy.complete).toBe(false);
    expect(map.alafasy.files).toBe(10);
  });

  it('is empty, not broken, when nothing was ever downloaded', async () => {
    fs.exists.mockResolvedValue(false);
    await expect(downloadedReciters()).resolves.toEqual({});
  });

  it('survives a folder it cannot read', async () => {
    // A permissions error or a half-migrated Documents dir must not take
    // the picker down — every row simply offers a download.
    fs.exists.mockResolvedValue(true);
    fs.ls.mockRejectedValue(new Error('EACCES'));
    await expect(downloadedReciters()).resolves.toEqual({});
  });
});

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('the card is gone and the controls are on the rows', () => {
  const picker = src('src/quran/audio/ReciterPickerSheet.tsx');
  const tilawah = src('src/screens/quran/TilawahScreen.tsx');

  it('leaves no download UI on the listening page', () => {
    // The whole point of the move: Tilāwah renders a player and a surah
    // list, and nothing about bytes.
    expect(tilawah).not.toMatch(/listenKeepOnDevice|listenDownloadCard/);
    expect(tilawah).not.toMatch(/startQuranDownload|deleteReciterAudio/);
    expect(tilawah).not.toMatch(/reciterAudioStats/);
  });

  it('gives each picker row exactly one verb', () => {
    // Fetch it, stop fetching it, or delete it — the row picks one, so a
    // download button can never sit next to a delete button for the same
    // reciter.
    expect(picker).toContain('downloadedReciters');
    expect(picker).toContain('startQuranDownload');
    expect(picker).toContain('cancelQuranDownload');
    expect(picker).toContain('deleteReciterAudio');
    const running = picker.indexOf('{running ? (');
    const stats = picker.indexOf(') : stats ? (', running);
    const download = picker.indexOf(') : (', stats);
    expect(running).toBeGreaterThan(0);
    expect(stats).toBeGreaterThan(running);
    expect(download).toBeGreaterThan(stats);
  });

  it('draws the trash rather than borrowing an emoji', () => {
    // 🗑 is a colour glyph on Android: it ignores the danger colour and
    // lands as the only blue thing on a green-and-grey sheet. The drawn
    // one takes the palette like every other destructive control.
    expect(picker).not.toMatch(/[\u{1F5D1}\u{1F5D2}\u{1F5D3}]/u);
    expect(picker).toContain('TrashGlyph');
    expect(picker).toMatch(/trashHandle|trashLid|trashBody/);
  });

  it('asks twice before deleting a gigabyte', () => {
    // One mis-tap must not cost an hour of downloading back. The confirm
    // is in place rather than a dialog, because a modal opened from
    // inside a modal sheet is not reliably drawn on Android.
    expect(picker).toContain('confirming');
    expect(picker).toContain('common.confirmDelete');
    expect(picker).toMatch(/if \(!asking\) \{\s*setConfirming\(item\.id\);/);
    expect(picker).not.toMatch(/Alert\.alert/);
  });

  it('clears a pending confirm when the sheet closes', () => {
    // Reopening the sheet must not land on a primed delete button.
    expect(picker).toMatch(/if \(!visible\) \{\s*setConfirming\(null\);/);
  });

  it('re-reads the disk when a download stops running', () => {
    // The moment a download ends is the moment every size on screen is
    // wrong, and the row is still offering "download".
    expect(picker).toMatch(/\[visible, refresh, download\.running\]/);
  });

  it('labels every control for a screen reader', () => {
    for (const key of [
      'common.cancel',
      'quran.listenDeleteAudio',
      'quran.listenDownloadReciter',
    ]) {
      expect(picker).toContain(key);
    }
  });
});
