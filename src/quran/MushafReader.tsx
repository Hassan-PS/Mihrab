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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  PixelRatio,
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
  pageOffsetX,
  pageFromScroll,
  mushafLayoutMode,
  landscapePageWidthDp,
  scrollXForPage as scrollXForPageMath,
} from './mushafSpread';
import {
  mushafPageAsset,
  mushafPageCrop,
  MUSHAF_TOTAL_PAGES,
} from './mushafImages';
import {
  deleteLegacyImageStore,
  isMushafDownloaded,
  legacyImageStoreBytes,
  pageFilePath,
  type MushafDownloadProgress,
} from './mushafDownload';
import { fontStoreStats } from './mushafFontStore';
import {
  cancelMushafDownload,
  mushafDownloadState,
  startMushafDownload,
  subscribeMushafDownload,
} from './mushafDownloadManager';
import { firstAyahOnPage, hitTestAyah, loadGeometry } from './geometry';
import MushafTextPageSurface from './MushafTextPageSurface';
import { DEVICE_CLASS } from '../responsive/deviceClass';
import { MushafPhoneReader } from './MushafPhoneReader';
import { MushafSpreadReader } from './MushafSpreadReader';
import {
  ensureScaledPage,
  getRenderCacheVersion,
  nearestScaledPagePath,
  subscribeRenderCache,
} from './mushafRenderCache';
import {
  activeKhatmah,
  recordKhatmahProgress,
  setLastRead,
  setQuranPrefs,
  useQuranState,
} from './quranState';
import { usePlaybackStatus } from './audio/playback';
import { useOverlayDismissGuard } from './mushafReaderCore';
import { mushafSurahName } from './surahName';
import { AyahActionSheet } from './mushaf/AyahActionSheet';
import { MushafPageOverlay } from './mushaf/MushafPageOverlay';
import { MiniPlayer } from './audio/MiniPlayer';

type Props = {
  surahNumber: number;
  /** Open at an explicit page (deep links from Juz/Page/Bookmark nav). */
  initialPage?: number;
  isFullscreen: boolean;
  /** Single tap on the page toggles fullscreen (v2.7.28) — no exit
   *  button; tapping again leaves fullscreen. */
  onToggleFullscreen: () => void;
  /** Increment to open the unified sheet scrolled to the recitation
   *  section (the header "Recitation" button). */
  audioSheetSignal?: number;
  onTitleChange?: (title: string) => void;
};

const IMAGE_ASPECT = 2600 / 4206; // KFGQPC source page ratio
/**
 * Max vertical text stretch on full pages (v2.7.29 screen-use pass).
 * Fullscreen would need ~1.35× to fill the height completely, which
 * reads as visibly drawn-out calligraphy — 1.25 is the middle ground:
 * most of the letterbox goes, the letterforms stay natural. Portrait
 * non-fullscreen needs only ~1.1× so it fills fully either way.
 */
