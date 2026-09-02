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
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
import { useAppPalette } from '../hooks/useAppPalette';
import {
  easternNumerals,
  findPageForAyah,
  firstAyahOfPage,
  pagesForRiwayah,
  surahsForRiwayah,
  totalPagesForRiwayah,
} from './pages';
import { DEFAULT_RIWAYAH, resolveRiwayah, type RiwayahId } from './riwayat';
import {
  KHATMAH_COLOR,
  activeKhatmah,
  khatmahCurrentPortion,
  khatmahMarkerAyah,
  recordKhatmahProgress,
  setLastRead,
  setQuranPrefs,
  useQuranState,
  useQuranHydrated,
  type QuranBookmark,
  type QuranState,
} from './quranState';
import { usePlaybackStatus, type PlaybackStatus } from './audio/playback';
import { mushafSurahName } from './surahName';
import type { AyahRef } from './MushafTextPage';
import type { KeyPagingTarget } from './useKeyPaging';
import {
  formatDayWhen,
  khatmahDayWhen,
  type DayWhen,
} from './khatmahDayWhen';

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
  /**
   * Where the reader on screen publishes its own page turn.
   *
   * The keyboard is bound ONCE, in `MushafReader`, because that is the
   * Quran reader — the split text readers are how it draws itself on a
   * phone and on a large screen, not separate features. A reader that
   * renders registers here through `useRegisterKeyPaging`, and the single
   * binding drives whichever one is actually on screen.
   */
  keyTurn?: KeyPagingTarget;
};

export type AyahSelection = AyahRef & { page: number };

/** First (surah, ayah) on a page, from the bundled page ranges — no
 *  dependency on the 2.6 MB image-geometry JSON the old reader loads. */
export function pageStartAyah(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): { surah: number; ayah: number } {
  const meta = pagesForRiwayah(riwayah).find(p => p.page === page);
  return meta ? { ...meta.start } : { surah: 1, ayah: 1 };
}

/**
 * Never let a presented `<Modal>` be torn down by navigation.
 *
 * An RN `<Modal>` is NOT part of the screen's view tree: it is an Android
 * `Dialog` / an iOS presented view controller attached to the ACTIVITY
 * WINDOW, which sits above the whole navigator. When React unmounts the
 * modal host while `visible` is still true, the host view is dropped
 * without ever transitioning to hidden — and the orphaned window stays on
 * top of the app, swallowing every touch on every screen, two levels up
 * the stack included. Only an app restart clears it. (`Modal.js` renders
 * `null` the moment `visible` goes false, so a hide-then-unmount is safe;
 * an unmount-while-visible is not.)
 *
 * So while the reader has an overlay open, a pop is intercepted, the
 * overlay is closed, and the SAME navigation action is re-dispatched once
 * the overlay has actually gone — by which time the modal was dismissed
 * the ordinary way. `usePreventRemove` (not a bare `beforeRemove`
 * listener) because native-stack also has to block the iOS swipe-back
 * gesture and the Android system back, which it does via
 * `preventNativeDismiss` / `nativeBackButtonDismissalEnabled`.
 */
export function useOverlayDismissGuard(
  overlayOpen: boolean,
  closeOverlays: () => void,
): void {
  const navigation = useNavigation();
  const closeRef = useRef(closeOverlays);
  closeRef.current = closeOverlays;
  const pendingRef = useRef<Parameters<typeof navigation.dispatch>[0] | null>(
    null,
  );

  usePreventRemove(overlayOpen, ({ data }) => {
    pendingRef.current = data.action;
    closeRef.current();
  });

  useEffect(() => {
    if (overlayOpen) return;
    const action = pendingRef.current;
    if (!action) return;
    pendingRef.current = null;
    // One turn of the loop so the modal's `visible={false}` commit reaches
    // native (and its dismissal starts) before the screen goes away.
    const timer = setTimeout(() => navigation.dispatch(action), 0);
    return () => clearTimeout(timer);
  }, [overlayOpen, navigation]);
}

/**
 * The standing marks a page carries, ready to hand to the surface.
 *
 * Derived here rather than in each reader because there are four of them,
 * and the fifth is exactly where one copy gets forgotten — the same
 * argument `MushafTextPageSurface` makes for owning the renderer choice.
 */
export type AyahMarkProps = {
  bookmarks: readonly QuranBookmark[];
  khatmahPosition: { surah: number; ayah: number } | null;
  khatmahTarget: { surah: number; ayah: number } | null;
};

/**
 * Where the portion in hand ends, in the muṣḥaf on screen.
 *
 * The page is resolved through the AYAH, so it is the right page in
 * either riwayah — the same reason `khatmahCurrentPage` re-resolves a
 * pinned position rather than trusting the number it was pinned with.
 */
