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
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { resolveRiwayah, riwayahById } from './riwayat';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import {
  deleteLegacyImageStore,
  legacyImageStoreBytes,
  type MushafDownloadProgress,
} from './mushafDownload';
import { fontStoreStats } from './mushafFontStore';
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

export function MushafReader(props: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const quran = useQuranState();

  /**
   * A `unicode` riwayah has no page fonts — its text and its face are in
   * the build (docs/design/riwayat-plan.md §2). So it walks past the gate
   * rather than being asked for 180 MB it would never use.
   */
  const riwayah = resolveRiwayah(quran.prefs.riwayah);
  const bundledRiwayah = riwayahById(riwayah).render === 'unicode';

  // ── The gate ────────────────────────────────────────────────────────
  const [downloadStatus, setDownloadStatus] = useState<
    'checking' | 'needs_download' | 'downloading' | 'ready'
  >('checking');
  const [progress, setProgress] = useState<MushafDownloadProgress>({
    done: 0,
    total: MUSHAF_TOTAL_PAGES,
    failed: 0,
  });
  const [lastRunFailed, setLastRunFailed] = useState(0);
  /** Bytes the retired page-image store is still occupying, if any. */
  const [staleImageBytes, setStaleImageBytes] = useState(0);

  useEffect(() => {
    if (bundledRiwayah) {
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
  if (downloadStatus === 'checking') {
    return (
      <View style={[styles.gate, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.accentSolid} size="large" />
      </View>
    );
  }
  if (downloadStatus === 'needs_download') {
    const cta =
      lastRunFailed > 0
        ? t('quran.mushafDownloadRetryCta', 'Retry missing pages')
        : t('quran.mushafDownloadCta', {
            defaultValue: 'Download mushaf (~{{size}} MB)',
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
  if (downloadStatus === 'downloading') {
    const pct =
      progress.total > 0
        ? Math.round((progress.done / progress.total) * 100)
        : 0;
    return (
      <View style={[styles.gate, { backgroundColor: palette.bg }]}>
        <Text style={[styles.gateTitle, { color: palette.text }]}>
          {t('quran.mushafDownloading', 'Downloading mushaf…')}
        </Text>
        <Text style={[styles.progressLabel, { color: palette.muted }]}>
          {t('quran.mushafDownloadProgress', '{{done}} / {{total}} pages · {{pct}}%', {
            done: progress.done,
            total: progress.total,
            pct,
          })}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: palette.accentBg }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${pct}%`, backgroundColor: palette.accentSolid },
            ]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
          onPress={() => cancelMushafDownload()}
          style={styles.cancelBtn}>
          <Text style={[styles.cancelLabel, { color: palette.accentSolid }]}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── The route ───────────────────────────────────────────────────────
  // Answered once, at module scope: a phone cannot become an iPad
  // mid-session, only its window can change size, and each reader handles
  // its own window from here.
  const readerProps: MushafReaderProps = { ...props, keyTurn: keyTurnRef };
  return DEVICE_CLASS === 'phone' ? (
    <MushafPhoneReader {...readerProps} />
  ) : (
    <MushafSpreadReader {...readerProps} />
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
  progressLabel: { fontSize: 13, fontVariant: ['tabular-nums'] },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: '100%' },
  cancelBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8 },
  cancelLabel: { fontSize: 14, fontWeight: '600' },
});