const MAX_VERTICAL_STRETCH = 1.25;

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
  onToggleFullscreen,
  audioSheetSignal,
  onTitleChange,
}: Props) {
  const { t, i18n: i18nInstance } = useTranslation();
  // The header title is pushed to the navigator imperatively, so it needs the
  // language as an explicit dependency to follow a language change.
  const language = i18nInstance.language;
  const insets = useSafeAreaInsets();
  // iOS native-stack headers float translucently over the content; pad
  // our in-page chrome below them (0 on Android's opaque header).
  const headerHeight = useHeaderHeight();
  const { palette, isDark } = useAppPalette();
  const quran = useQuranState();
  const playback = usePlaybackStatus();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const nightMode = quran.prefs.mushafNightMode;
  /**
   * Font-rendered pages (v2.8.0). Each page draws from its own QPC v2 font
   * instead of a 2600 px PNG: sharp at any zoom, ~1 MB instead of ~44 MB per
   * mounted page, and instant on rotation. It also removes the download gate —
   * a page needs only its own ~300 KB font, so the reader opens straight away
   * and fetches as you read. `image` stays available for one release.
   */
  const textMode = quran.prefs.mushafRenderer !== 'image';
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
  // While not fully downloaded, pages stream remotely; after the store
  // reports ready we switch every mounted Image to its file:// path.
  const [useLocalFiles, setUseLocalFiles] = useState(false);

  /** Bytes the retired page-image store is still occupying, if any. */
  const [staleImageBytes, setStaleImageBytes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (textMode) {
      // The font-rendered mushaf is gated exactly like the image one was.
      // Fetching each page's font on arrival made the reader feel like it was
      // permanently loading, and the complete set is 180 MB — far too much to
      // pull without being asked. So: ask, once, and then never wait again.
      setUseLocalFiles(false);
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
    }
    void isMushafDownloaded().then(yes => {
      if (cancelled) return;
      setUseLocalFiles(yes);
      setDownloadStatus(yes ? 'ready' : 'needs_download');
    });
    return () => {
      cancelled = true;
    };
  }, [textMode]);

  /**
   * Follow the download wherever it was started from.
   *
   * The download outlives this screen now — see mushafDownloadManager — so
   * what a mount does is ASK what is happening rather than start or stop
   * anything. Coming back to a reader that is halfway through six hundred
   * pages shows the bar where it actually is, and a run that finished while
   * the user was elsewhere is reported the moment they return.
   */
  useEffect(() => {
    const apply = (s: ReturnType<typeof mushafDownloadState>) => {
      if (s.running) {
        setDownloadStatus('downloading');
        if (s.progress.total > 0) publishProgress(s.progress);
        return;
      }
      if (!s.last) return;
      setLastRunFailed(s.last.complete ? 0 : s.last.failed);
      if (s.last.kind === 'images' && s.last.complete) setUseLocalFiles(true);
      setDownloadStatus(s.last.complete ? 'ready' : 'needs_download');
    };
    apply(mushafDownloadState());
    return subscribeMushafDownload(apply);
    // `publishProgress` is a stable useCallback; listing it would re-subscribe
    // on every render for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Re-render the progress bar when the whole percent changes, not on every
   * one of 604 files. The extra ~500 renders land on the same JS thread the
   * downloads are being driven from, and the bar cannot show them anyway: it
   * is 300 dp wide, so a file is a third of a pixel.
   */
  const lastPctRef = useRef(-1);
  // Always current, whether or not the render was published — the completion
  // handler reads the failure count off it.
  const progressRef = useRef<MushafDownloadProgress>({
    done: 0,
    total: MUSHAF_TOTAL_PAGES,
    failed: 0,
  });
  const publishProgress = useCallback((p: MushafDownloadProgress) => {
    progressRef.current = p;
    const pct = p.total > 0 ? Math.floor((p.done / p.total) * 100) : 0;
    if (pct === lastPctRef.current && p.done !== p.total) return;
    lastPctRef.current = pct;
    setProgress(p);
  }, []);

  const startDownload = () => {
    if (downloadStatus === 'downloading') return;
    setDownloadStatus('downloading');
    lastPctRef.current = -1;
    setProgress({ done: 0, total: MUSHAF_TOTAL_PAGES, failed: 0 });

    if (textMode) {
      // Out with the old first. An updated app is still carrying the page
      // images the font reader replaced — nothing will ever read them again,
      // and they are larger than what we are about to fetch. Do it before the
      // download rather than after, so the peak disk use is never both.
      void deleteLegacyImageStore().then(freed => {
        if (freed > 0) setStaleImageBytes(0);
      });
    }
    // The manager owns it from here: it keeps running when this screen goes
    // away, posts the progress notification, and tells whoever is listening
    // how it ended. The subscription above is what updates this screen.
    startMushafDownload(textMode ? 'fonts' : 'images');
  };

  // ── Page state (unchanged core from #153) ───────────────────────────
  const screenWidth = windowWidth;
  // ── Dual-page (facing pages) in landscape (v2.8) ────────────────────
  // When the window is landscape and wide enough, show two facing mushaf
  // pages side by side — a real "spread", right page odd / left page even
  // (RTL: page 1 is rightmost, so the higher page sits to the LEFT). Each
  // page still fills exactly one `pageW` column; a spread is two columns
  // and equals the full viewport width, so the existing `pagingEnabled`
  // snap (by the ScrollView frame = screenWidth) lands cleanly on spread
  // boundaries with zero extra snapping logic. In portrait / on phones
  // `dualPage` is false and every value below collapses to the original
  // single-page math (pageW === screenWidth), so that path is unchanged.
  const isLandscape = windowWidth > windowHeight;
  // Layout decision lives in mushafSpread.mushafLayoutMode (unit-tested):
  // dual-page spreads are tablet/desktop-only (≥960pt wide AND a
  // non-phone screen — see the note there about tall phones in
  // landscape), phones get the single-page reading zoom instead.
  const screenDims = Dimensions.get('screen');
  const isPhoneDevice = Math.min(screenDims.width, screenDims.height) < 600;
  const { dualPage, phoneLandscape } = mushafLayoutMode({
    windowWidth,
    windowHeight,
    screenShortSide: Math.min(screenDims.width, screenDims.height),
  });
  // Pointer environments (iPad with trackpad, Mac "Designed for iPad"):
  // trackpad/mouse users have NO page-turn affordance — wheel scroll
  // doesn't drive a pagingEnabled ScrollView. Show edge chevrons on
  // iPad-idiom devices; they brighten on hover (plan v2 §C2/M2).
  const showPagerChevrons =
    Platform.OS === 'ios' &&
    !isPhoneDevice &&
    ((Platform as unknown as { isPad?: boolean }).isPad === true ||
      windowWidth >= 900);
  const pageW = dualPage ? windowWidth / 2 : windowWidth;
  const [currentPage, setCurrentPage] = useState(initialPage);
  // Measured height of the page viewport (imageWrap), tagged with the
  // fullscreen mode it was measured in — see maxHeight. The tag matters:
  // right after a fullscreen toggle the old measurement is stale for a
  // frame, and sizing pages with it would overflow the page chrome
  // ("misformed bars") until onLayout catches up.
  const [wrapBox, setWrapBox] = useState({ h: 0, fs: false });
  const scrollRef = useRef<ScrollView>(null);
  const didInitialScrollRef = useRef(false);

  // Pages mounted around the current one. Computed here (before the
  // offset helpers) because the phone-landscape path lays them out in a
  // WINDOWED strip whose coordinates are relative to this list.
  const mountedPages = (
    dualPage
      ? [
          currentPage - 2,
          currentPage - 1,
          currentPage,
          currentPage + 1,
          currentPage + 2,
          currentPage + 3,
        ]
      : [currentPage - 1, currentPage, currentPage + 1]
  ).filter(p => p >= 1 && p <= MUSHAF_TOTAL_PAGES);
  /**
   * Phone-landscape reading-zoom uses a WINDOWED strip (v2.7.41).
   *
   * The normal pager lays all 604 pages out absolutely across one giant
   * content box (604 × pageW). In phone landscape `pageW` is the full
   * landscape width (~1280dp ≈ 2.4 k px), which puts a mid-mushaf page's
   * left edge past ~1.3 M px — beyond what Android will rasterise, so the
   * page rendered BLANK. Here the strip spans only the mounted pages and
   * offsets are relative to the highest mounted page (RTL: highest page
   * sits leftmost), keeping every coordinate under ~4 k px.
   */
  const windowMaxPage = mountedPages.length
    ? Math.max(...mountedPages)
    : currentPage;

  // Left edge of a single page's own column (in `pageW` units).
  const pageToOffsetX = useCallback(
    (page: number) =>
      phoneLandscape
        ? (windowMaxPage - page) * pageW
        : pageOffsetX(page, pageW, MUSHAF_TOTAL_PAGES),
    [pageW, phoneLandscape, windowMaxPage],
  );

  // The scroll offset that brings the SPREAD containing `page` flush to the
  // viewport's left edge (see mushafSpread.ts for the RTL pairing model).
  const scrollXForPage = useCallback(
    (page: number) =>
      phoneLandscape
        ? (windowMaxPage - page) * pageW
        : scrollXForPageMath(page, pageW, MUSHAF_TOTAL_PAGES, dualPage),
    [dualPage, pageW, phoneLandscape, windowMaxPage],
  );

  // Re-anchor the scroll position when width changes (rotation, QR-4) —
  // offsets are width-dependent, so without this the visible page drifts.
  // In the windowed (phone-landscape) strip this also RE-CENTERS after a
  // page turn: the window slides with `currentPage`, so the same page has
  // a new offset in the new window.
  useEffect(() => {
    if (!didInitialScrollRef.current) return;
    scrollRef.current?.scrollTo({
      x: scrollXForPage(currentPage),
      y: 0,
      animated: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth, dualPage, phoneLandscape, phoneLandscape ? currentPage : 0]);

  const onScrollViewLayout = () => {
    if (didInitialScrollRef.current) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: scrollXForPage(initialPage),
        y: 0,
        animated: false,
      });
      didInitialScrollRef.current = true;
    }, 0);
  };

  // Header title follows the visible page's starting surah.
  //
  // ONLY for the legacy image reader. In text mode this component renders
  // nothing itself — it returns <MushafPhoneReader>/<MushafSpreadReader>
  // below, and those own the page state via `useMushafReaderCore`, which
  // runs the identical effect. `currentPage` here is the image reader's
  // own state and is frozen at `initialPage` for the whole text-mode
  // mount, so leaving this effect live made it a SECOND writer to the
  // header title that always reported the page the reader opened on.
  // Child effects flush before parent effects, so on every page turn the
  // split reader wrote the correct surah and this one immediately
  // overwrote it with the stale one (header stuck on the opening surah).
  useEffect(() => {
    if (textMode || !onTitleChange) return;
    const visiblePage = MUSHAF_PAGES.find(p => p.page === currentPage);
    if (!visiblePage) return;
    const surah = MUSHAF_SURAHS.find(
      s => s.number === visiblePage.start.surah,
    );
    if (surah) onTitleChange(mushafSurahName(surah, language));
  }, [currentPage, onTitleChange, textMode, language]);

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
        x: scrollXForPage(page),
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

  // Same guarantee as the split readers: the ayah sheet is an RN <Modal>
  // living in the activity window, so it must be dismissed BEFORE the
  // screen is popped, never together with it (see useOverlayDismissGuard).
  const closeOverlays = useCallback(() => {
    setSheetVisible(false);
    setJumpVisible(false);
  }, []);
  useOverlayDismissGuard(sheetVisible || jumpVisible, closeOverlays);

  // One stable callback for the whole list. Binding the page inside
  // `renderPage` handed every text page a fresh function on every render of
  // the reader, which defeated the memo on the page and on all fifteen of its
  // lines. Declared up here with the other hooks — `renderPage` sits after
  // several early returns.
  const handleWordLongPress = useCallback(
    (ref: { surah: number; ayah: number }, page: number) => {
      setSelected({ ...ref, page });
      setSheetScrollAudio(false);
      setSheetVisible(true);
    },
    [],
  );

  const jumpToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, page));
    setCurrentPage(clamped);
    scrollRef.current?.scrollTo({
      x: scrollXForPage(clamped),
      y: 0,
      animated: false,
    });
    commitPage(clamped, clamped); // record position; not a sequential turn
    setJumpVisible(false);
    setJumpText('');
  };

  /** Chevron/pointer page turn (plan v2 §C2). `dir` is READING direction:
   *  +1 = next page (visually the LEFT neighbour — the mushaf advances
   *  right-to-left), -1 = previous. Steps a whole spread in dual mode. */
  const turnPage = (dir: 1 | -1) => {
    const step = dualPage ? 2 : 1;
    const target = Math.max(
      1,
      Math.min(MUSHAF_TOTAL_PAGES, currentPage + dir * step),
    );
    if (target === currentPage) return;
    // Pointer navigation takes over from recitation follow, same as a swipe.
    followRef.current = false;
    setTimeout(() => {
      followRef.current = true;
    }, 30_000);
    commitPage(target, currentPage);
    setCurrentPage(target);
    scrollRef.current?.scrollTo({
      x: scrollXForPage(target),
      y: 0,
      animated: true,
    });
  };

  // ── Reader layout ───────────────────────────────────────────────────
  // (Computed before the gate returns so hooks below can use it.)
  // iOS floats a translucent nav header over the content; keep our page
  // chrome below it. Android's opaque header already offsets the view.
  const navOverlayPad =
    !isFullscreen && Platform.OS === 'ios' ? headerHeight : 0;
  // Slim gutters (v2.7.28 screen-use pass): the page background matches
  // the reader background, so wide gutters bought nothing but smaller text.
  const horizontalPadding = 4;
  // The page header (surah/juz + night pill) and footer (page number)
  // stay visible in fullscreen too (v2.7.29).
  const headerFooterReserve = 76;
  // Floating mini-player card: 3px track + row (~54) + 10 bottom margin.
  const playerReserve = playback.active ? 68 : 0;
  const maxWidth = pageW - horizontalPadding * 2;
  const estMaxHeight =
    windowHeight -
    navOverlayPad -
    headerFooterReserve -
    playerReserve -
    (isFullscreen ? insets.top + insets.bottom : 0);
  // Measured page viewport (the flex imageWrap box) — authoritative
  // once known, since the estimate can't see the real nav header or
  // chrome heights. The estimate covers the first frame and the frames
  // right after a fullscreen toggle (stale-mode measurements are
  // ignored). Critical for the vertical stretch (v2.7.29): an
  // overshooting height would stretch text under the page chrome.
  const maxHeight =
    wrapBox.h > 0 && wrapBox.fs === isFullscreen
      ? Math.max(120, wrapBox.h - playerReserve - 6)
      : estMaxHeight;
  /**
   * Phone-landscape reading-zoom width (v2.7.43 — rotation stability).
   * See `landscapePageWidthDp`: the VISIBLE page is zoomed ~1.6× portrait
   * and clamped so the render cache still serves it; the mounted
   * neighbours stay portrait-sized because they're offscreen. Zooming all
   * three (and past the cache line) is what allocated ~130 MB of bitmap
   * per rotation and made it crawl, then OOM.
   */
  const landscapeWidth = (cropW: number, isCurrentPage: boolean) =>
    // Text pages have no bitmap and no render cache, so none of that applies:
    // the page is simply set at the full width and the viewport scrolls it.
    // Re-laying out text on rotation costs nothing, which is the whole point.
    textMode
      ? maxWidth
      : landscapePageWidthDp({
          availableWidthDp: maxWidth,
          shortSideDp:
            Math.min(windowWidth, windowHeight) - horizontalPadding * 2,
          cropW,
          pixelRatio: PixelRatio.get(),
          isCurrentPage,
        });

  let imageWidth = maxWidth;
  let imageHeight = imageWidth / IMAGE_ASPECT;
  if (!phoneLandscape && imageHeight > maxHeight) {
    imageHeight = maxHeight;
    imageWidth = imageHeight * IMAGE_ASPECT;
  }

  /**
   * Per-page display geometry (v2.7.28). Pages with a content crop
   * render the crop region scaled to fill the available box; the
   * underlying image is drawn larger inside an overflow-hidden window.
   * `fullW`/`fullH` are the virtual full-image dimensions — geometry
   * hit-testing and the overlay both work in that space.
   *
   * Vertical stretch (v2.7.29): the Madinah page is a fixed ~0.61
   * aspect while phones are ~0.45, so a width-fit page letterboxes
   * vertically. Full-text pages (3+, i.e. every cropped page) stretch
   * the text block vertically — capped so the calligraphy never looks
   * drawn out — to use that space. Pages 1–2 keep their decorative
   * frames undistorted.
   */
  const pageDims = (page: number) => {
    const crop = mushafPageCrop(page);
    // Only the page being read gets the landscape zoom — see
    // landscapeWidth / landscapePageWidthDp.
    const isCurrentPage = page === currentPage;
    if (!crop) {
      const w = phoneLandscape ? landscapeWidth(1, isCurrentPage) : imageWidth;
      const h = phoneLandscape ? w / IMAGE_ASPECT : imageHeight;
      return { dispW: w, dispH: h, fullW: w, fullH: h, offX: 0, offY: 0 };
    }
    const cropAspect = (crop.w * 2600) / (crop.h * 4206);
    // Phone landscape reading-zoom: zoomed width, unstretched — the
    // vertical ScrollView provides the height.
    let dispW = phoneLandscape
      ? landscapeWidth(crop.w, isCurrentPage)
      : maxWidth;
    let dispH = dispW / cropAspect;
    if (!phoneLandscape) {
      if (dispH > maxHeight) {
        dispH = maxHeight;
        dispW = dispH * cropAspect;
      } else if (page > 2) {
        // Stretch the text vertically into the free space (full-text
        // pages only — 1–2 are decorative plates that must keep their
        // true proportions even though they also carry a crop).
        dispH = Math.min(maxHeight, dispH * MAX_VERTICAL_STRETCH);
      }
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

  /**
   * Render-cache request width (physical px). Derived from the display
   * HEIGHT so the cached bitmap's rows map 1:1 onto screen rows after
   * the vertical stretch — thin horizontal strokes stay sharp. The GPU
   * then minifies horizontally by at most 1/1.5 ≈ 0.67–1×, which stays
   * clean. With no stretch this equals the display width exactly.
   */
  const cachePxWidth = (d: { fullH: number }) =>
    Math.round(
      PixelRatio.getPixelSizeForLayoutSize(d.fullH) * IMAGE_ASPECT,
    );

  // ── Display-size render cache (v2.7.28 sharpness fix) ───────────────
  // Re-render when a sharper exact-size page copy lands on disk.
  useSyncExternalStore(
    subscribeRenderCache,
    getRenderCacheVersion,
    getRenderCacheVersion,
  );
  // Warm exact-size copies for the mounted pages. Runs after every
  // render; ensureScaledPage dedupes, so steady state is a no-op.
  useEffect(() => {
    if (!useLocalFiles || downloadStatus !== 'ready') return;
    // Warm the same window the reader mounts (wider in dual-page mode).
    const warm = dualPage
      ? [
          currentPage - 2,
          currentPage - 1,
          currentPage,
          currentPage + 1,
          currentPage + 2,
          currentPage + 3,
        ]
      : [currentPage - 1, currentPage, currentPage + 1];
    for (const p of warm) {
      if (p < 1 || p > MUSHAF_TOTAL_PAGES) continue;
      const d = pageDims(p);
      ensureScaledPage(p, cachePxWidth(d), 2600);
    }
  });

  // ── Gate screens ────────────────────────────────────────────────────
  // Ahead of the reader itself, and of both renderers: nothing opens until
  // the mushaf is on the device.
  //
  // The font-rendered mushaf is larger than the image one it replaced (604
  // typefaces, ~180 MB, against ~120 MB of pages) — worth saying out loud on
  // the button rather than leaving someone to discover it.
  const gateSizeMb = textMode ? 180 : 120;
  const gateCta =
    lastRunFailed > 0
      ? t('quran.mushafDownloadRetryCta', 'Retry missing pages')
      : t('quran.mushafDownloadCta', {
          defaultValue: 'Download mushaf (~{{size}} MB)',
          size: gateSizeMb,
        });

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
            : t('quran.mushafDownloadBody', {
                defaultValue:
                  'The Madinah mushaf is around {{size}} MB. It is not bundled in the app — download it once and it stays on your device.',
                size: gateSizeMb,
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
          accessibilityLabel={gateCta}
          onPress={startDownload}
          style={[styles.cta, { backgroundColor: palette.accentSolid }]}>
          <Text style={styles.ctaLabel}>{gateCta}</Text>
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

  // ── Text mode routes to the split readers (mushaf-reader-split plan) ─
  // The device question is answered ONCE, at module scope: phones get the
  // one-component portrait+landscape pager, large screens the spread-as-
  // item pager. Image mode keeps the legacy paths below untouched until it
  // retires (plan step 4).
  if (textMode) {
    const readerProps = {
      surahNumber,
      initialPage: initialPageProp,
      isFullscreen,
      onToggleFullscreen,
      audioSheetSignal,
      onTitleChange,
    };
    return DEVICE_CLASS === 'phone' ? (
      <MushafPhoneReader {...readerProps} />
    ) : (
      <MushafSpreadReader {...readerProps} />
    );
  }

  const pageMeta = (page: number) =>
    MUSHAF_PAGES.find(p => p.page === page) ?? MUSHAF_PAGES[0];

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
      d.fullH,
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
    // Prefer the exact-display-size copy (sharpness fix, v2.7.28);
    // fall back to the original file / stream while it generates.
    const scaledPath = useLocalFiles
      ? // Nearest ready copy, not just the exact bucket: on rotation the
        // exact one doesn't exist yet, and falling back to the 2600 px
        // original meant a ~44 MB decode per mounted page mid-rotation.
        nearestScaledPagePath(page, cachePxWidth(dims))
      : null;
    const imageSource = scaledPath
      ? { uri: `file://${scaledPath}` }
      : mushafPageAsset(page, useLocalFiles ? pageFilePath(page) : null);
    return (
      <View
        key={page}
        style={{
          position: 'absolute',
          top: 0,
          left: pageToOffsetX(page),
          width: pageW,
          height: '100%',
          backgroundColor: pageBg,
        }}>
        {/* Header + footer stay in fullscreen (v2.7.29): surah name
            replaces the Juz label there (the nav header is hidden), and
            the night toggle + page number remain reachable.

            Dual-page (plan v2 §C1): ONE chrome set per SPREAD, not per
            page — the odd (visually right) page carries the Juz/surah
            label at the spread's outer right corner and the even (left)
            page carries the night pill at the outer left corner. Both
            columns keep the header row so the page boxes stay equal. */}
        <View
          style={[
            styles.pageHeader,
            { marginTop: navOverlayPad },
            // Label lives at the spread's OUTER right corner (the row is
            // physically LTR — the app drives RTL via text, not
            // I18nManager); the pill's default start position is already
            // the outer left corner of the left page.
            dualPage && page % 2 === 1 && styles.pageHeaderLabelEnd,
          ]}>
            {!dualPage || page % 2 === 1 ? (
              <Text
                numberOfLines={1}
                style={[styles.pageHeaderText, { color: ornament }]}>
                {isFullscreen
                  ? (() => {
                      const s = MUSHAF_SURAHS.find(
                        x => x.number === meta.start.surah,
                      );
                      return s ? mushafSurahName(s) : '';
                    })()
                  : t('quran.juzLabel', {
                      defaultValue: 'Juz {{juz}}',
                      juz: easternNumerals(meta.juz),
                    })}
              </Text>
            ) : null}
            {!dualPage || page % 2 === 0 ? (
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
            ) : null}
        </View>
        <PageViewport
          phoneLandscape={phoneLandscape}
          onMeasured={h => {
            setWrapBox(prev =>
              Math.abs(prev.h - h) > 1 || prev.fs !== isFullscreen
                ? { h, fs: isFullscreen }
                : prev,
            );
          }}>
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
            {textMode ? (
              <MushafTextPageSurface
                page={page}
                width={dims.dispW}
                height={dims.dispH}
                nightMode={nightMode}
                accentColor={palette.accentSolid}
                selected={
                  sheetVisible && selected?.page === page ? selected : null
                }
                playing={
                  playback.active && playback.playing ? playback.active : null
                }
                // Only the page being read warms its neighbours' fonts.
                prefetchRadius={page === currentPage ? 2 : 0}
                // Single tap anywhere on the page → fullscreen toggle (the
                // same gesture the enclosing Pressable gives the margins);
                // long press on an ayah → the ayah panel (tafsir, audio).
                onWordPress={() => onToggleFullscreen()}
                onWordLongPress={handleWordLongPress}
              />
            ) : (
            /* Inner surface at virtual full-image size; cropped pages
                shift it so the content window fills the pressable. */
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
                    source={imageSource}
                    style={{ width: dims.fullW, height: dims.fullH }}
                    // 'stretch' honors the (possibly vertically
                    // stretched) box exactly; for unstretched pages the
                    // box is aspect-correct so this equals 'contain'.
                    resizeMode="stretch"
                    fadeDuration={0}
                  />
                </ColorMatrix>
              ) : (
                <Image
                  source={imageSource}
                  style={{ width: dims.fullW, height: dims.fullH }}
                  resizeMode="stretch"
                  fadeDuration={0}
                />
              )}
              <MushafPageOverlay
                page={page}
                renderedWidth={dims.fullW}
                renderedHeight={dims.fullH}
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
            )}
          </Pressable>
        </PageViewport>
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
      </View>
    );
  };

  // Single mode mounts the current page + one on each side. Dual mode mounts
  // the current spread plus the neighbouring spread on each side (six pages)
  // so a swipe reveals the next facing pair without a blank frame.
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
        // `direction: 'ltr'` — the app tree is RTL in Arabic, and a
        // horizontal ScrollView under RTL measures its content offset from
        // the RIGHT, which parks this pager past the end of its content and
        // leaves the reader blank. Every offset here (`pageFromScroll`, the
        // scroll-to-page effect, the windowed strip) is a left-to-right
        // multiple of the page width; the mushaf's right-to-left page order
        // is expressed in those offsets, not by the UI language.
        style={styles.pagerLtr}
        onMomentumScrollEnd={e => {
          const x = e.nativeEvent.contentOffset.x;
          // The viewport frame is always screenWidth (= one page in single
          // mode, one spread in dual mode). In dual mode each snap step is two
          // pages; we land on the spread's right-hand (odd) page as "current".
          // Windowed (phone-landscape) strip: the slot index counts DOWN from
          // the highest mounted page (RTL), and the re-anchor effect recenters
          // the window afterwards.
          const clamped = phoneLandscape
            ? Math.max(
                1,
                Math.min(
                  MUSHAF_TOTAL_PAGES,
                  windowMaxPage - Math.round(x / screenWidth),
                ),
              )
            : pageFromScroll(
            x,
            screenWidth,
            MUSHAF_TOTAL_PAGES,
            dualPage,
          );
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
          // Windowed strip in phone landscape (see windowMaxPage) — the
          // full 604-page box would exceed Android's rasterisable width.
          width: phoneLandscape
            ? pageW * mountedPages.length
            : pageW * MUSHAF_TOTAL_PAGES,
          height: '100%',
        }}>
        {mountedPages.map(renderPage)}
      </ScrollView>

      {/* Pointer page-turn chevrons (plan v2 §C2). The mushaf advances
          right-to-left, so the LEFT chevron is NEXT and the right one is
          PREVIOUS. Faint at rest, solid on hover (Mac/iPad-trackpad).
          Purely additive — swipe/drag behavior is untouched. */}
      {showPagerChevrons ? (
        <>
          {currentPage < MUSHAF_TOTAL_PAGES ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.nextPage', 'Next page')}
              hitSlop={8}
              onPress={() => turnPage(1)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.chevron,
                styles.chevronLeft,
                {
                  backgroundColor: nightMode ? '#1d1d1d' : '#f4efe4',
                  opacity: hovered ? 0.95 : 0.4,
                },
              ]}>
              <Text style={[styles.chevronGlyph, { color: ornament }]}>‹</Text>
            </Pressable>
          ) : null}
          {currentPage > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.prevPage', 'Previous page')}
              hitSlop={8}
              onPress={() => turnPage(-1)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.chevron,
                styles.chevronRight,
                {
                  backgroundColor: nightMode ? '#1d1d1d' : '#f4efe4',
                  opacity: hovered ? 0.95 : 0.4,
                },
              ]}>
              <Text style={[styles.chevronGlyph, { color: ornament }]}>›</Text>
            </Pressable>
          ) : null}
        </>
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

