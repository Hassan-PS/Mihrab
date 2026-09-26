/**
 * Turning the tajwīd colours on starts their download.
 *
 * ── WHY THE SWITCH, AND NOT A BUTTON ──────────────────────────────────
 *
 * The coloured pages are a second set of page fonts, and they arrive the
 * way the plain muṣḥaf's do: page by page as they are read, or all at once
 * from a row in Settings. The row was the only way to get the whole set,
 * and it was under a heading most people never open — so the colours were
 * switched on, the reader coloured the page it was on, and every page
 * turn after that waited on the network. The plain muṣḥaf does not work
 * like that: opening the reader the first time fetches the whole book
 * once, in the background, with a bar in the shade, and the pages fill in
 * as they land. The colours now do the same, and the switch is what asks.
 *
 * ── WHICH PALETTE ─────────────────────────────────────────────────────
 *
 * A font carries one palette, so light pages and dark pages are two sets
 * of ~170 MB. The one the muṣḥaf is drawn in now goes first. The other is
 * queued behind it only when the page tone is AUTO — following the app,
 * which follows the phone, so a reader on auto reads in both palettes
 * over a day and would be waiting on the network again at dusk. On a
 * fixed tone the other palette is a row in Settings, as it was.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────
 *
 * It does not start on a plain muṣḥaf that is not yet on the device: the
 * reader's own gate owns that first download and the consent that goes
 * with it, and 180 MB of book comes before 170 MB of colour. It does not
 * start over a metered connection unless the person already chose to
 * read on one — the same rule as the resume watcher. And turning the
 * switch OFF cancels a colour download in flight, and forgets the one
 * queued behind it: the colours were asked for, and now they are not.
 *
 * Every switch in the app — Settings, the guide, the ayah sheet's
 * "show me" — goes through the same preference, so this watches the
 * preference rather than the switches.
 */
import { Appearance } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { getQuranState, subscribeQuranState } from './quranState';
import { fontStoreKnownComplete, fontStoreStats, tajweedFontSet } from './mushafFontStore';
import type { MushafFontSet } from './mushafFontStore';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import { mushafTone, mushafToneChoice, toneIsDark } from './mushafTone';
import { riwayahById } from './riwayat';
import {
  cancelQuranDownload,
  dequeueQuranDownload,
  fontSetOf,
  queueQuranDownload,
  quranDownloadState,
} from './quranDownloadManager';
import { isFreeConnection } from './quranDownloadResume';

const otherPalette = (set: MushafFontSet): MushafFontSet =>
  set === 'tajweed-dark' ? 'tajweed-light' : 'tajweed-dark';

async function storeComplete(set: MushafFontSet): Promise<boolean> {
  if (fontStoreKnownComplete(set)) return true;
  const stats = await fontStoreStats(set);
  return stats.pages >= MUSHAF_TOTAL_PAGES && stats.stalePages.length === 0;
}

/**
 * What the switch going ON asks for, in order — or nothing. Pure apart
 * from the disk: exported so the rule can be tested without a watcher.
 */
export async function tajweedSetsToFetch(input: {
  hafs: boolean;
  inUse: MushafFontSet;
  toneAuto: boolean;
  plainMushafOnDevice: boolean;
}): Promise<MushafFontSet[]> {
  if (!input.hafs || !input.plainMushafOnDevice) return [];
  const wanted = input.toneAuto ? [input.inUse, otherPalette(input.inUse)] : [input.inUse];
  const out: MushafFontSet[] = [];
  for (const set of wanted) {
    if (!(await storeComplete(set))) out.push(set);
  }
  return out;
}

async function onSwitchedOn(): Promise<void> {
  const { prefs } = getQuranState();
  const hafs = riwayahById(prefs.riwayah).render !== 'unicode';
  const appDark = Appearance.getColorScheme() === 'dark';
  const inUse = tajweedFontSet(toneIsDark(mushafTone(prefs, appDark)));
  const sets = await tajweedSetsToFetch({
    hafs,
    inUse,
    toneAuto: mushafToneChoice(prefs) === 'auto',
    plainMushafOnDevice: await storeComplete('v2'),
  });
  if (sets.length === 0) return;
  // The same courtesy as the resume watcher: a download this size is not
  // started on someone's data plan by a switch that says nothing about
  // megabytes. Wi-Fi, or a connection the phone does not call expensive.
  const net = await NetInfo.fetch().catch(() => null);
  if (!isFreeConnection(net)) return;
  // The switch may have gone off again while the disk was being asked.
  if (!getQuranState().prefs.tajweedColours) return;
  for (const set of sets) queueQuranDownload({ kind: 'fonts', set });
}

function onSwitchedOff(): void {
  const running = quranDownloadState().running;
  if (running?.kind === 'fonts' && fontSetOf(running) !== 'v2') cancelQuranDownload();
  dequeueQuranDownload({ kind: 'fonts', set: 'tajweed-light' });
  dequeueQuranDownload({ kind: 'fonts', set: 'tajweed-dark' });
}

/**
 * Watch the preference for the rest of the app's life. Returns the
 * unsubscribe, for the root effect that installs it.
 */
export function startTajweedAutoDownload(): () => void {
  let last = getQuranState().prefs.tajweedColours;
  return subscribeQuranState(() => {
    const next = getQuranState().prefs.tajweedColours;
    if (next === last) return;
    last = next;
    if (next) onSwitchedOn().catch(() => undefined);
    else onSwitchedOff();
  });
}
