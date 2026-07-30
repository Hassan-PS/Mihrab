/**
 * Shared core for the split mushaf readers (docs/mushaf-reader-split-plan.md).
 *
 * `MushafPhoneReader` and `MushafSpreadReader` are pure layout: everything a
 * reader must DO — page state, last-read + khatmah recording, ayah selection,
 * recitation follow, jump-to-page, keep-awake, the header/footer chrome — is
 * one hook plus three small components here, with no layout opinions. The
 * legacy `MushafReader` keeps its own copies until image mode retires.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
import { useAppPalette } from '../hooks/useAppPalette';
import {
  easternNumerals,
  findPageForAyah,
  MUSHAF_PAGES,
  MUSHAF_SURAHS,
} from './pages';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import {
  recordKhatmahProgress,
  setLastRead,
  setQuranPrefs,
  useQuranState,
  type QuranState,
} from './quranState';
import { usePlaybackStatus, type PlaybackStatus } from './audio/playback';
import type { AyahRef } from './MushafTextPage';

/** The props contract every mushaf reader implements (see MushafReader). */
export type MushafReaderProps = {
  surahNumber: number;
  /** Open at an explicit page (deep links from Juz/Page/Bookmark nav). */
  initialPage?: number;
  isFullscreen: boolean;
  /** Single tap on the page toggles fullscreen — no exit button. */
  onToggleFullscreen: () => void;
  /** Increment to open the unified sheet scrolled to the recitation
   *  section (the header "Recitation" button). */
  audioSheetSignal?: number;
  onTitleChange?: (title: string) => void;
};

export type AyahSelection = AyahRef & { page: number };

/** First (surah, ayah) on a page, from the bundled page ranges — no
 *  dependency on the 2.6 MB image-geometry JSON the old reader loads. */
export function pageStartAyah(page: number): { surah: number; ayah: number } {
  const meta = MUSHAF_PAGES.find(p => p.page === page);
  return meta ? { ...meta.start } : { surah: 1, ayah: 1 };
}

export type MushafReaderCore = {
  quran: QuranState;
  playback: PlaybackStatus;
  nightMode: boolean;
  /** Page + reader background. */
  pageBg: string;
  /** The quiet gold used for page chrome (juz label, page number). */
  ornament: string;
  currentPage: number;
  /** Follow an external page change (jump, khatmah, recitation follow). */
  setCurrentPage: (page: number) => void;
  /** A user page turn settled: record last-read (+ khatmah on a sequential
   *  forward turn — step 1 on phones, step 2 across a spread). */
  commitPageTurn: (newPage: number, prevPage: number) => void;
  /** Manual navigation takes over from recitation follow for 30 s. */
  suspendFollow: () => void;
  selected: AyahSelection | null;
  sheetVisible: boolean;
  sheetScrollAudio: boolean;
  openSelection: (ref: AyahRef, page: number) => void;
  closeSheet: () => void;
  jumpVisible: boolean;
  openJump: () => void;
  closeJump: () => void;
  jumpToPage: (page: number) => void;
};

export function useMushafReaderCore({
  surahNumber,
  initialPage,
  audioSheetSignal,
  onTitleChange,
}: Pick<
  MushafReaderProps,
  'surahNumber' | 'initialPage' | 'audioSheetSignal' | 'onTitleChange'
>): MushafReaderCore {
  const quran = useQuranState();
  const playback = usePlaybackStatus();

  const nightMode = quran.prefs.mushafNightMode;
  const pageBg = nightMode ? '#101010' : '#ffffff';
  const ornament = nightMode ? '#c9b47a' : '#7a5e1f';

  const initial = useMemo(
    () => initialPage ?? findPageForAyah(surahNumber, 1),
    [surahNumber, initialPage],
  );
  const [currentPage, setCurrentPage] = useState(initial);

  // ── Keep the screen awake while reading (QR-13) ─────────────────────
  useEffect(() => {
    if (!quran.prefs.keepAwake) return;
    activateKeepAwake();
    return () => {
      deactivateKeepAwake();
    };
  }, [quran.prefs.keepAwake]);

  // ── Header title follows the visible page's starting surah ──────────
  useEffect(() => {
    if (!onTitleChange) return;
    const visiblePage = MUSHAF_PAGES.find(p => p.page === currentPage);
    if (!visiblePage) return;
    const surah = MUSHAF_SURAHS.find(s => s.number === visiblePage.start.surah);
    if (surah) onTitleChange(surah.englishName);
  }, [currentPage, onTitleChange]);

  // ── Last-read + khatmah on page turns (QR-10/21) ────────────────────
  const commitPageTurn = useCallback((newPage: number, prevPage: number) => {
    const first = pageStartAyah(newPage);
    setLastRead({
      surah: first.surah,
      ayah: first.ayah,
      page: newPage,
      mode: 'mushaf',
    });
    // Sequential forward turn = the page(s) left behind are completed.
    // A spread pager steps by 2; `recordKhatmahProgress` is a high-water
    // mark, so recording the last completed page covers the pair.
    if (newPage === prevPage + 1) recordKhatmahProgress(prevPage);
    else if (newPage === prevPage + 2) recordKhatmahProgress(prevPage + 1);
  }, []);

  // ── Recitation follow (QR-17) ───────────────────────────────────────
  const followRef = useRef(true);
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspendFollow = useCallback(() => {
    followRef.current = false;
    if (followTimer.current) clearTimeout(followTimer.current);
    followTimer.current = setTimeout(() => {
      followRef.current = true;
    }, 30_000);
  }, []);
  useEffect(
    () => () => {
      if (followTimer.current) clearTimeout(followTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!playback.active || !playback.playing || !followRef.current) return;
    const page = findPageForAyah(playback.active.surah, playback.active.ayah);
    setCurrentPage(prev => (page !== prev ? page : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.active?.surah, playback.active?.ayah, playback.playing]);

  // ── Ayah selection (QR-8) ───────────────────────────────────────────
  const [selected, setSelected] = useState<AyahSelection | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetScrollAudio, setSheetScrollAudio] = useState(false);

  const openSelection = useCallback((ref: AyahRef, page: number) => {
    setSelected({ surah: ref.surah, ayah: ref.ayah, page });
    setSheetScrollAudio(false);
    setSheetVisible(true);
  }, []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);

  // Header "Recitation" button → unified sheet at the audio section,
  // anchored to the first ayah of the visible page (or the playing one).
  const lastAudioSignal = useRef(audioSheetSignal ?? 0);
  useEffect(() => {
    if (audioSheetSignal == null) return;
    if (audioSheetSignal === lastAudioSignal.current) return;
    lastAudioSignal.current = audioSheetSignal;
    const anchor = playback.active ?? pageStartAyah(currentPage);
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
  const jumpToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, page));
      setCurrentPage(clamped);
      commitPageTurn(clamped, clamped); // record position; not a sequential turn
      setJumpVisible(false);
    },
    [commitPageTurn],
  );

  return {
    quran,
    playback,
    nightMode,
    pageBg,
    ornament,
    currentPage,
    setCurrentPage,
    commitPageTurn,
    suspendFollow,
    selected,
    sheetVisible,
    sheetScrollAudio,
    openSelection,
    closeSheet,
    jumpVisible,
    openJump: useCallback(() => setJumpVisible(true), []),
    closeJump: useCallback(() => setJumpVisible(false), []),
    jumpToPage,
  };
}

