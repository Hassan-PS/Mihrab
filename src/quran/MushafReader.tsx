/**
 * The muṣḥaf's front door: the download gate, and the device-class router.
 *
 * This file used to be the reader. It was 1,500 lines — the image-era
 * pager with its windowed strip, crop geometry and render cache — and when
 * the font-rendered readers replaced it (docs/mushaf-reader-split-plan.md)
 * the plan's last step was to delete it. The step slipped, and for the
 * next fifteen releases every open of the muṣḥaf mounted forty-odd hooks
 * of a reader that rendered nothing, activated keep-awake a second time,
 * and kept a second writer alive for the header title. Nothing could
 * choose the image renderer any more; it survived only as a preference
 * no screen had ever set.
 *
 * What is left is the two things that sit in front of BOTH readers:
 *
 *   • the gate — nothing opens until the muṣḥaf is on the device, and the
 *     Ḥafṣ fonts are ~180 MB, which is far too much to fetch unasked;
 *   • the route — phones get `MushafPhoneReader`, everything larger gets
 *     `MushafSpreadReader`, decided once from `DEVICE_CLASS`.
 *
 * The keyboard is bound here too, once, because the arrows belong to the
 * Quran reader as a whole and the two readers are how it draws itself on a
 * phone and on a large screen, not separate features. Whichever one
 * renders publishes its page turn into `keyTurn`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDisplayCutout } from '../native/DisplayCutout';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { resolveRiwayah, riwayahById } from './riwayat';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import {
  deleteLegacyImageStore,
  legacyImageStoreBytes,
} from './mushafDownload';
import { fontStoreKnownComplete, fontStoreStats } from './mushafFontStore';
import {
  quranDownloadState,
  startQuranDownload,
  subscribeQuranDownload,
} from './quranDownloadManager';
import {
  QuranDownloadStripView,
  useQuranDownloadRun,
} from './QuranDownloadStrip';
import { DEVICE_CLASS } from '../responsive/deviceClass';
import { MushafPhoneReader } from './MushafPhoneReader';
import { MushafSpreadReader } from './MushafSpreadReader';
import { useQuranState } from './quranState';
import { type MushafReaderProps } from './mushafReaderCore';
import { useKeyPaging, type PageTurner } from './useKeyPaging';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

type Props = Omit<MushafReaderProps, 'keyTurn'>;

/** The complete Ḥafṣ font set, as the download button says it. */
const FONT_SET_MB = 180;

