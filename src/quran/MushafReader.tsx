/**
 * Interactive mushaf reader — Quran Reader v2
 * (docs/quran-reader-plan.md, QR-3/4/5/8/10/11/13/17).
 *
 * Evolves the unified paged reader (#153) into a live surface:
 *
 *   • Same proven 3-mounted-pages / absolute-positioning ScrollView
 *     core with RTL page flow (page 1 rightmost).
 *   • Ayah geometry overlays: tap any ayah → highlight + action sheet
 *     (translation peek, play, bookmark, star, share).
 *   • Recitation follow: the playing ayah stays highlighted and the
 *     reader auto-turns pages as playback crosses a page boundary.
 *   • Last-read + khatmah progress persist on every sequential turn.
 *   • Palette-aware chrome + optional night mode (page inversion via
 *     `mixBlendMode: 'difference'`, dependency-free).
 *   • `useWindowDimensions` so fullscreen rotation reflows correctly.
 *   • Managed file store (QR-5): pages are real files on disk; missing
 *     pages stream from the release while a retry pass can fill gaps.
 *   • Keep-awake while the reader is mounted (user-settable).
 *
 * The page images stay untouched underneath — geometry rects float
 * above, so rendering quality is exactly the KFGQPC source at every
 * display size.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTranslation } from 'react-i18next';
import {
  ColorMatrix,
  concatColorMatrices,
  invert,
  brightness,
} from 'react-native-color-matrix-image-filters';
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
import { useAppPalette } from '../hooks/useAppPalette';
import { findPageForAyah, MUSHAF_PAGES, MUSHAF_SURAHS } from './pages';
import {
  mushafPageAsset,
  mushafPageCrop,
  MUSHAF_TOTAL_PAGES,
} from './mushafImages';
import {
  downloadMushafAssets,
  isMushafDownloaded,
  pageFilePath,
  type MushafDownloadHandle,
  type MushafDownloadProgress,
} from './mushafDownload';
import { firstAyahOnPage, hitTestAyah, loadGeometry } from './geometry';
import {
  activeKhatmah,
  recordKhatmahProgress,
  setLastRead,
  setQuranPrefs,
  useQuranState,
} from './quranState';
import { usePlaybackStatus } from './audio/playback';
import { AyahActionSheet } from './mushaf/AyahActionSheet';
import { MushafPageOverlay } from './mushaf/MushafPageOverlay';
import { MiniPlayer } from './audio/MiniPlayer';

type Props = {
  surahNumber: number;
  /** Open at an explicit page (deep links from Juz/Page/Bookmark nav). */
  initialPage?: number;
  isFullscreen: boolean;
  onExitFullscreen: () => void;
  /** Single tap on the page toggles fullscreen (v2.7.28). */
  onToggleFullscreen: () => void;
  /** Increment to open the unified sheet scrolled to the recitation
   *  section (the header "Recitation" button). */
  audioSheetSignal?: number;
  onTitleChange?: (title: string) => void;
};

const IMAGE_ASPECT = 2600 / 4206; // KFGQPC source page ratio

function easternNumerals(n: number): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(n)
    .split('')
    .map(d => map[Number(d)] ?? d)
    .join('');
}