/**
 * The page's viewport box (v2.7.41). Normally a centered flex box that the
 * page is fitted INTO; in phone-landscape reading-zoom it becomes a
 * vertical ScrollView so the width-fitted (taller-than-window) page can be
 * read by scrolling. The page Pressable child is identical in both modes,
 * so tap-to-fullscreen and long-press-for-ayah keep working — a stationary
 * long-press is delivered through a ScrollView untouched.
 */
function PageViewport({
  phoneLandscape,
  onMeasured,
  children,
}: {
  phoneLandscape: boolean;
  onMeasured: (h: number) => void;
  children: ReactNode;
}) {
  if (phoneLandscape) {
    return (
      <ScrollView
        style={styles.imageWrapScroll}
        contentContainerStyle={styles.imageWrapScrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled>
        {children}
      </ScrollView>
    );
  }
  return (
    <View
      style={styles.imageWrap}
      onLayout={e => onMeasured(e.nativeEvent.layout.height)}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  /** See the pager's `style` — the page strip is measured left-to-right. */
  pagerLtr: { direction: 'ltr' },
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
  // Dual-page: the odd (right) page shows only the label — push it to
  // the spread's outer right corner (§C1).
  pageHeaderLabelEnd: { justifyContent: 'flex-end' },
  // Pointer page-turn chevrons (§C2).
  chevron: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 40,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLeft: { left: 8 },
  chevronRight: { right: 8 },
  chevronGlyph: { fontSize: 30, fontWeight: '600', lineHeight: 34 },
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
  // Phone-landscape reading-zoom viewport (see PageViewport).
  imageWrapScroll: { flex: 1 },
  imageWrapScrollContent: { alignItems: 'center' },
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
