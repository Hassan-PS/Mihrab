/**
 * Silent warm-up of the mushaf page-font store.
 *
 * Until now a page's font was fetched the first time you turned to that page:
 * ~300 KB over the network, with the page showing a spinner until it landed.
 * Read straight through and you pay that 604 times, always at the moment you
 * wanted to read. The files are kept, so it was never a repeated download —
 * but it was a repeated *wait*, and it made the mushaf feel like it was
 * loading forever.
 *
 * So fetch the lot, once, in the background, and never wait again.
 *
 * ## Wi-Fi only, and why that is not negotiable
 *
 * The complete set is **180 MB**. Pulling that down a metered connection
 * because someone installed a prayer-times app would be indefensible, so the
 * warm-up runs only while the device is on Wi-Fi and stops the moment it
 * leaves — the same rule the app already applies to its 12-month prayer-time
 * sync (`usePrayerDay`). Interrupted work is not lost: every font that landed
 * stays on disk, and the next Wi-Fi window picks up where this one stopped.
 *
 * ## Once, and only once
 *
 * "Done" is recorded against the font release tag, not the app version. The
 * fonts do not change when the app updates, so an update must not re-download
 * 180 MB; it should only make sure nothing is missing, which a user who
 * already finished has covered by the marker and a user who has not gets by
 * the warm-up simply continuing. Bumping `FONT_RELEASE` — the one event that
 * really does invalidate every file — clears the marker by not matching it.
 *
 * Deleting the fonts from Manage downloads clears the marker too, otherwise
 * the store could never refill.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import {
  FONT_RELEASE,
  downloadAllPageFonts,
  fontStoreStats,
  type FontDownloadHandle,
} from './mushafFontStore';

const MARKER_KEY = 'mihrab.quran.fontWarmup.v1';

/**
 * Gentler than the six the manual "download for offline" uses: this one runs
 * unannounced, possibly while the user is reading, and has all the time in
 * the world.
 */
const BACKGROUND_CONCURRENCY = 3;

type Marker = {
  /** Which font release the store was filled from. */
  release: string;
  /** How many pages were on disk when it finished. */
  pages: number;
  at: number;
};

async function readMarker(): Promise<Marker | null> {
  try {
    const raw = await AsyncStorage.getItem(MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Marker>;
    if (typeof parsed?.release !== 'string') return null;
    return {
      release: parsed.release,
      pages: Number(parsed.pages ?? 0),
      at: Number(parsed.at ?? 0),
    };
  } catch {
    return null;
  }
}

async function writeMarker(pages: number): Promise<void> {
  const marker: Marker = { release: FONT_RELEASE, pages, at: Date.now() };
  await AsyncStorage.setItem(MARKER_KEY, JSON.stringify(marker)).catch(
    () => undefined,
  );
}

/** Forget that the store was ever filled — call when the fonts are deleted. */
export async function clearFontWarmupMarker(): Promise<void> {
  await AsyncStorage.removeItem(MARKER_KEY).catch(() => undefined);
}

/**
 * Is there anything left to do?
 *
 * The marker alone decides, so the common case costs one AsyncStorage read
 * rather than 604 stat calls. A marker from a different release is ignored.
 */
export async function fontWarmupNeeded(): Promise<boolean> {
  const marker = await readMarker();
  if (marker?.release === FONT_RELEASE && marker.pages >= MUSHAF_TOTAL_PAGES) {
    return false;
  }
  // No usable marker: it is still possible every font is already on disk —
  // someone who used "download for offline" before this existed, say — so
  // check the store before pulling anything, and record it if so.
  const stats = await fontStoreStats();
  if (stats.pages >= MUSHAF_TOTAL_PAGES) {
    await writeMarker(stats.pages);
    return false;
  }
  return true;
}

function isUnmetered(state: NetInfoState | null): boolean {
  if (!state?.isConnected) return false;
  // `isInternetReachable` is null while NetInfo is still probing; only an
  // explicit false means there is no route out.
  if (state.isInternetReachable === false) return false;
  return state.type === 'wifi' || state.type === 'ethernet';
}

export type FontWarmupController = { stop: () => void };

/**
 * Start watching for a Wi-Fi window and fill the font store in it.
 *
 * Idempotent and safe to call on every app start: it returns immediately when
 * the store is already complete. The returned `stop` cancels any download in
 * flight and unsubscribes.
 */
export function startFontWarmup(): FontWarmupController {
  let stopped = false;
  let running: FontDownloadHandle | null = null;
  let unsubscribe: (() => void) | null = null;

  const finish = () => {
    running?.cancel();
    running = null;
    unsubscribe?.();
    unsubscribe = null;
  };

  const begin = () => {
    if (stopped || running) return;
    const handle = downloadAllPageFonts({
      concurrency: BACKGROUND_CONCURRENCY,
    });
    running = handle;
    void handle.promise
      .then(async ok => {
        if (running !== handle) return; // cancelled and replaced
        running = null;
        if (!ok) return; // cancelled, or some pages failed — try again later
        const stats = await fontStoreStats();
        if (stats.pages >= MUSHAF_TOTAL_PAGES) {
          await writeMarker(stats.pages);
          finish();
        }
      })
      .catch(() => {
        if (running === handle) running = null;
      });
  };

  void (async () => {
    if (!(await fontWarmupNeeded()) || stopped) return;
    unsubscribe = NetInfo.addEventListener(state => {
      if (stopped) return;
      if (isUnmetered(state)) {
        begin();
      } else {
        // Left Wi-Fi. Everything already fetched stays; the next window
        // resumes from there.
        running?.cancel();
        running = null;
      }
    });
    // addEventListener fires with the current state on subscribe on both
    // platforms, but ask explicitly so a missed initial event cannot leave the
    // warm-up asleep until the connection next changes.
    const now = await NetInfo.fetch().catch(() => null);
    if (!stopped && isUnmetered(now)) begin();
  })();

  return {
    stop: () => {
      stopped = true;
      finish();
    },
  };
}