export function MushafReader({
  surahNumber,
  initialPage: initialPageProp,
  isFullscreen,
  onExitFullscreen,
  onToggleFullscreen,
  audioSheetSignal,
  onTitleChange,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // iOS native-stack headers float translucently over the content; pad
  // our in-page chrome below them (0 on Android's opaque header).
  const headerHeight = useHeaderHeight();
  const { palette, isDark } = useAppPalette();
  const quran = useQuranState();
  const playback = usePlaybackStatus();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const nightMode = quran.prefs.mushafNightMode;
  const pageBg = nightMode ? '#101010' : '#ffffff';
  const ornament = nightMode ? '#c9b47a' : '#7a5e1f';

  const initialPage = useMemo(
    () => initialPageProp ?? findPageForAyah(surahNumber, 1),
    [surahNumber, initialPageProp],
  );

  // ── Keep the screen awake while reading (QR-13) ─────────────────────
  useEffect(() => {
    if (!quran.prefs.keepAwake) return;
    activateKeepAwake();
    return () => {
      deactivateKeepAwake();
    };
  }, [quran.prefs.keepAwake]);

  // ── Geometry (QR-7) ─────────────────────────────────────────────────
  const [geometryReady, setGeometryReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadGeometry().then(() => {
      if (!cancelled) setGeometryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Download gating (QR-5) ──────────────────────────────────────────
  const [downloadStatus, setDownloadStatus] = useState<
    'checking' | 'needs_download' | 'downloading' | 'ready'
  >('checking');
  const [progress, setProgress] = useState<MushafDownloadProgress>({
    done: 0,
    total: MUSHAF_TOTAL_PAGES,
    failed: 0,
  });
  const [lastRunFailed, setLastRunFailed] = useState(0);
  const downloadHandleRef = useRef<MushafDownloadHandle | null>(null);
  // While not fully downloaded, pages stream remotely; after the store
  // reports ready we switch every mounted Image to its file:// path.
  const [useLocalFiles, setUseLocalFiles] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isMushafDownloaded().then(yes => {
      if (cancelled) return;
      setUseLocalFiles(yes);
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
    const handle = downloadMushafAssets({ onProgress: setProgress });
    downloadHandleRef.current = handle;
    void handle.promise.then(complete => {
      downloadHandleRef.current = null;
      setLastRunFailed(complete ? 0 : progressRef.current.failed);
      setUseLocalFiles(true); // whatever landed on disk is usable
      setDownloadStatus(complete ? 'ready' : 'needs_download');
    });
  };
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // ── Page state (unchanged core from #153) ───────────────────────────
  const screenWidth = windowWidth;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const scrollRef = useRef<ScrollView>(null);
  const didInitialScrollRef = useRef(false);

  const pageToOffsetX = useCallback(
    (page: number) => (MUSHAF_TOTAL_PAGES - page) * screenWidth,
    [screenWidth],
  );

  // Re-anchor the scroll position when width changes (rotation, QR-4) —
  // offsets are width-dependent, so without this the visible page drifts.
  useEffect(() => {
    if (!didInitialScrollRef.current) return;
    scrollRef.current?.scrollTo({
      x: pageToOffsetX(currentPage),
      y: 0,
      animated: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth]);

  const onScrollViewLayout = () => {
    if (didInitialScrollRef.current) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: pageToOffsetX(initialPage),
        y: 0,
        animated: false,
      });
      didInitialScrollRef.current = true;
    }, 0);
  };

  // Header title follows the visible page's starting surah.
  useEffect(() => {
    if (!onTitleChange) return;
    const visiblePage = MUSHAF_PAGES.find(p => p.page === currentPage);
    if (!visiblePage) return;
    const surah = MUSHAF_SURAHS.find(
      s => s.number === visiblePage.start.surah,
    );
    if (surah) onTitleChange(surah.englishName);
  }, [currentPage, onTitleChange]);

  // ── Last-read + khatmah on page turns (QR-10/21) ────────────────────
  const commitPage = useCallback(
    (newPage: number, prevPage: number) => {
      const first = firstAyahOnPage(newPage);
      setLastRead({
        surah: first.surah,
        ayah: first.ayah,
        page: newPage,
        mode: 'mushaf',
      });
      // Sequential forward turn = previous page completed.
      if (newPage === prevPage + 1) recordKhatmahProgress(prevPage);
    },
    [],
  );

  // ── Recitation follow (QR-17) ───────────────────────────────────────
  const followRef = useRef(true);
  useEffect(() => {
    if (!playback.active || !playback.playing || !followRef.current) return;
    const page = findPageForAyah(playback.active.surah, playback.active.ayah);
    if (page !== currentPage && didInitialScrollRef.current) {
      setCurrentPage(page);
      scrollRef.current?.scrollTo({
        x: pageToOffsetX(page),
        y: 0,
        animated: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.active?.surah, playback.active?.ayah, playback.playing]);

  // ── Ayah selection (QR-8) ───────────────────────────────────────────
  const [selected, setSelected] = useState<{
    surah: number;
    ayah: number;
    page: number;
  } | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  // When the sheet is opened via the header "Recitation" button it
  // scrolls straight to the recitation controls section.
  const [sheetScrollAudio, setSheetScrollAudio] = useState(false);

  // Header "Recitation" button → unified sheet at the audio section,
  // anchored to the first ayah of the visible page (or the playing one).
  const lastAudioSignal = useRef(audioSheetSignal ?? 0);
  useEffect(() => {
    if (audioSheetSignal == null) return;
    if (audioSheetSignal === lastAudioSignal.current) return;
    lastAudioSignal.current = audioSheetSignal;
    const anchor =
      playback.active ?? firstAyahOnPage(currentPage);
    setSelected({
      surah: anchor.surah,
      ayah: anchor.ayah,
      page: findPageForAyah(anchor.surah, anchor.ayah),
    });
    setSheetScrollAudio(true);
    setSheetVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSheetSignal]);

  // ── Jump-to-page (QR-11) ────────────────────────────────────────────
  const [jumpVisible, setJumpVisible] = useState(false);
  const [jumpText, setJumpText] = useState('');
  const jumpToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, page));
    setCurrentPage(clamped);
    scrollRef.current?.scrollTo({
      x: pageToOffsetX(clamped),
      y: 0,
      animated: false,
    });
    commitPage(clamped, clamped); // record position; not a sequential turn
    setJumpVisible(false);
    setJumpText('');
  };

  // ── Gate screens ────────────────────────────────────────────────────
  if (downloadStatus === 'checking') {
    return (
      <View style={[styles.gate, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.accentSolid} size="large" />
      </View>
    );
  }
  if (downloadStatus === 'needs_download') {
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
            : t(
                'quran.mushafDownloadBody',
                'The Madinah mushaf is around 120 MB. It is not bundled in the app — download it once and the pages stay on your device.',
              )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            lastRunFailed > 0
              ? t('quran.mushafDownloadRetryCta', 'Retry missing pages')
              : t('quran.mushafDownloadCta', 'Download mushaf (~120 MB)')
          }
          onPress={startDownload}
          style={[styles.cta, { backgroundColor: palette.accentSolid }]}>
          <Text style={styles.ctaLabel}>
            {lastRunFailed > 0
              ? t('quran.mushafDownloadRetryCta', 'Retry missing pages')
              : t('quran.mushafDownloadCta', 'Download mushaf (~120 MB)')}
          </Text>
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
          onPress={() => downloadHandleRef.current?.cancel()}
          style={styles.cancelBtn}>
          <Text style={[styles.cancelLabel, { color: palette.accentSolid }]}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Reader layout ───────────────────────────────────────────────────
  // iOS floats a translucent nav header over the content; keep our page
  // chrome below it. Android's opaque header already offsets the view.
  const navOverlayPad =
    !isFullscreen && Platform.OS === 'ios' ? headerHeight : 0;
  const horizontalPadding = 12;
  const headerFooterReserve = isFullscreen ? 0 : 76;
  // Floating mini-player card: 3px track + row (~54) + 10 bottom margin.
  const playerReserve = playback.active ? 68 : 0;
  const maxWidth = screenWidth - horizontalPadding * 2;
  const maxHeight =
    windowHeight -
    navOverlayPad -
    headerFooterReserve -
    playerReserve -
    (isFullscreen ? insets.top + insets.bottom : 0);
  let imageWidth = maxWidth;
  let imageHeight = imageWidth / IMAGE_ASPECT;
  if (imageHeight > maxHeight) {
    imageHeight = maxHeight;
    imageWidth = imageHeight * IMAGE_ASPECT;
  }

  const pageMeta = (page: number) =>
    MUSHAF_PAGES.find(p => p.page === page) ?? MUSHAF_PAGES[0];

  const showChrome = !isFullscreen;

  /**
   * Per-page display geometry (v2.7.28). Pages with a content crop
   * (1–2) render the crop region scaled to fill the available box; the
   * underlying image is drawn larger inside an overflow-hidden window.
   * `fullW`/`fullH` are the virtual full-image dimensions — geometry
   * hit-testing and the overlay both work in that space.
   */
  const pageDims = (page: number) => {
    const crop = mushafPageCrop(page);
    if (!crop) {
      return {
        dispW: imageWidth,
        dispH: imageHeight,
        fullW: imageWidth,
        fullH: imageHeight,
        offX: 0,
        offY: 0,
      };
    }
    const cropAspect = (crop.w * 2600) / (crop.h * 4206);
    let dispW = maxWidth;
    let dispH = dispW / cropAspect;
    if (dispH > maxHeight) {
      dispH = maxHeight;
      dispW = dispH * cropAspect;
    }
    const fullW = dispW / crop.w;
    const fullH = dispH / crop.h;
    return {
      dispW,
      dispH,
      fullW,
      fullH,
      offX: -crop.x * fullW,
      offY: -crop.y * fullH,
    };
  };

  /** Long press selects the ayah under the finger (v2.7.28). */
  const onPageLongPress = (
    page: number,
    locationX: number,
    locationY: number,
  ) => {
    if (!geometryReady) return;
    const d = pageDims(page);
    // Map window-local coords into virtual full-image space.
    const hit = hitTestAyah(
      page,
      locationX - d.offX,
      locationY - d.offY,
      d.fullW,
    );
    if (hit) {
      setSelected({ ...hit, page });
      setSheetScrollAudio(false);
      setSheetVisible(true);
    }
  };

  const renderPage = (page: number) => {
    if (page < 1 || page > MUSHAF_TOTAL_PAGES) return null;
    const meta = pageMeta(page);
    const dims = pageDims(page);
    const pageBookmarks = quran.bookmarks.filter(b => {
      const p = findPageForAyah(b.surah, b.ayah);
      return p === page;
    });
    const khatmahPos = activeKhatmah(quran)?.position ?? null;
    return (
      <View
        key={page}
        style={{
          position: 'absolute',
          top: 0,
          left: pageToOffsetX(page),
          width: screenWidth,
          height: '100%',
          backgroundColor: pageBg,
        }}>
        {showChrome ? (
          <View style={[styles.pageHeader, { marginTop: navOverlayPad }]}>
            <Text style={[styles.pageHeaderText, { color: ornament }]}>
              {t('quran.juzLabel', {
                defaultValue: 'Juz {{juz}}',
                juz: easternNumerals(meta.juz),
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                nightMode
                  ? t('quran.switchToLight', 'Switch to light page')
                  : t('quran.switchToNight', 'Switch to night page')
              }
              hitSlop={8}
              onPress={() =>
                setQuranPrefs({ mushafNightMode: !nightMode })
              }
              style={[styles.nightPill, { borderColor: ornament }]}>
              <Text style={[styles.nightPillText, { color: ornament }]}>
                {nightMode
                  ? // U+FE0E variation selectors force the monochrome text
                    // glyphs — Android otherwise renders the sun as a
                    // colored emoji, which shouts against the quiet page.
                    `☀︎ ${t('quran.lightShort', 'Light')}`
                  : `☾︎ ${t('quran.nightShort', 'Night')}`}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.imageWrap}>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t('quran.pageA11y', {
              defaultValue:
                'Mushaf page {{page}} — tap to toggle fullscreen, long-press an ayah for actions',
              page,
            })}
            // v2.7.28 gesture model: single tap toggles fullscreen,
            // long press selects the ayah under the finger.
            onPress={onToggleFullscreen}
            onLongPress={e =>
              onPageLongPress(
                page,
                e.nativeEvent.locationX,
                e.nativeEvent.locationY,
              )
            }
            delayLongPress={280}
            style={{
              width: dims.dispW,
              height: dims.dispH,
              overflow: 'hidden',
            }}>
            {/* Inner surface at virtual full-image size; cropped pages
                shift it so the content window fills the pressable. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: dims.offX,
                top: dims.offY,
                width: dims.fullW,
                height: dims.fullH,
              }}>
              {nightMode ? (
                // True page inversion via color matrix (QR-3): black ink
                // becomes soft white on a near-black page, dimmed slightly
                // so the page never glares in the dark.
                <ColorMatrix
                  matrix={concatColorMatrices(invert(), brightness(0.92))}>
                  <Image
                    source={mushafPageAsset(
                      page,
                      useLocalFiles ? pageFilePath(page) : null,
                    )}
                    style={{ width: dims.fullW, height: dims.fullH }}
                    resizeMode="contain"
                    fadeDuration={0}
                  />
                </ColorMatrix>
              ) : (
                <Image
                  source={mushafPageAsset(
                    page,
                    useLocalFiles ? pageFilePath(page) : null,
                  )}
                  style={{ width: dims.fullW, height: dims.fullH }}
                  resizeMode="contain"
                  fadeDuration={0}
                />
              )}
              <MushafPageOverlay
                page={page}
                renderedWidth={dims.fullW}
                selected={
                  sheetVisible && selected?.page === page ? selected : null
                }
                playing={
                  playback.active && playback.playing ? playback.active : null
                }
                bookmarks={pageBookmarks}
                khatmahPosition={khatmahPos}
                accentColor={palette.accentSolid}
                nightMode={nightMode}
              />
            </View>
          </Pressable>
        </View>
        {showChrome ? (
          <View style={styles.pageFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.jumpToPage', 'Go to page')}
              onPress={() => setJumpVisible(true)}
              style={[styles.pageNumberFrame, { borderColor: ornament }]}>
              <Text style={[styles.pageNumber, { color: ornament }]}>
                {easternNumerals(page)}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const mountedPages = [currentPage - 1, currentPage, currentPage + 1].filter(
    p => p >= 1 && p <= MUSHAF_TOTAL_PAGES,
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: pageBg, paddingTop: isFullscreen ? insets.top : 0 },
      ]}>
      <StatusBar hidden={isFullscreen} animated />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={e => {
          const x = e.nativeEvent.contentOffset.x;
          const page = MUSHAF_TOTAL_PAGES - Math.round(x / screenWidth);
          const clamped = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, page));
          if (clamped !== currentPage) {
            commitPage(clamped, currentPage);
            setCurrentPage(clamped);
          }
        }}
        onScrollBeginDrag={() => {
          // Manual page turns take navigation back from recitation follow.
          followRef.current = false;
          setTimeout(() => {
            followRef.current = true;
          }, 30_000);
        }}
        onLayout={onScrollViewLayout}
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

      <MiniPlayer />

      {selected ? (
        <AyahActionSheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          surah={selected.surah}
          ayah={selected.ayah}
          page={selected.page}
          scrollToAudio={sheetScrollAudio}
        />
      ) : null}

      {/* Jump-to-page (QR-11) */}
      {jumpVisible ? (
        <View style={[styles.jumpBackdrop, { backgroundColor: palette.overlay }]}>
          <View style={[styles.jumpCard, { backgroundColor: palette.card }]}>
            <Text style={[styles.jumpTitle, { color: palette.text }]}>
              {t('quran.jumpToPage', 'Go to page')}
            </Text>
            <TextInput
              value={jumpText}
              onChangeText={setJumpText}
              keyboardType="number-pad"
              autoFocus
              maxLength={3}
              accessibilityLabel={t('quran.jumpToPage', 'Go to page')}
              placeholder={`1–${MUSHAF_TOTAL_PAGES}`}
              placeholderTextColor={String(palette.muted)}
              style={[
                styles.jumpInput,
                { color: palette.text, borderColor: palette.border },
              ]}
              onSubmitEditing={() => {
                const n = Number(jumpText);
                if (Number.isFinite(n) && n >= 1) jumpToPage(n);
              }}
            />
            <View style={styles.jumpRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel', 'Cancel')}
                onPress={() => {
                  setJumpVisible(false);
                  setJumpText('');
                }}
                style={styles.jumpBtn}>
                <Text style={{ color: palette.muted, fontWeight: '600' }}>
                  {t('common.cancel', 'Cancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.go', 'Go')}
                onPress={() => {
                  const n = Number(jumpText);
                  if (Number.isFinite(n) && n >= 1) jumpToPage(n);
                }}
                style={styles.jumpBtn}>
                <Text
                  style={{ color: palette.accentSolid, fontWeight: '700' }}>
                  {t('quran.go', 'Go')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  pageHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  nightPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  nightPillText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageFooter: { alignItems: 'center', paddingTop: 6, paddingBottom: 10 },
  pageNumberFrame: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderRadius: 18,
    alignItems: 'center',
  },
  pageNumber: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
  jumpBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpCard: {
    width: 260,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  jumpTitle: { fontSize: 16, fontWeight: '700' },
  jumpInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  jumpRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  jumpBtn: { paddingHorizontal: 12, paddingVertical: 8 },
});
