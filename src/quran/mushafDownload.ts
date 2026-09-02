/**
 * What the page-image muṣḥaf left behind, and the one helper every store
 * shares.
 *
 * This module was the managed file store for the 604 page PNGs — manifest,
 * integrity sweep, the eight-worker downloader with its RN-fetch fallback
 * transport. The font-rendered reader replaced the images in 2.8.0 and the
 * image reader itself is gone now (docs/mushaf-reader-split-plan.md, step
 * 4), so what is left is:
 *
 *   • `mkdirDeep`, which every on-device store in the Quran module uses,
 *     because `fs.mkdir` is not recursive;
 *   • the retired image store's footprint, and the sweep that reclaims it.
 *     An app that has been UPDATED rather than freshly installed can still
 *     be carrying several hundred megabytes under <Documents>/quran/mushaf
 *     that nothing will ever read again. The download gate removes it
 *     before fetching the fonts, and the downloads screen lists it until
 *     it is gone.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * `fs.mkdir` is NOT recursive — creating `<Documents>/quran/fonts/v2`
 * fails outright while `<Documents>/quran` doesn't exist yet. Create
 * each path segment in turn (EEXIST errors are ignored).
 */
export async function mkdirDeep(path: string): Promise<void> {
  const root = ReactNativeBlobUtil.fs.dirs.DocumentDir;
  if (!path.startsWith(root)) {
    await ReactNativeBlobUtil.fs.mkdir(path).catch(() => undefined);
    return;
  }
  const rel = path.slice(root.length).split('/').filter(Boolean);
  let cur = root;
  for (const seg of rel) {
    cur = `${cur}/${seg}`;
    // eslint-disable-next-line no-await-in-loop
    await ReactNativeBlobUtil.fs.mkdir(cur).catch(() => undefined);
  }
}

/**
 * Everything the retired page-image muṣḥaf left behind: the 604 source
 * PNGs, their manifest, and the display-size render cache beside them.
 * The render cache was a sibling of the versioned page directory, so the
 * parent is what has to be swept.
 */
function imageStoreRoot(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/mushaf`;
}

/** Bytes the retired image store is occupying, 0 when it is already gone. */
export async function legacyImageStoreBytes(): Promise<number> {
  const walk = async (dir: string): Promise<number> => {
    let total = 0;
    let entries: Array<{ path: string; size: string | number; type: string }>;
    try {
      entries = (await ReactNativeBlobUtil.fs.lstat(dir)) as typeof entries;
    } catch {
      return 0;
    }
    for (const entry of entries) {
      if (entry.type === 'directory') total += await walk(entry.path);
      else total += Number(entry.size) || 0;
    }
    return total;
  };
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(imageStoreRoot()))) return 0;
    return await walk(imageStoreRoot());
  } catch {
    return 0;
  }
}

/** Delete the retired image store outright. Returns the bytes reclaimed. */
export async function deleteLegacyImageStore(): Promise<number> {
  const bytes = await legacyImageStoreBytes();
  if (bytes === 0) return 0;
  await ReactNativeBlobUtil.fs.unlink(imageStoreRoot()).catch(() => undefined);
  return bytes;
}

export type MushafDownloadProgress = {
  done: number;
  total: number;
  failed: number;
};

export type MushafDownloadHandle = {
  /** Resolves `true` when every page is on disk, `false` if cancelled or incomplete. */
  promise: Promise<boolean>;
  cancel: () => void;
};
