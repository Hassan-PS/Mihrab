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
import { useHeaderHeight } from '@react-navigation/elements';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { resolveRiwayah, riwayahById } from './riwayat';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import {
  deleteLegacyImageStore,
  legacyImageStoreBytes,
  type MushafDownloadProgress,
} from './mushafDownload';
import { fontStoreKnownComplete, fontStoreStats } from './mushafFontStore';
import {
  cancelMushafDownload,
  mushafDownloadState,
  startMushafDownload,
  subscribeMushafDownload,
} from './mushafDownloadManager';
import { DEVICE_CLASS } from '../responsive/deviceClass';
import { MushafPhoneReader } from './MushafPhoneReader';
import { MushafSpreadReader } from './MushafSpreadReader';
import { useQuranState } from './quranState';
import { type MushafReaderProps } from './mushafReaderCore';
import { useKeyPaging, type PageTurner } from './useKeyPaging';

type Props = Omit<MushafReaderProps, 'keyTurn'>;

/** The complete Ḥafṣ font set, as the download button says it. */
const FONT_SET_MB = 180;

/** The strip's own breathing room above its row, dp. */
const STRIP_PADDING_TOP = 6;

export function MushafReader(props: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const quran = useQuranState();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  /**
   * What the download strip has to clear above it — see where it is used.
   * Android's header is opaque and in flow, so nothing.
   */
  const stripTop =
    Platform.OS !== 'ios' ? 0 : props.isFullscreen ? insets.top : headerHeight;

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
  const [progress, setProgress] = useState<MushafDownloadProgress>({
    done: 0,
    total: MUSHAF_TOTAL_PAGES,
    failed: 0,
  });
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
   * Re-render the progress bar when the whole percent changes, not on every
   * one of 604 files. The extra ~500 renders land on the same JS thread the
   * downloads are being driven from, and the bar cannot show them anyway: it
   * is 300 dp wide, so a file is a third of a pixel.
   */
  const lastPctRef = useRef(-1);
  const publishProgress = useCallback((p: MushafDownloadProgress) => {
    const pct = p.total > 0 ? Math.floor((p.done / p.total) * 100) : 0;
    if (pct === lastPctRef.current && p.done !== p.total) return;
    lastPctRef.current = pct;
    setProgress(p);
  }, []);

  /**
   * Follow the download wherever it was started from.
   *
   * The download outlives this screen — see mushafDownloadManager — so what
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
    const apply = (s: ReturnType<typeof mushafDownloadState>) => {
      if (s.running) {
        setDownloadStatus('downloading');
        if (s.progress.total > 0) publishProgress(s.progress);
        return;
      }
      if (!s.last) return;
      setLastRunFailed(s.last.complete ? 0 : s.last.failed);
      setDownloadStatus(s.last.complete ? 'ready' : 'needs_download');
    };
    apply(mushafDownloadState());
    return subscribeMushafDownload(apply);
  }, [bundledRiwayah, publishProgress]);

  const startDownload = () => {
    if (downloadStatus === 'downloading') return;
    setDownloadStatus('downloading');
    setReading(true);
    lastPctRef.current = -1;
    setProgress({ done: 0, total: MUSHAF_TOTAL_PAGES, failed: 0 });
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
    startMushafDownload('fonts');
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
  // While the bulk download runs, the reader carries a line saying how far
  // it has got, with the one control that matters. It leaves when the
  // download does, however the download ends.
  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const strip =
    downloadStatus === 'downloading' ? (
      <View
        style={[
          styles.strip,
          {
            backgroundColor: palette.card,
            borderBottomColor: palette.border,
            // iOS floats a translucent navigation header OVER the content,
            // so a strip at the top of the screen was drawn UNDER it: the
            // percentage sat behind the blur and the Cancel button behind
            // the header's own chips. The reader below does the same thing
            // with `navPad` — this is the one piece of chrome that is
            // ABOVE the reader and so has to do it for itself. In
            // fullscreen there is no header and the status bar is hidden,
            // so the strip only clears the cutout.
            paddingTop: stripTop + STRIP_PADDING_TOP,
          },
        ]}>
        <View style={styles.stripRow}>
          <Text
            style={[styles.stripLabel, { color: palette.muted }]}
            numberOfLines={1}>
            {t('quran.mushafDownloadStrip', {
              defaultValue: 'Downloading the mushaf · {{pct}}%',
              pct,
            })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            hitSlop={10}
            onPress={() => cancelMushafDownload()}>
            <Text style={[styles.stripCancel, { color: palette.accentSolid }]}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </View>
        <View style={[styles.stripTrack, { backgroundColor: palette.accentBg }]}>
          <View
            style={[
              styles.stripFill,
              { width: `${pct}%`, backgroundColor: palette.accentSolid },
            ]}
          />
        </View>
      </View>
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
    paddingHorizontal: 32,
    gap: 16,
  },
  gateTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  gateBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  cta: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaLabel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  withStrip: { flex: 1 },
  strip: {
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 5,
  },
  stripLabel: { fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 1 },
  stripCancel: { fontSize: 12, fontWeight: '700' },
  stripTrack: { height: 3, overflow: 'hidden' },
  stripFill: { height: '100%' },
});