// ── Chrome ────────────────────────────────────────────────────────────

/**
 * The page header row: juz label (surah name in fullscreen, where the nav
 * header is hidden) and the night-mode pill. A spread splits the pair
 * across its outer corners: the odd/right page carries the label, the
 * even/left page the pill — pass `show` accordingly.
 */
export function MushafPageHeader({
  page,
  isFullscreen,
  nightMode,
  ornament,
  show = 'both',
}: {
  page: number;
  isFullscreen: boolean;
  nightMode: boolean;
  ornament: string;
  show?: 'both' | 'label' | 'pill';
}) {
  const { t } = useTranslation();
  const meta = MUSHAF_PAGES.find(p => p.page === page) ?? MUSHAF_PAGES[0];
  return (
    <View
      style={[
        styles.pageHeader,
        show === 'label' && styles.pageHeaderLabelEnd,
      ]}>
      {show !== 'pill' ? (
        <Text
          numberOfLines={1}
          style={[styles.pageHeaderText, { color: ornament }]}>
          {isFullscreen
            ? MUSHAF_SURAHS.find(s => s.number === meta.start.surah)
                ?.englishName ?? ''
            : t('quran.juzLabel', {
                defaultValue: 'Juz {{juz}}',
                juz: easternNumerals(meta.juz),
              })}
        </Text>
      ) : null}
      {show !== 'label' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            nightMode
              ? t('quran.switchToLight', 'Switch to light page')
              : t('quran.switchToNight', 'Switch to night page')
          }
          hitSlop={8}
          onPress={() => setQuranPrefs({ mushafNightMode: !nightMode })}
          style={[styles.nightPill, { borderColor: ornament }]}>
          <Text style={[styles.nightPillText, { color: ornament }]}>
            {nightMode
              ? // U+FE0E variation selectors force the monochrome text
                // glyphs — Android otherwise renders the sun as a colored
                // emoji, which shouts against the quiet page.
                `☀︎ ${t('quran.lightShort', 'Light')}`
              : `☾︎ ${t('quran.nightShort', 'Night')}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Page-number medallion — Eastern numerals; tap opens jump-to-page. */
export function MushafPageFooter({
  page,
  ornament,
  onPress,
}: {
  page: number;
  ornament: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.pageFooter}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('quran.jumpToPage', 'Go to page')}
        onPress={onPress}
        style={[styles.pageNumberFrame, { borderColor: ornament }]}>
        <Text style={[styles.pageNumber, { color: ornament }]}>
          {easternNumerals(page)}
        </Text>
      </Pressable>
    </View>
  );
}

/** Jump-to-page modal (QR-11) — same card as the legacy reader's. */
export function MushafJumpModal({
  visible,
  onClose,
  onJump,
}: {
  visible: boolean;
  onClose: () => void;
  onJump: (page: number) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [text, setText] = useState('');
  useEffect(() => {
    if (!visible) setText('');
  }, [visible]);
  if (!visible) return null;
  const submit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n >= 1) onJump(n);
  };
  return (
    <View style={[styles.jumpBackdrop, { backgroundColor: palette.overlay }]}>
      <View style={[styles.jumpCard, { backgroundColor: palette.card }]}>
        <Text style={[styles.jumpTitle, { color: palette.text }]}>
          {t('quran.jumpToPage', 'Go to page')}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
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
          onSubmitEditing={submit}
        />
        <View style={styles.jumpRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={onClose}
            style={styles.jumpBtn}>
            <Text style={{ color: palette.muted, fontWeight: '600' }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.go', 'Go')}
            onPress={submit}
            style={styles.jumpBtn}>
            <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
              {t('quran.go', 'Go')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  // Spread: the odd (right) page shows only the label — push it to the
  // spread's outer right corner.
  pageHeaderLabelEnd: { justifyContent: 'flex-end' },
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
  pageFooter: { alignItems: 'center', paddingTop: 6, paddingBottom: 10 },
  pageNumberFrame: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderRadius: 18,
    alignItems: 'center',
  },
  pageNumber: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
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
