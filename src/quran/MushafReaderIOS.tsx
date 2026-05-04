/**
 * iOS-only Mushaf reader — task #151, glitch fix in #152.
 *
 * The shared FlatList-based reader (`MushafReader` in QuranSurahScreen.tsx)
 * keeps hitting iOS-specific edge cases when combined with the Arabic
 * in-app locale and the 604-page mushaf data set. Beta.39 introduced this
 * iOS-only file with a 3-slot sliding-window ScrollView; it rendered
 * correctly but produced a visible glitch on every swipe (the previously-
 * shown page flashed for one frame before the new page settled). Root
 * cause: the recenter-after-swipe pattern updated React state and scroll
 * position in two distinct passes, leaving one render frame where they
 * disagreed.
 *
 * This rewrite uses ABSOLUTE POSITIONING inside a 604-page-wide
 * ScrollView. Only 3 page <Image> components are mounted at any time,
 * but each one is positioned at its TRUE x-offset = `(page - 1) *
 * screenWidth`. The user scrolls naturally through the full 604-page
 * width; pagingEnabled snaps to whole pages. After the user swipes,
 * we update `currentPage` from the contentOffset — but the scroll
 * position itself never needs to be recentered because each page's
 * x-position is already correct. No frame mismatch, no glitch.
 *
 * Memory: 3 images mounted. Scroll content size: 604 * screenWidth.
 * Performance: pagingEnabled handles snap/momentum natively.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { findPageForAyah, MUSHAF_PAGES, MUSHAF_SURAHS } from './pages';
import { mushafPageAsset, MUSHAF_TOTAL_PAGES } from './mushafImages';
import {
  downloadMushafAssets,
  isMushafDownloaded,
  type MushafDownloadHandle,
  type MushafDownloadProgress,
} from './mushafDownload';

type Props = {
  surahNumber: number;
  isFullscreen: boolean;
  onExitFullscreen: () => void;
  onTitleChange?: (title: string) => void;
};

const PARCHMENT = '#ffffff';
const ORNAMENT = '#7a5e1f';
const IMAGE_ASPECT = 2600 / 4206; // KFGQPC source page ratio

function easternNumerals(n: number): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(n)
    .split('')
    .map(d => map[Number(d)] ?? d)
    .join('');
}

export function MushafReaderIOS({
  surahNumber,
  isFullscreen,
  onExitFullscreen,
  onTitleChange,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const initialPage = useMemo(
    () => findPageForAyah(surahNumber, 1),
    [surahNumber],
  );

  // ── Download gating ──────────────────────────────────────────────────
  const [downloadStatus, setDownloadStatus] = useState<
    'checking' | 'needs_download' | 'downloading' | 'ready'
  >('checking');
  const [progress, setProgress] = useState<MushafDownloadProgress>({
    done: 0,
    total: MUSHAF_TOTAL_PAGES,
    failed: 0,
  });
  const downloadHandleRef = useRef<MushafDownloadHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isMushafDownloaded().then(yes => {
      if (cancelled) return;
      setDownloadStatus(yes ? 'ready' : 'needs_download');
    });
    return () => {
      cancelled = true;
      downloadHandleRef.current?.cancel();
    };
  }, []);

  const startDownload = () => {
    if (downloadStatus === 'downloading') return;
    setDownloadStatus('downloading');
    setProgress({ done: 0, total: MUSHAF_TOTAL_PAGES, failed: 0 });
    const handle = downloadMushafAssets({
      concurrency: 8,
      onProgress: setProgress,
    });
    downloadHandleRef.current = handle;
    void handle.promise.then(completed => {
      downloadHandleRef.current = null;
      setDownloadStatus(completed ? 'ready' : 'needs_download');
    });
  };

  // ── Page state ───────────────────────────────────────────────────────
  // Source of truth is the actual page number (1..604). The 3 mounted
  // images are { current - 1, current, current + 1 } each absolutely
  // positioned at their (page - 1) * screenWidth x-coordinate inside the
  // big ScrollView, so the scroll position matches the visible page
  // exactly without any imperative recentering after a swipe.
  const screenWidth = Dimensions.get('window').width;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const scrollRef = useRef<ScrollView>(null);
  // Track whether we've already done the initial scroll so we don't keep
  // jumping back when the user navigates within the reader.
  const didInitialScrollRef = useRef(false);

  useEffect(() => {
    if (!onTitleChange) return;
    const visiblePage = MUSHAF_PAGES.find(p => p.page === currentPage);
    if (!visiblePage) return;
    const surah = MUSHAF_SURAHS.find(s => s.number === visiblePage.start.surah);
    if (surah) onTitleChange(surah.englishName);
  }, [currentPage, onTitleChange]);

  // Initial scroll to the surah's starting page once everything has laid
  // out. After this we never imperatively scroll again — the user drives
  // it via swipes, and `currentPage` is derived from contentOffset.
  const onScrollViewLayout = () => {
    if (didInitialScrollRef.current) return;
    if (initialPage <= 1) {
      didInitialScrollRef.current = true;
      return;
    }
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: (initialPage - 1) * screenWidth,
        y: 0,
        animated: false,
      });
      didInitialScrollRef.current = true;
    }, 0);
  };

  // ── Download-prompt screens ──────────────────────────────────────────
  if (downloadStatus === 'checking') {
    return (
      <View style={[styles.gate, { backgroundColor: PARCHMENT }]}>
        <ActivityIndicator color={ORNAMENT} size="large" />
      </View>
    );
  }
  if (downloadStatus === 'needs_download') {
    return (
      <View style={[styles.gate, { backgroundColor: PARCHMENT }]}>
        <Text style={styles.gateTitle}>
          {t('quran.mushafDownloadTitle', 'Download the mushaf')}
        </Text>
        <Text style={styles.gateBody}>
          {t(
            'quran.mushafDownloadBody',
            'The Madinah mushaf is around 120 MB. It is not bundled in the app — download it once and the pages stay cached on your device.',
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            'quran.mushafDownloadCta',
            'Download mushaf (~120 MB)',
          )}
          onPress={startDownload}
          style={styles.cta}>
          <Text style={styles.ctaLabel}>
            {t('quran.mushafDownloadCta', 'Download mushaf (~120 MB)')}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (downloadStatus === 'downloading') {
    const pct =
      progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <View style={[styles.gate, { backgroundColor: PARCHMENT }]}>
        <Text style={styles.gateTitle}>
          {t('quran.mushafDownloading', 'Downloading mushaf…')}
        </Text>
        <Text style={styles.progressLabel}>
          {t(
            'quran.mushafDownloadProgress',
            '{{done}} / {{total}} pages · {{pct}}%',
            { done: progress.done, total: progress.total, pct },
          )}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
          onPress={() => downloadHandleRef.current?.cancel()}
          style={styles.cancelBtn}>
          <Text style={styles.cancelLabel}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Reader ───────────────────────────────────────────────────────────
  // Page-image dimensions, computed once.
  const horizontalPadding = 16;
  const headerFooterReserve = 80;
  const maxWidth = screenWidth - horizontalPadding * 2;
  const maxHeight = isFullscreen
    ? Dimensions.get('window').height
    : Dimensions.get('window').height - headerFooterReserve;
  let imageWidth = maxWidth;
  let imageHeight = imageWidth / IMAGE_ASPECT;
  if (imageHeight > maxHeight) {
    imageHeight = maxHeight;
    imageWidth = imageHeight * IMAGE_ASPECT;
  }

  const pageMeta = (page: number) =>
    MUSHAF_PAGES.find(p => p.page === page) ?? MUSHAF_PAGES[0];

  const renderPage = (page: number) => {
    if (page < 1 || page > MUSHAF_TOTAL_PAGES) return null;
    const meta = pageMeta(page);
    return (
      <View
        key={page}
        style={{
          position: 'absolute',
          top: 0,
          left: (page - 1) * screenWidth,
          width: screenWidth,
          height: '100%',
          backgroundColor: PARCHMENT,
        }}>
        {!isFullscreen ? (
          <View style={styles.pageHeader}>
            <Text style={styles.pageHeaderText}>
              {`Part ${easternNumerals(meta.juz)}`}
            </Text>
          </View>
        ) : null}
        <View style={styles.imageWrap}>
          <Image
            source={mushafPageAsset(page)}
            style={{ width: imageWidth, height: imageHeight }}
            resizeMode="contain"
            accessibilityLabel={`Mushaf page ${page}`}
            fadeDuration={0}
          />
        </View>
        {!isFullscreen ? (
          <View style={styles.pageFooter}>
            <View style={styles.pageNumberFrame}>
              <Text style={styles.pageNumber}>{easternNumerals(page)}</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  // The 3 pages we keep mounted: prev, current, next.
  const mountedPages = [
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ].filter(p => p >= 1 && p <= MUSHAF_TOTAL_PAGES);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: isFullscreen ? insets.top : 0 },
      ]}>
      <StatusBar hidden={isFullscreen} animated />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        // Don't react to live scroll events — only commit currentPage
        // after momentum has stopped. This prevents flicker during the
        // swipe gesture itself.
        onMomentumScrollEnd={e => {
          const x = e.nativeEvent.contentOffset.x;
          const page = Math.round(x / screenWidth) + 1;
          const clamped = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, page));
          if (clamped !== currentPage) setCurrentPage(clamped);
        }}
        onLayout={onScrollViewLayout}
        // Native ScrollView allocates contentSize from contentContainerStyle.
        // 604 * screenWidth gives the user the natural feel of paging
        // through a real mushaf — content size is computed once and never
        // changes; only the 3 absolutely-positioned children move with
        // currentPage.
        contentContainerStyle={{
          width: screenWidth * MUSHAF_TOTAL_PAGES,
          height: '100%',
        }}>
        {mountedPages.map(renderPage)}
      </ScrollView>
      {isFullscreen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.exitFullscreen', 'Exit fullscreen')}
          onPress={onExitFullscreen}
          hitSlop={16}
          style={[styles.exitBtn, { top: insets.top + 6 }]}>
          <Text style={styles.exitGlyph}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PARCHMENT },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1c1c1e',
  },
  gateBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#3a3a3c',
  },
  cta: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0a7c30',
  },
  ctaLabel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  progressLabel: { fontSize: 13, color: '#3a3a3c' },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  progressFill: { height: '100%', backgroundColor: '#0a7c30' },
  cancelBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8 },
  cancelLabel: { fontSize: 14, fontWeight: '600', color: '#0a7c30' },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pageHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: 0.4,
    color: ORNAMENT,
  },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pageFooter: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  pageNumberFrame: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderRadius: 18,
    alignItems: 'center',
    borderColor: ORNAMENT,
  },
  pageNumber: { fontSize: 13, fontWeight: '700', color: ORNAMENT },
  exitBtn: {
    position: 'absolute',
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.32)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    minWidth: 40,
    alignItems: 'center',
  },
  exitGlyph: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