export type KhatmahFinish = {
  page: number;
  day: number;
  /** When that day is due — "today", "tomorrow", a weekday or a date. */
  when: DayWhen;
};

export type MushafReaderCore = {
  quran: QuranState;
  /** Spread straight into a page surface: `{...core.marks}`. */
  marks: AyahMarkProps;
  /** The page carrying the finish line, for the footer's pill. Null with
   *  no plan, and null once the book is read. */
  finish: KhatmahFinish | null;
  playback: PlaybackStatus;
  /** The muṣḥaf on screen. Every page number in this object is ITS page. */
  riwayah: RiwayahId;
  /** Pages in that muṣḥaf — not assumed to be 604. */
  totalPages: number;
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
  /** Cancel a suspension: the user did something that means "follow again". */
  resumeFollow: () => void;
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

  // Re-resolved rather than trusted: the stored preference is hardened on
  // load, but a build that no longer carries a riwayah's data (an F-Droid
  // build without it, a downgrade) must still open on a muṣḥaf it has.
  const riwayah = resolveRiwayah(quran.prefs.riwayah);
  const totalPages = totalPagesForRiwayah(riwayah);

  const nightMode = quran.prefs.mushafNightMode;
  // Until the stored preference has actually been read, `nightMode` is the
  // default `false` and painting on it would put a pure-white page on screen
  // for as long as the read takes, then swap it for near-black. Staying
  // transparent lets the screen's own background show through instead, so the
  // page colour appears once — when it is known to be right. The window is
  // 5K on a Mac, which is where guessing wrong is impossible to miss.
  const hydrated = useQuranHydrated();
  const pageBg = !hydrated ? 'transparent' : nightMode ? '#101010' : '#ffffff';
  const ornament = nightMode ? '#c9b47a' : '#7a5e1f';

  const initial = useMemo(
    () => initialPage ?? findPageForAyah(surahNumber, 1, riwayah),
    // Deliberately not keyed on the riwayah: this is the page the reader
    // OPENS at, and re-deriving it on a switch would send someone back to
    // the start of the surah instead of leaving them where they were. The
    // switch is handled where the place is actually kept, below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surahNumber, initialPage],
  );
  const [currentPage, setCurrentPage] = useState(initial);

  // ── Switching riwayah keeps your place ──────────────────────────────
  //
  // Page 300 of a Warsh muṣḥaf is not page 300 of a Hafs one, so carrying
  // the NUMBER across would move the reader somewhere they did not ask to
  // be. The ayah is the coordinate the two agree on (`ayahIndex.ts`): the
  // page becomes its first ayah, and that ayah becomes whatever page holds
  // it in the muṣḥaf now on screen.
  const previousRiwayah = useRef(riwayah);
  useEffect(() => {
    const from = previousRiwayah.current;
    if (from === riwayah) return;
    previousRiwayah.current = riwayah;
    setCurrentPage(prev => {
      const at = firstAyahOfPage(prev, from);
      return findPageForAyah(at.surah, at.ayah, riwayah);
    });
  }, [riwayah]);

  // ── Keep the screen awake while reading (QR-13) ─────────────────────
  useEffect(() => {
    if (!quran.prefs.keepAwake) return;
    activateKeepAwake();
    return () => {
      deactivateKeepAwake();
    };
  }, [quran.prefs.keepAwake]);

  // ── Header title follows the visible page's starting surah ──────────
  // …and the app language: an Arabic UI gets الفاتحة, not "Al-Fatihah".
  // `language` is a dependency because the title is pushed to the navigator
  // imperatively, so nothing else would re-run this after a language change.
  const { i18n: i18nInstance } = useTranslation();
  const language = i18nInstance.language;
  useEffect(() => {
    if (!onTitleChange) return;
    const visiblePage = pagesForRiwayah(riwayah).find(
      p => p.page === currentPage,
    );
    if (!visiblePage) return;
    const surah = surahsForRiwayah(riwayah).find(
      s => s.number === visiblePage.start.surah,
    );
    if (surah) onTitleChange(mushafSurahName(surah, language));
  }, [currentPage, onTitleChange, language, riwayah]);

  // ── Last-read + khatmah on page turns (QR-10/21) ────────────────────
  const commitPageTurn = useCallback(
    (newPage: number, prevPage: number) => {
      const first = pageStartAyah(newPage, riwayah);
      setLastRead({
        surah: first.surah,
        ayah: first.ayah,
        page: newPage,
        mode: 'mushaf',
      });
      // Sequential forward turn = the page(s) left behind are completed.
      // A spread pager steps by 2; `recordKhatmahProgress` is a high-water
      // mark, so recording the last completed page covers the pair. The
      // riwayah goes with it — the page is converted to an ayah count
      // before it is stored, so progress means the same thing either way.
      if (newPage === prevPage + 1) recordKhatmahProgress(prevPage, riwayah);
      else if (newPage === prevPage + 2)
        recordKhatmahProgress(prevPage + 1, riwayah);
    },
    [riwayah],
  );

  // ── Recitation follow (QR-17) ───────────────────────────────────────
  //
  // Suspension exists so the reader does not yank someone back mid-swipe
  // when they have deliberately gone to look at another page. That much is
  // right. What it could not do was tell a deliberate swipe from the
  // incidental finger travel of a long-press — and a long-press on the page
  // is exactly how the ayah sheet opens, which is where "play from here"
  // lives. So the gesture that STARTED playback routinely disabled
  // following it, for thirty seconds, from the moment it began. Reported as
  // "the app stays stuck on the same page while the audio continues" (#12).
  //
  // Two ways out of a suspension now, besides the timer:
  //   • starting playback. It is an explicit "follow this" and there is no
  //     reading of it under which the user wants to be left behind.
  //   • a drag that ends on the page it started on. Nothing was navigated
  //     to, so nothing needs protecting from.
  //
  // State rather than a ref, deliberately. As a ref the effect could not
  // re-run when the suspension lifted, so following resumed only at the
  // NEXT ayah boundary — up to a whole ayah of silence on the wrong page.
  const [followSuspended, setFollowSuspended] = useState(false);
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearFollowTimer = () => {
    if (followTimer.current) {
      clearTimeout(followTimer.current);
      followTimer.current = null;
    }
  };
  const suspendFollow = useCallback(() => {
    setFollowSuspended(true);
    clearFollowTimer();
    followTimer.current = setTimeout(() => setFollowSuspended(false), 30_000);
  }, []);
  const resumeFollow = useCallback(() => {
    clearFollowTimer();
    setFollowSuspended(false);
  }, []);
  useEffect(() => clearFollowTimer, []);

  // A new playback session clears any suspension. Keyed on the transition
  // into playing, not on `playing` itself, so pausing and resuming does not
  // override a swipe the user made while it was paused.
  const wasPlaying = useRef(false);
  useEffect(() => {
    const nowPlaying = Boolean(playback.active && playback.playing);
    if (nowPlaying && !wasPlaying.current) resumeFollow();
    wasPlaying.current = nowPlaying;
  }, [playback.active, playback.playing, resumeFollow]);

  useEffect(() => {
    if (!playback.active || !playback.playing || followSuspended) return;
    const page = findPageForAyah(
      playback.active.surah,
      playback.active.ayah,
      riwayah,
    );
    setCurrentPage(prev => (page !== prev ? page : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playback.active?.surah,
    playback.active?.ayah,
    playback.playing,
    followSuspended,
    riwayah,
  ]);

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
    const anchor = playback.active ?? pageStartAyah(currentPage, riwayah);
    setSelected({
      surah: anchor.surah,
      ayah: anchor.ayah,
      page: findPageForAyah(anchor.surah, anchor.ayah, riwayah),
    });
    setSheetScrollAudio(true);
    setSheetVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSheetSignal]);

  // ── Jump-to-page (QR-11) ────────────────────────────────────────────
  const [jumpVisible, setJumpVisible] = useState(false);
  const jumpToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(totalPages, page));
      setCurrentPage(clamped);
      commitPageTurn(clamped, clamped); // record position; not a sequential turn
      setJumpVisible(false);
    },
    [commitPageTurn, totalPages],
  );

  // Leaving the reader must never tear down a presented overlay — see
  // `useOverlayDismissGuard`. The ayah sheet is an RN <Modal>; the jump
  // card is in-tree but is closed here too so "back" always means "close
  // what is open first", on both platforms.
  const closeOverlays = useCallback(() => {
    setSheetVisible(false);
    setJumpVisible(false);
  }, []);
  useOverlayDismissGuard(sheetVisible || jumpVisible, closeOverlays);

  const marks = useMemo<AyahMarkProps>(() => {
    const plan = activeKhatmah(quran);
    return {
      bookmarks: quran.bookmarks,
      khatmahPosition: plan?.position ?? null,
      // The finish line for the portion in hand. Null with no plan, and
      // null once the book is read — there is nothing left to aim at.
      khatmahTarget: plan ? khatmahMarkerAyah(plan) : null,
    };
  }, [quran]);

  const finish = useMemo<KhatmahFinish | null>(() => {
    const plan = activeKhatmah(quran);
    if (!plan) return null;
    const at = khatmahMarkerAyah(plan);
    if (!at) return null;
    const day = khatmahCurrentPortion(plan).day;
    return {
      page: findPageForAyah(at.surah, at.ayah, riwayah),
      day,
      // A day number means nothing without a calendar beside it.
      when: khatmahDayWhen(plan.startedAt, day),
    };
  }, [quran, riwayah]);

  return {
    quran,
    marks,
    finish,
    playback,
    riwayah,
    totalPages,
    nightMode,
    pageBg,
    ornament,
    currentPage,
    setCurrentPage,
    commitPageTurn,
    suspendFollow,
    resumeFollow,
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

/**
 * A measured dimension that only reaches the page once it has stopped moving.
 *
 * Toggling fullscreen is not one layout, it is a burst of them: the nav header
 * goes, the status bar goes, the safe-area insets change, and the list
 * re-measures after each. Every one of those published a new page-box height,
 * and a mushaf page — 15 justified lines, ~260 drawn pieces — was laid out at
 * each. Measured on an emulator, one toggle produced line heights of 87.1,
 * 84.1, 86.1 and finally 97.1 dp over 184 ms: four full text layouts of every
 * mounted page, three of them thrown away before a frame was ever shown at
 * that size.
 *
 * Memoization cannot help with this — the props genuinely differ each time.
 * The fix is to stop asking the page to lay out at sizes that are on their way
 * somewhere else. The first measurement is taken immediately, since there is
 * nothing on screen yet to protect; after that a change has to hold still for
 * `quietMs` before it is published. The window is comfortably inside the
 * chrome's own transition, so the page resizes once, when the chrome settles.
 */
export function useSettledMeasure(value: number, quietMs = 100): number {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return;
    // First real measurement, or a reset to "unmeasured" — no reason to wait.
    if (settled === 0 || value === 0) {
      setSettled(value);
      return;
    }
    const id = setTimeout(() => setSettled(value), quietMs);
    return () => clearTimeout(id);
  }, [value, settled, quietMs]);
  return settled;
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
  riwayah = DEFAULT_RIWAYAH,
  show = 'both',
}: {
  page: number;
  isFullscreen: boolean;
  nightMode: boolean;
  ornament: string;
  /** Which muṣḥaf's page this is — the juz label is a fact about ITS print. */
  riwayah?: RiwayahId;
  show?: 'both' | 'label' | 'pill';
}) {
  const { t } = useTranslation();
  const pages = pagesForRiwayah(riwayah);
  const meta = pages.find(p => p.page === page) ?? pages[0];
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
            ? (() => {
                const surah = surahsForRiwayah(riwayah).find(
                  s => s.number === meta.start.surah,
                );
                return surah ? mushafSurahName(surah) : '';
              })()
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
  finish,
}: {
  page: number;
  ornament: string;
  onPress: () => void;
  /**
   * Shown only on the page the khatmah portion ends on.
   *
   * ── WHY IT IS HERE AND NOT BESIDE THE AYAH ────────────────────────
   *
   * The ayah itself is marked, in the khatmah's own colour, by
   * `ayahMarks` — that is what the reader looks for. The BUTTON cannot
   * sit next to it: a text page is one shaped paragraph per line, so
   * anything inline breaks the run the font was drawn to interlock, and
   * anything floated over the line covers the words it is pointing at.
   *
   * The footer is the one place on the page that is already chrome. It
   * is on the same page as the marked ayah, it is where the eye lands
   * at the end of a page anyway, and it costs the text nothing.
   */
  finish?: { day: number; when: DayWhen; onPress: () => void } | null;
}) {
  const { t, i18n } = useTranslation();
  const tr = (key: string, opts: { defaultValue: string }) =>
    t(key, opts) as string;
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
      {finish ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.finishDay', {
            day: finish.day,
            when: formatDayWhen(finish.when, tr, i18n.language),
            defaultValue: "Finish day {{day}}'s reading ({{when}})",
          })}
          onPress={finish.onPress}
          style={[styles.finishPill, { borderColor: KHATMAH_COLOR }]}>
          <Text style={[styles.finishPillLabel, { color: KHATMAH_COLOR }]}>
            {t('quran.finishDayShort', {
              day: finish.day,
              when: formatDayWhen(finish.when, tr, i18n.language),
              defaultValue: 'Finish day {{day}} ({{when}})',
            })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Jump-to-page modal (QR-11) — same card as the legacy reader's. */
export function MushafJumpModal({
  visible,
  onClose,
  onJump,
  totalPages = totalPagesForRiwayah(DEFAULT_RIWAYAH),
}: {
  visible: boolean;
  onClose: () => void;
  onJump: (page: number) => void;
  /** The muṣḥaf's own page count — the placeholder is a promise. */
  totalPages?: number;
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
          placeholder={`1–${totalPages}`}
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
  pageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 6,
    paddingBottom: 10,
  },
  finishPill: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderRadius: 18,
  },
  finishPillLabel: { fontSize: 12, fontWeight: '700' },
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
