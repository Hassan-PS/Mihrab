/**
 * Offline recitation store — QR-18 (docs/quran-reader-plan.md).
 *
 * Per-surah MP3 downloads into the managed content store:
 *
 *   <Documents>/quran/audio/{reciterId}/{SSS}{AAA}.mp3
 *   <Documents>/quran/timings/{reciterId}.json
 *
 * Same worker-pool + `.part`-then-move pattern as the mushaf store
 * (`mushafDownload.ts`), so a killed app never leaves a truncated MP3
 * where the player would find it.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { mkdirDeep } from '../mushafDownload';
import { SURAHS } from '../quran';
import {
  ayahAudioFileName,
  ayahAudioUrl,
  findReciter,
  reciterTimingsUrl,
  type Reciter,
} from './reciters';

function audioDir(reciterId: string): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/audio/${reciterId}`;
}

function timingsDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/timings`;
}

export function timingsFilePath(reciterId: string): string {
  return `${timingsDir()}/${reciterId}.json`;
}

export function ayahAudioFilePath(
  reciterId: string,
  surah: number,
  ayah: number,
): string {
  return `${audioDir(reciterId)}/${ayahAudioFileName(surah, ayah)}`;
}

async function fileValid(path: string, minBytes = 1000): Promise<boolean> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return false;
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return Number(stat.size) > minBytes;
  } catch {
    return false;
  }
}

/** Is every ayah of a surah on disk for this reciter? */
export async function isSurahDownloaded(
  reciterId: string,
  surah: number,
): Promise<boolean> {
  const meta = SURAHS.find(s => s.number === surah);
  if (!meta) return false;
  for (let a = 1; a <= meta.ayahCount; a++) {
    if (!(await fileValid(ayahAudioFilePath(reciterId, surah, a)))) {
      return false;
    }
  }
  return true;
}

/** Which of an ayah's audio exists locally? Sync-ish helper for queueing. */
export async function localAudioPathIfAny(
  reciterId: string,
  surah: number,
  ayah: number,
): Promise<string | null> {
  const path = ayahAudioFilePath(reciterId, surah, ayah);
  return (await fileValid(path)) ? path : null;
}

export type AudioDownloadProgress = {
  done: number;
  total: number;
  failed: number;
};

export type AudioDownloadHandle = {
  promise: Promise<boolean>;
  cancel: () => void;
};

/** Download one surah's ayah files for a reciter (skips valid files). */
export function downloadSurahAudio(
  reciterId: string,
  surah: number,
  onProgress?: (p: AudioDownloadProgress) => void,
): AudioDownloadHandle {
  const reciter: Reciter = findReciter(reciterId);
  const meta = SURAHS.find(s => s.number === surah);
  const total = meta?.ayahCount ?? 0;
  let cancelled = false;
  let done = 0;
  let failed = 0;

  const run = async (): Promise<boolean> => {
    if (!meta) return false;
    await mkdirDeep(audioDir(reciterId));
    const queue: number[] = [];
    for (let a = 1; a <= meta.ayahCount; a++) queue.push(a);

    const worker = async (): Promise<void> => {
      while (!cancelled) {
        const ayah = queue.shift();
        if (ayah == null) return;
        const path = ayahAudioFilePath(reciterId, surah, ayah);
        try {
          if (!(await fileValid(path))) {
            // Up to 3 attempts — transient stream resets are common on
            // multiplexed CDN connections (same pattern as mushafDownload).
            let ok = false;
            let lastError: unknown = null;
            for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
              const tmp = `${path}.part`;
              try {
                // No RNBlobUtil `timeout` config — it breaks Android
                // downloads outright; JS watchdog below covers hangs.
                const task = ReactNativeBlobUtil.config({
                  path: tmp,
                  overwrite: true,
                }).fetch('GET', ayahAudioUrl(reciter, surah, ayah));
                let watchdog: ReturnType<typeof setTimeout> | null = null;
                const res = await Promise.race([
                  task,
                  new Promise<never>((_, reject) => {
                    watchdog = setTimeout(() => {
                      task.cancel(() => undefined);
                      reject(new Error('audio fetch timed out'));
                    }, 60_000);
                  }),
                ]).finally(() => {
                  if (watchdog != null) clearTimeout(watchdog);
                });
                const stat = await ReactNativeBlobUtil.fs
                  .stat(tmp)
                  .catch(() => null);
                if (
                  res.info().status !== 200 ||
                  !stat ||
                  Number(stat.size) <= 1000
                ) {
                  throw new Error(`ayah ${surah}:${ayah}`);
                }
                await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
                await ReactNativeBlobUtil.fs.mv(tmp, path);
                ok = true;
              } catch (e) {
                lastError = e;
                await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
                if (attempt < 3) {
                  await new Promise<void>(r => setTimeout(r, 400 * attempt));
                }
              }
            }
            if (!ok) {
              throw lastError instanceof Error
                ? lastError
                : new Error(String(lastError));
            }
          }
        } catch {
          failed += 1;
        } finally {
          done += 1;
          onProgress?.({ done, total, failed });
        }
      }
    };

    await Promise.all(Array.from({ length: 4 }, () => worker()));
    return !cancelled && failed === 0;
  };

  return {
    promise: run(),
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Delete all downloaded audio for one reciter. */
export async function deleteReciterAudio(reciterId: string): Promise<void> {
  try {
    await ReactNativeBlobUtil.fs.unlink(audioDir(reciterId));
  } catch {
    /* already gone */
  }
}

/** Bytes on disk across all reciters (Manage downloads UI). */
export async function audioDiskUsage(): Promise<number> {
  try {
    const base = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/audio`;
    if (!(await ReactNativeBlobUtil.fs.exists(base))) return 0;
    let sum = 0;
    const reciterDirs = await ReactNativeBlobUtil.fs.ls(base);
    for (const dir of reciterDirs) {
      const files = await ReactNativeBlobUtil.fs
        .lstat(`${base}/${dir}`)
        .catch(() => []);
      for (const f of files) sum += Number(f.size) || 0;
    }
    return sum;
  } catch {
    return 0;
  }
}

/**
 * Fetch (once) and cache a reciter's word-timing JSON. Resolves null on
 * any failure — word highlighting is strictly best-effort and must never
 * block playback.
 */
export async function loadReciterTimings(
  reciterId: string,
): Promise<{ [key: string]: number[][] } | null> {
  const path = timingsFilePath(reciterId);
  try {
    if (!(await fileValid(path, 10_000))) {
      await mkdirDeep(timingsDir());
      const tmp = `${path}.part`;
      const res = await ReactNativeBlobUtil.config({
        path: tmp,
        overwrite: true,
      }).fetch('GET', reciterTimingsUrl(findReciter(reciterId)));
      if (res.info().status !== 200) {
        await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
        return null;
      }
      await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
      await ReactNativeBlobUtil.fs.mv(tmp, path);
    }
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    return JSON.parse(String(raw));
  } catch (e) {
    console.warn('audioStore: timings unavailable', e);
    return null;
  }
}
