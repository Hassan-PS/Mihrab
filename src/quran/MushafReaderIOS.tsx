/**
 * iOS-only Mushaf reader — task #151.
 *
 * The shared FlatList-based reader (`MushafReader` in QuranSurahScreen.tsx)
 * keeps hitting iOS-specific FlatList edge cases when combined with the
 * Arabic in-app locale and the 604-page mushaf data set:
 *   • `inverted={true}` + `initialScrollIndex` → list mounts but never
 *     scrolls (beta.34 bug).
 *   • Drop `inverted`, keep `initialScrollIndex` → fixed for English UI
 *     but still blank in Arabic (beta.35).
 *   • Pin `writingDirection: 'ltr'` and key by `i18n.language` → still
 *     blank in Arabic (beta.37).
 *   • Replace `initialScrollIndex` with manual `scrollToOffset` on
 *     `onLayout` → still reported blank (beta.38).
 *
 * Rather than chase another FlatList quirk, this iOS reader is built from
 * scratch on plain `<ScrollView pagingEnabled horizontal>` with a manual
 * 3-page sliding window. Only ever 3 page <Image> components are mounted
 * (the active page plus one on each side) so memory stays low even with
 * 604 logical pages. Swipe gestures are handled by the OS via
 * `pagingEnabled`. No FlatList virtualization, no `inverted`, no
 * `initialScrollIndex`, no writing-direction inheritance.
 *
 * Android keeps using the FlatList implementation in QuranSurahScreen.tsx
 * because Android's view hierarchy doesn't reproduce the iOS bug.
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

  // Initial page is wherever the requested surah begins. Derived once;
  // changing surah unmounts the screen so we don't need a useEffect.
  const initialPage = useMemo(
    () => findPageForAyah(surahNumber, 1),
    [surahNumber],
  );

  // ── Download gating — same UX contract as MushafReader on Android ──
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

  // ── Page state ──────────────────────────────────────────────────────
  // Track the active page (1..604). A 3-page sliding window is rendered
  // around it: [page-1, page, page+1]. The horizontal ScrollView holds
  // exactly those three pages and we recenter after each swipe.
  const screenWidth = Dimensions.get('window').width;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const scrollRef = useRef<ScrollView>(null);

  // Notify the parent screen of title changes so the nav header reflects
  // the surah on the visible page.
  useEffect(() => {
    if (!onTitleChange) return;
    const visiblePage = MUSHAF_PAGES.find(p => p.page === currentPage);
    if (!visiblePage) return;
    const surah = MUSHAF_SURAHS.find(s => s.number === visiblePage.start.surah);
    if (surah) onTitleChange(surah.englishName);
  }, [currentPage, onTitleChange]);

  // After every render, recenter the scroll view so the visible page is
  // in the middle slot. The middle slot always holds `currentPage`. The
  // left slot holds `currentPage - 1` (clamped to 1), the right slot
  // holds `currentPage + 1` (clamped to MUSHAF_TOTAL_PAGES).
  //
  // This pattern dodges all the FlatList iOS issues: the ScrollView only
  // ever has three children, the offset arithmetic is straightforward,
  // and there is no virtualization layer that might silently misbehave
  // under an RTL ancestor.
  useEffect(() => {
    // jumpTo 0 = left page, 1 = middle page, 2 = right page
    const middleX = screenWidth;
    // Use scrollTo with animated:false to position without animation.
    // Defer one frame so the ScrollView's content has laid out.
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: middleX, y: 0, animated: false });
    }, 0);
    return () => clearTimeout(id);
  }, [currentPage, screenWidth]);

  const leftPage = Math.max(1, currentPage - 1);
  const rightPage = Math.min(MUSHAF_TOTAL_PAGES, currentPage + 1);

  // ── Download-prompt screens ─────────────────────────────────────────
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

  // ── Reader ──────────────────────────────────────────────────────────
  // Compute the dimensions for each page image once — same aspect-fit
  // logic as the Android reader.
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
    const meta = pageMeta(page);
    return (
      <View
        key={page}
        style={{ width: screenWidth, height: '100%', backgroundColor: PARCHMENT }}>
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
              <Text style={styles.pageNumber}>
                {easternNumerals(page)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

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
        // Disable bounces so the user can't scroll past the edges and
        // see empty space when on page 1 or 604.
        bounces={false}
        // Defer the offset update until momentum stops. We don't update
        // on every scroll event because the user might land between
        // pages mid-gesture.
        onMomentumScrollEnd={e => {
          const x = e.nativeEvent.contentOffset.x;
          // Snap the index to which slot was selected (0=left, 1=middle, 2=right).
          const slot = Math.round(x / screenWidth);
          if (slot === 0 && currentPage > 1) {
            setCurrentPage(currentPage - 1);
          } else if (slot === 2 && currentPage < MUSHAF_TOTAL_PAGES) {
            setCurrentPage(currentPage + 1);
          }
          // slot===1 means user scrolled then snapped back — no-op.
        }}
        contentContainerStyle={{ flexGrow: 0 }}>
        {renderPage(leftPage)}
        {renderPage(currentPage)}
        {renderPage(rightPage)}
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
  gateTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', color: '#1c1c1e' },
  gateBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#3a3a3c' },
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