export function MushafReader(props: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const quran = useQuranState();
  /**
   * Whatever the app is downloading, if anything.
   *
   * The reader draws the strip for ALL of them, not only its own fonts —
   * a per-surah tilāwah download is started from the ayah sheet, which is
   * hosted here and then dismissed, so this is where it has to be visible.
   * The gate below still cares only about `fonts`.
   */
  const run = useQuranDownloadRun();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  /**
   * What the download strip has to clear above it — see where it is used.
   * Android's header is opaque and in flow, so nothing while it is shown.
   * In fullscreen the status bar is hidden and the window runs to the top
   * edge, so the strip has to clear the camera itself: it used to sit at
   * y = 0 with the percentage under the lens. The cutout's own inset is
   * the answer (the safe-area top can read 0 there, with the bar hidden).
   */
  const cutout = useDisplayCutout();
  const stripTop =
    Platform.OS !== 'ios'
      ? props.isFullscreen
        ? Math.max(cutout.top, insets.top)
        : 0
      : props.isFullscreen
        ? insets.top
        : headerHeight;

  /**
   * A `unicode` riwayah has no page fonts — its text and its face are in
   * the build (docs/design/riwayat-plan.md §2). So it walks past the gate
   * rather than being asked for 180 MB it would never use.
   */
  const riwayah = resolveRiwayah(quran.prefs.riwayah);
  const bundledRiwayah = riwayahById(riwayah).render === 'unicode';

  // ── The gate ────────────────────────────────────────────────────────
  // Opens on what this process already knows: a bundled riwayah needs
  // nothing, and a font store seen complete once this session is complete
  // now. Only the first open of a session, with fonts, waits on the disk.
  const [downloadStatus, setDownloadStatus] = useState<
    'checking' | 'needs_download' | 'downloading' | 'ready'
  >(() => (bundledRiwayah || fontStoreKnownComplete() ? 'ready' : 'checking'));
  const [lastRunFailed, setLastRunFailed] = useState(0);
  /** Bytes the retired page-image store is still occupying, if any. */
  const [staleImageBytes, setStaleImageBytes] = useState(0);
  /**
   * THE READER OPENS THE MOMENT THE DOWNLOAD STARTS.
   *
   * Nobody read anything until all 180 MB had landed: the gate held a
   * progress bar in front of the muṣḥaf for as long as six hundred files
   * took, on a phone, on whatever network it had. But a page needs only
   * its own font, the surface already fetches that on demand, and the
   * pages either side are warmed ahead — so once the download has been
   * asked for, the reader can simply open, draw the page it is on as its
   * font arrives, and carry a slim strip saying how the rest is going.
   *
   * Once true, true for the mount: a cancelled or failed run takes the
   * strip away, never the book — the pages still arrive one by one.
   */
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (bundledRiwayah || fontStoreKnownComplete()) {
      // Nothing to fetch and nothing to check: the muṣḥaf is already here.
      setDownloadStatus('ready');
      return undefined;
    }
    let cancelled = false;
    // Ask once, and then never wait again: fetching each page's font on
    // arrival made the reader feel permanently loading.
    void Promise.all([fontStoreStats(), legacyImageStoreBytes()]).then(
      ([stats, stale]) => {
        if (cancelled) return;
        setStaleImageBytes(stale);
        setDownloadStatus(
          stats.pages >= MUSHAF_TOTAL_PAGES ? 'ready' : 'needs_download',
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bundledRiwayah]);

  /**
   * Follow the download wherever it was started from.
   *
   * The download outlives this screen — see quranDownloadManager — so what
   * a mount does is ASK what is happening rather than start or stop
   * anything. Coming back to a reader that is halfway through six hundred
   * pages shows the bar where it actually is, and a run that finished while
   * the user was elsewhere is reported the moment they return.
   */
  useEffect(() => {
    // A bundled riwayah has no stake in any of this. Without the guard a
    // half-finished Ḥafṣ font run — remembered by the manager across
    // screens — would put its gate in front of a muṣḥaf that is already
    // on the device and needs nothing.
    if (bundledRiwayah) return undefined;
    const apply = (s: ReturnType<typeof quranDownloadState>) => {
      // The manager also runs the recitation downloads now. A reciter
      // arriving in the background is not this gate's business, and
      // reporting it here would put a mushaf progress bar in front of a
      // book that is already on the device.
      if (s.running) {
        if (s.running.kind !== 'fonts') return;
        setDownloadStatus('downloading');
        return;
      }
      if (!s.last || s.last.job.kind !== 'fonts') return;
      setLastRunFailed(s.last.complete ? 0 : s.last.failed);
      setDownloadStatus(s.last.complete ? 'ready' : 'needs_download');
    };
    apply(quranDownloadState());
    return subscribeQuranDownload(apply);
  }, [bundledRiwayah]);

  const startDownload = () => {
    if (downloadStatus === 'downloading') return;
    setDownloadStatus('downloading');
    setReading(true);
    // Out with the old first. An updated app may still be carrying the page
    // images the font reader replaced — nothing will ever read them again,
    // and they are larger than what we are about to fetch. Before the
    // download rather than after, so the peak disk use is never both.
    void deleteLegacyImageStore().then(freed => {
      if (freed > 0) setStaleImageBytes(0);
    });
    // The manager owns it from here: it keeps running when this screen goes
    // away, posts the progress notification, and tells whoever is listening
    // how it ended. The subscription above is what updates this screen.
    startQuranDownload({ kind: 'fonts' });
  };

  // ── The keyboard, bound once ────────────────────────────────────────
  const keyTurnRef = useRef<PageTurner | null>(null);
  const turnForward = useCallback(() => keyTurnRef.current?.(1), []);
  const turnBack = useCallback(() => keyTurnRef.current?.(-1), []);
  useKeyPaging(turnForward, turnBack);

  // ── Gate screens ────────────────────────────────────────────────────
  if (downloadStatus === 'checking' && !reading) {
    return (
      <View style={[styles.gate, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.accentSolid} size="large" />
      </View>
    );
  }
  if (downloadStatus === 'needs_download' && !reading) {
    const cta =
      lastRunFailed > 0
        ? t('quran.mushafDownloadRetryCta', 'Retry missing pages')
        : t('quran.mushafDownloadReadCta', {
            defaultValue: 'Download and start reading (~{{size}} MB)',
            size: FONT_SET_MB,
          });
    return (
      <View style={[styles.gate, { backgroundColor: palette.bg }]}>
        <Text style={[styles.gateTitle, { color: palette.text }]}>
          {t('quran.mushafDownloadTitle', 'Download the mushaf')}
        </Text>
        <Text style={[styles.gateBody, { color: palette.muted }]}>
          {lastRunFailed > 0
            ? t('quran.mushafDownloadRetryBody', {
                defaultValue:
                  '{{count}} pages did not download. Retry to fetch the missing pages — everything already downloaded is kept.',
                count: lastRunFailed,
              })
            : t('quran.mushafDownloadBody', {
                defaultValue:
                  'The Madinah mushaf is around {{size}} MB. It is not bundled in the app — download it once and it stays on your device.',
                size: FONT_SET_MB,
              })}
        </Text>
        <Text style={[styles.gateBody, { color: palette.muted }]}>
          {t('quran.mushafDownloadReadHint', {
            defaultValue:
              'Pages appear as they arrive; the rest downloads in the background.',
          })}
        </Text>
        {staleImageBytes > 0 ? (
          <Text style={[styles.gateBody, { color: palette.muted }]}>
            {t('quran.mushafReplaceOldBody', {
              defaultValue:
                'An older copy of the mushaf ({{size}} MB) is still on your device from a previous version. It will be removed first — nothing you have saved is affected.',
              size: Math.round(staleImageBytes / 1_048_576),
            })}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cta}
          onPress={startDownload}
          style={[styles.cta, { backgroundColor: palette.accentSolid }]}>
          <Text style={styles.ctaLabel}>{cta}</Text>
        </Pressable>
      </View>
    );
  }
  // ── The strip ───────────────────────────────────────────────────────
  // While a download runs — the mushaf's fonts, a reciter, or one surah's
  // tilāwah started from the ayah sheet — the reader carries a line saying
  // how far it has got, with the one control that matters. It leaves when
  // the download does, however the download ends.
  //
  // ANY download, not only this screen's own: the ayah sheet's per-surah
  // download is started from inside this reader and then the sheet closes,
  // so without the strip there was nowhere left for it to be seen.
  //
  // `stripTop` is what it has to clear: iOS floats a translucent
  // navigation header OVER the content, so a strip at y = 0 was drawn
  // UNDER it, with the percentage behind the blur and Cancel behind the
  // header's chips. In fullscreen there is no header and the status bar is
  // hidden, so it clears the cutout instead.
  const strip =
    run.running != null ? (
      <QuranDownloadStripView run={run} top={stripTop} />
    ) : null;

  // ── The route ───────────────────────────────────────────────────────
  // Answered once, at module scope: a phone cannot become an iPad
  // mid-session, only its window can change size, and each reader handles
  // its own window from here.
  const readerProps: MushafReaderProps = {
    ...props,
    keyTurn: keyTurnRef,
    // The strip has already padded past iOS's floating header; the reader
    // must not pad past it a second time.
    chromeCleared: strip != null,
  };
  const reader =
    DEVICE_CLASS === 'phone' ? (
      <MushafPhoneReader {...readerProps} />
    ) : (
      <MushafSpreadReader {...readerProps} />
    );
  if (!strip) return reader;
  return (
    <View style={styles.withStrip}>
      {strip}
      {reader}
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.lg,
  },
  gateTitle: { fontSize: TYPE.title2.fontSize, fontWeight: '700', textAlign: 'center' },
  gateBody: { fontSize: TYPE.callout.fontSize, lineHeight: 22, textAlign: 'center' },
  cta: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  ctaLabel: { color: '#ffffff', fontSize: TYPE.body.fontSize, fontWeight: '700' },
  withStrip: { flex: 1 },
});
