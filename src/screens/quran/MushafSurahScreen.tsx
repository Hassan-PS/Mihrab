/**
 * The muṣḥaf, as a screen: the page reader plus everything the navigator
 * needs to know to hold it — the header controls, the page-coloured
 * chrome, fullscreen, orientation, and the one gesture the Mac has to
 * give up.
 *
 * Until 2 September this and the translation reader were one 980-line
 * screen switching on `isMushaf` in its header effect, its content style,
 * its sheets and its render. Every muṣḥaf concern — the riwayah chip, the
 * fullscreen button, the page-derived title, the night-mode header tint,
 * the trackpad gesture — was a branch inside something the translation
 * reader also ran. They share a route and a toggle, and that is all they
 * share; `QuranSurahScreen` is the route now, and this is the muṣḥaf.
 */
// tokens-ok: mushaf page tones for the reader chrome; not app palette
import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { TilawahIcon } from '../../quran/audio/PlaybackIcons';
import { TranslationIcon } from '../../theme/icons';
import { desktopSize } from '../../responsive/desktop';
import { useSettledMeasure } from '../../quran/mushafReaderCore';
import { TabBackButton } from '../../navigation/TabBackButton';
import { useAppPalette } from '../../hooks/useAppPalette';
import { isMacCatalyst } from '../../responsive/breakpoints';
import type { SurahIndex } from '../../quran/quran';
import { MushafReader } from '../../quran/MushafReader';
import { SIDEBAR_WIDTH, sidebarShown } from '../../quran/MushafIndexSidebar';
import {
  resolveRiwayah,
  riwayahById,
  riwayahChoiceExists,
} from '../../quran/riwayat';
import { useRiwayahAvailability } from '../../quran/riwayahData';
import { surahName } from '../../quran/surahName';
import { useSwitchRiwayah } from '../../quran/useSwitchRiwayah';
import { mushafTone, toneIsDark, TONE_PAGE_BG } from '../../quran/mushafTone';
import {
  useQuranState,
  useQuranHydrated,
} from '../../quran/quranState';
import type { RootStackParamList } from '../../navigation/types';
import {
  usePublishBackAnswer,
  type BackInterceptRef,
} from '../../navigation/backIntercept';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { SessionDot, useSessionColor } from '../../quran/SessionDot';
import { PageProgressMark, usePageProgress } from '../../quran/PageProgressMark';
import { RiwayahPicker } from '../../quran/RiwayahPicker';
import { SPACING } from '../../theme/tokens';
import { isRtlLanguage } from '../../i18n/layoutDirection';

const isIOS = Platform.OS === 'ios';

type Props = {
  surah: SurahIndex;
  surahNumber: number;
  /** Open at an explicit page (deep links from Juz/Page/Bookmark nav). */
  initialPage?: number;
  /**
   * Switch to the verse-by-verse reader, when there is one to switch to.
   *
   * Absent when `settings.quranVerseByVerseEnabled` is off, which is the
   * default — the muṣḥaf is then the only reader and the header does not
   * offer a way out of it.
   */
  onToggleMode?: () => void;
  /**
   * Where to publish what Android's back button should do here — see the
   * long note at its other end, in QuranSurahScreen.
   */
  onBackAnswer?: BackInterceptRef;
};

export function MushafSurahScreen({
  surah,
  surahNumber,
  initialPage,
  onToggleMode,
  onBackAnswer,
}: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const sessionColor = useSessionColor();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const quran = useQuranState();
  const quranHydrated = useQuranHydrated();
  // Paper, sepia or night — the header's tint and the content colour
  // follow the PAGE, not the app theme (on "auto" the page itself follows
  // the theme, which is the one place the two agree by construction).
  const tone = mushafTone(quran.prefs, palette.isDark);

  // Incrementing signal → the reader opens its unified sheet scrolled to
  // the recitation section (the header "Audio" button).
  const [audioSheetSignal, setAudioSheetSignal] = useState(0);
  const [riwayahPickerVisible, setRiwayahPickerVisible] = useState(false);

  /**
   * The riwayah the toggle would switch TO.
   *
   * Computed from the table, not from `riwayah === 'hafs' ? 'warsh' : …`:
   * QUL publishes fonts for five non-Hafs riwayat and each is one dataset
   * away (`docs/design/riwayat-plan.md` §5), so this cycles through
   * whatever the build actually carries. With two it is a toggle; with
   * four it is still correct.
   */
  // What this device can draw, which changes when a muṣḥaf is added in
  // Manage downloads. Without the subscription the toggle would stay
  // hidden until the screen happened to re-render for some other reason.
  useRiwayahAvailability();
  const riwayah = resolveRiwayah(quran.prefs.riwayah);

  // Shared with Settings → Qur'an, which can switch muṣḥaf too — the
  // one-time reflow notice belongs to the ACT, not to this screen.
  const switchRiwayah = useSwitchRiwayah();

  const [isFullscreen, setIsFullscreen] = useState(false);
  /**
   * Stable. This one function reaches every mushaf page — a tap anywhere on
   * the page toggles fullscreen — so when it was an inline arrow it changed
   * identity on every render of this screen, and with it the callback each
   * page hands to each of its fifteen lines. That is what defeated the memo
   * the whole way down: a page laid itself out again for a screen re-render
   * that had nothing to do with it.
   */
  const toggleFullscreen = useCallback(() => setIsFullscreen(f => !f), []);

  /**
   * Back leaves fullscreen, and only then leaves the reader.
   *
   * Out of fullscreen this answers false and the press falls through to
   * the ordinary one-level-at-a-time rule, so back out of the reader is
   * unchanged. Reported as #43: the chrome is gone, a tap on a word opens
   * an ayah rather than bringing it back, and an edge-swipe on a phone
   * with gesture navigation leaves the app rather than the mode.
   */
  usePublishBackAnswer(
    onBackAnswer,
    useCallback(() => {
      if (!isFullscreen) return false;
      setIsFullscreen(false);
      return true;
    }, [isFullscreen]),
  );

  /**
   * Header title for mushaf mode — the surah the visible PAGE starts with,
   * which drifts away from the route's surah as the reader is paged.
   *
   * Held as state (rather than the reader calling `navigation.setOptions`
   * directly) so this screen stays the single writer of the title. With
   * two writers the header effect below — which re-runs on fullscreen
   * toggles, palette and night-mode changes — kept clobbering the reader's
   * value with the route's static `surah.romanized`.
   */
  /**
   * The page on screen, reported by the reader as it turns — the nav
   * header draws the khatmah's done-mark beside the surah name and has
   * no other way to know which page that name belongs to.
   */
  const [markPage, setMarkPage] = useState(initialPage ?? 1);
  const handleReaderPageChange = useCallback((page: number) => {
    setMarkPage(page);
  }, []);
  const pageProgress = usePageProgress(markPage, riwayah);
  const [readerTitle, setReaderTitle] = useState<string | null>(null);
  const handleReaderTitleChange = useCallback((title: string) => {
    setReaderTitle(title);
  }, []);

  /**
   * THE CHIPS GO DEAD AFTER THE WINDOW IS RESIZED.
   *
   * Audio, Tafsir and the riwayah chip live in the NATIVE navigation bar:
   * `headerRight` is a React tree that react-native-screens hosts inside a
   * UIKit bar subview, and RN lays that tree out against the width the
   * subview had when it was last rendered. Nothing in this effect's inputs
   * changes when a Mac window is dragged wider — not the title, not the
   * tone, not the riwayah — so the header was never re-rendered, and the
   * chips kept the frames they were given at the old width while UIKit
   * moved the bar to the new one. They still DRAW in the right place; the
   * views that answer a click are somewhere else. The same goes for the
   * round trip through fullscreen, where the bar is torn down and rebuilt
   * while the reader's own React tree does not change at all.
   *
   * So the window's size is an input to the header, and the chips are
   * keyed on it: a changed key rebuilds the subview rather than diffing
   * into the stale one. Settled, not live — a drag is a hundred widths and
   * only the last one is worth a rebuild.
   */
  const win = useWindowDimensions();
  const headerW = useSettledMeasure(Math.round(win.width));
  const headerH = useSettledMeasure(Math.round(win.height));
  // A different surah means the reader's page title no longer applies.
  useEffect(() => {
    setReaderTitle(null);
  }, [surahNumber]);

  useEffect(() => {
    if (!surah) return;
    /**
     * Screen container inset (v2.8.2). The navigator pads every screen's
     * content by the bottom safe area in the THEME background colour
     * (RootNavigator `contentStyle`). Under the mushaf, whose page is white
     * (or near-black at night), that pad reads as a strip of app background
     * along the screen edge where the page should reach it. The reader
     * paints its own page colour edge to edge and applies the safe-area
     * insets — cutout included — itself, so here it just gets the window.
     */
    // Before the stored blob is read, the tone is its default of paper, so
    // this would paint the screen pure white and then flip to black a
    // moment later when the real preference arrives. Hold the app's own
    // background until we actually know — it is the colour already on
    // screen, so waiting shows as nothing at all, where guessing shows as a
    // full-window white flash on a large Mac Catalyst window.
    const dark = toneIsDark(tone);
    const contentStyle = {
      backgroundColor: !quranHydrated ? palette.bg : TONE_PAGE_BG[tone],
    };
    /**
     * Header colours follow the PAGE, not the app theme.
     *
     * On iOS the header is transparent and blurred over whatever is beneath
     * it, and its title is painted in the theme's text colour. Mushaf night
     * mode is independent of the app theme, so a light theme reading a night
     * page put near-black title text over a near-black page — there, but only
     * if you already knew where to look. The mirror case (dark theme, light
     * page) is the same mistake the other way round.
     */
    /**
     * …and on Android too (redesign plan §4, "the immersive reader"). The
     * Android header is opaque in the app's background colour, so a night
     * page under a light theme ran under a white bar with a black title —
     * the seam the fullscreen mode exists to remove, but out of fullscreen.
     * The bar is now painted in the page colour and its title and buttons
     * in the page's ink, on both platforms: the reader is the page, edge to
     * edge, and the app's own chrome waits behind the back button.
     */
    const ink = dark ? '#f2f2f2' : '#1a1a1a';
    /**
     * THE TITLE IS CENTRED OVER THE PAGE, NOT OVER THE WINDOW (v2.24.1).
     *
     * The navigation bar spans the whole window and centres its title in
     * itself. On a Mac (or a wide iPad) the index sidebar takes the
     * leading ~SIDEBAR_WIDTH of the row beneath it, so the reader's own
     * centre is half a sidebar further along — and "• An-Nisaa" sat
     * visibly left of the page it names. Shift it by exactly that half,
     * and only while the sidebar is actually up: same predicate as the
     * reader, so the two can never disagree (`sidebarShown` — which a
     * phone answers no to at any width, since the phone reader has no
     * index; a phone in landscape is wide enough to fit one and used to
     * get the shift for a sidebar that was not there).
     *
     * A transform rather than a padding: the title is a centred subview
     * UIKit positions, and padding inside it moves the text within a box
     * that stays where it was. Transforms are not mirrored by the tree's
     * `direction: 'rtl'`, so the sign is chosen here — in Arabic the
     * sidebar is on the trailing edge and the page centre moves left.
     */
    const sidebarUp = sidebarShown(headerW);
    const isRtl = isRtlLanguage(i18n.language);
    const titleShift = sidebarUp ? (isRtl ? -1 : 1) * (SIDEBAR_WIDTH / 2) : 0;
    const headerTitleRow = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: desktopSize(6),
      ...(titleShift !== 0 ? { transform: [{ translateX: titleShift }] } : null),
    };
    /**
     * THE BAR IS THE PAGE'S COLOUR ON A MAC — PAINTED, NOT CONFIGURED.
     *
     * `headerBlurEffect` is an iOS API and Catalyst is iOS by
     * `Platform.OS`, so the Mac took the blur branch and drew the bar as a
     * system material: a strip a shade lighter than the paper under it,
     * with a hard edge across the top of the page. A desktop window has
     * nothing to blur either — the content does not scroll under the bar
     * the way a phone's does.
     *
     * `headerStyle.backgroundColor` does NOT fix it. The root navigator
     * sets `headerTransparent` on iOS so the reader can reach the top of
     * the window, and a translucent Catalyst bar ignores the colour: a
     * build with the bar set to FLAT RED and `headerBlurEffect: 'none'`
     * came out exactly as before, pixel for pixel. A `headerBackground`
     * view does paint — the same experiment in green filled the strip
     * edge to edge — so the colour is painted here rather than asked for.
     *
     * Two regions, because the bar spans the whole window and the window
     * is not one surface: the muṣḥaf's index sits under the leading
     * ~SIDEBAR_WIDTH of it. The transparent bar showed the sidebar
     * through there, and it should keep looking that way; only the part
     * over the page becomes the page. `left`/`right` rather than
     * `start`/`end` because this is the physical side the sidebar is on,
     * chosen by the layout direction (see the title shift above).
     */
    const barChrome = isMacCatalyst
      ? {
          headerStyle: { backgroundColor: 'transparent' },
          headerBackground: () => (
            <View style={{ flex: 1, backgroundColor: TONE_PAGE_BG[tone] }}>
              {sidebarUp ? (
                <View
                  style={[
                    {
                      position: 'absolute' as const,
                      top: 0,
                      bottom: 0,
                      width: SIDEBAR_WIDTH,
                      backgroundColor: palette.bg,
                    },
                    isRtl ? { right: 0 } : { left: 0 },
                  ]}
                />
              ) : null}
            </View>
          ),
        }
      : isIOS
        ? { headerBlurEffect: (dark ? 'dark' : 'light') as 'dark' | 'light' }
        : { headerStyle: { backgroundColor: TONE_PAGE_BG[tone] } };
    const pageChrome = quranHydrated
      ? {
            ...barChrome,
            headerTintColor: ink,
            headerTitleStyle: {
              color: ink,
              writingDirection: isArabic ? 'rtl' : 'ltr',
              // writingDirection is a valid TextStyle prop, but react-navigation
              // types the title style as a narrower Pick<> that omits it.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            headerLargeTitleStyle: {
              color: ink,
              writingDirection: isArabic ? 'rtl' : 'ltr',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }
        : null;
    /**
     * MAC: THE PAGE SWIPE AND THE BACK SWIPE ARE THE SAME GESTURE.
     *
     * Turning a page with a two-finger trackpad swipe closed the muṣḥaf
     * instead. UIKit routes that swipe to the navigation controller's
     * interactive pop, and the pop gets it first — so the reader never saw
     * the scroll it was asked to page on, and the screen went back to the
     * surah list mid-āyah.
     *
     * A touch device tells the two apart by where the finger starts: the
     * pop is an EDGE pan, and a swipe that begins in the middle of the page
     * is unambiguously a page turn. A trackpad has no edges to start from,
     * so the same gesture has to mean one thing, and inside a reader it
     * means the page.
     *
     * Only in the muṣḥaf, and only on the Mac. The tafsir reader scrolls
     * vertically and has no page swipe to lose, and on iPad the edge pan
     * is still an edge pan. Going back on the Mac keeps the header's back
     * button, ⌘[, and the surah sidebar.
     */
    /**
     * MAC: THE PAGE SWIPE AND THE BACK SWIPE ARE THE SAME GESTURE.
     *
     * Turning a page with a two-finger trackpad swipe closed the muṣḥaf
     * instead. UIKit routes that swipe to the navigation controller's
     * interactive pop, and the pop gets it first — so the reader never saw
     * the scroll it was asked to page on, and the screen went back to the
     * surah list mid-āyah.
     *
     * A touch device tells the two apart by where the finger starts: the
     * pop is an EDGE pan, and a swipe that begins in the middle of the page
     * is unambiguously a page turn. A trackpad has no edges to start from,
     * so the same gesture has to mean one thing, and inside a reader it
     * means the page.
     *
     * Only here, and only on the Mac. The translation reader scrolls
     * vertically and has no page swipe to lose, and on iPad the edge pan
     * is still an edge pan. Going back on the Mac keeps the header's back
     * button, ⌘[, and the surah sidebar.
     */
    const gestureEnabled = !isMacCatalyst;

    if (isFullscreen) {
      navigation.setOptions({
        headerShown: false,
        gestureEnabled,
        // 'default', not 'all'. react-native-screens maps 'all' to Android's
        // SCREEN_ORIENTATION_FULL_SENSOR, which includes UPSIDE-DOWN
        // portrait — and the pager renders nothing at 180° (verified on the
        // emulator: header intact, not a single list cell laid out, and it
        // does not recover on rotating back). 'default' leaves the activity
        // UNSPECIFIED, so the platform's own policy applies: landscape yes,
        // upside-down no. On iOS 'default' means the Info.plist list, which
        // is portrait + both landscapes on iPhone.
        orientation: 'default',
        contentStyle,
      });
      return;
    }
    navigation.setOptions({
      headerShown: true,
      gestureEnabled,
      // The mushaf rotates with the device whether or not the chrome is
      // hidden — the phone reader has a landscape layout of its own (a 1.6×
      // reading zoom in a scrolling column), and having to enter fullscreen
      // first to use it was not something anyone would guess. Everything
      // else in the app stays portrait.
      orientation: 'default',
      contentStyle,
      ...(pageChrome ?? {}),
      // The reader's page-derived surah wins once it has reported one.
      // Either way the NAME follows the app language — an Arabic UI over a
      // page of Arabic script should not be titled "Al-Fatihah".
      title: readerTitle || surahName(surah),
      /**
       * A PULSING DOT BESIDE THE NAME, in the colour of whichever trail
       * is keeping this reading (issue #54) — a following bookmark, the
       * khatmah, or the reading marker.
       *
       * `headerTitle` rather than `title` alone, because a dot is not a
       * string. It takes the ink and the writing direction the header was
       * already giving the title, so the text is the same text arriving
       * by a different prop. Every open reader now has an owner and so a
       * dot; `headerTitle` still falls back to the platform's own title
       * when there is no session at all, which is what a screenshot or a
       * cold start sees before the effect has run.
       */
      ...(sessionColor || pageProgress
        ? {
            headerTitle: () => (
              <View style={headerTitleRow}>
                {sessionColor ? <SessionDot color={sessionColor} size={8} /> : null}
                {pageProgress ? (
                  <PageProgressMark
                    state={pageProgress}
                    page={markPage}
                    riwayah={riwayah}
                    size={9}
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{
                    color: ink,
                    fontSize: TYPE.headline.fontSize,
                    fontWeight: '600',
                    writingDirection: isArabic ? 'rtl' : 'ltr',
                  }}>
                  {readerTitle || surahName(surah)}
                </Text>
              </View>
            ),
          }
        : {}),
      /**
       * THE RIWAYAH SITS BY THE BACK ARROW.
       *
       * The right side had grown to four controls — audio, the
       * translation switch, the riwayah and fullscreen — and the left
       * held only the arrow. The riwayah (which muṣḥaf this is) moved
       * across; audio stays with the view controls.
       *
       * `headerLeft` takes the system back control's slot rather than
       * sharing it, so the arrow is drawn here too (`TabBackButton`, the
       * app's own, as the translation reader does) — and only when there
       * is somewhere to go back to, as the system's would be. The swipe
       * and the hardware back do not go through it.
       */
      headerLeft: () => (
        <View
          // Keyed on the settled window size — see the note by `headerW`.
          key={`left-${headerW}x${headerH}`}
          style={[
            headerSide.row,
            navigation.canGoBack() ? null : headerSide.padStart,
          ]}>
          {navigation.canGoBack() ? (
            <TabBackButton
              onPress={() => navigation.goBack()}
              inNativeHeader
              color={ink}
            />
          ) : null}
          {riwayahChoiceExists() ? (
            // Only here, because the translation reader draws its Arabic
            // from the ayah database, which is Hafs. A control that
            // appeared to change the script there would be lying.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.riwayahPickerOpen', {
                defaultValue: 'Reading tradition: {{name}}. Tap to change.',
                name: t(riwayahById(riwayah).nameKey, riwayahById(riwayah).arabic),
              })}
              onPress={() => setRiwayahPickerVisible(true)}
              hitSlop={10}
              style={{ paddingHorizontal: SPACING.xs }}>
              {/* The muṣḥaf you are IN, with the caret that says there
                  are others — see `RiwayahPicker` for why this stopped
                  naming the next one instead. */}
              <Text
                style={{
                  ...arabicTextStyle('body'),
                  color: ink,
                  fontSize: desktopSize(17),
                  fontWeight: '700',
                }}>
                {`${riwayahById(riwayah).arabic} ▾`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ),
      headerRight: () => (
        // Wider gaps on the Mac: these are pointer targets on a desktop,
        // not thumb targets on a tablet, and Catalyst has already scaled
        // the whole row down (responsive/desktop.ts).
        <View
          // Keyed on the settled window size — see the note by `headerW`.
          key={`chips-${headerW}x${headerH}`}
          style={{
            flexDirection: 'row',
            gap: desktopSize(14),
            alignItems: 'center',
          }}>
          {onToggleMode ? (
            // Only when the verse-by-verse reader is switched on in
            // Settings → Quran. A header control for a reader that is not
            // there would be a button that does nothing, and the muṣḥaf
            // header has room for exactly the controls the page needs.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'quran.switchToTranslation',
                'Switch to translation view',
              )}
              onPress={onToggleMode}
              hitSlop={10}
              style={{ paddingHorizontal: SPACING.xs }}>
              <TranslationIcon color={ink} size={desktopSize(22)} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.playbackSettings', 'Recitation')}
            // Unified sheet (v2.7.28): open the ayah panel scrolled to the
            // recitation controls — everything lives in one place.
            onPress={() => setAudioSheetSignal(s => s + 1)}
            hitSlop={10}
            style={{ paddingHorizontal: SPACING.xs }}>
            {/* The mark alone (redesign plan §4); the word lives on in the
                accessibility label. Painted in the page's ink, like the
                title, so a night page does not put the app's dark green on
                near-black. */}
            <TilawahIcon color={ink} size={desktopSize(22)} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.enterFullscreen', 'Enter fullscreen')}
            onPress={() => setIsFullscreen(true)}
            hitSlop={10}
            style={{ paddingHorizontal: SPACING.xs }}>
            <Text
              style={{
                color: ink,
                fontSize: desktopSize(18),
                fontWeight: '700',
              }}>
              ⛶
            </Text>
          </Pressable>
        </View>
      ),
    });
  }, [
    navigation,
    surah,
    isArabic,
    // Not `isArabic`: the title shift asks which way the LAYOUT runs, and
    // Urdu is an RTL language this app ships in.
    i18n.language,
    isFullscreen,
    readerTitle,
    pageProgress,
    markPage,
    // The dot appears and goes with the session, so the header has to be
    // re-issued when it changes — otherwise a bookmark switched to
    // following mid-reading would not show until the next resize.
    sessionColor,
    palette.bg,
    tone,
    quranHydrated,
    riwayah,
    switchRiwayah,
    t,
    onToggleMode,
    // The window's size, so a resize re-issues the header rather than
    // leaving UIKit holding a subview RN laid out for a different width.
    headerW,
    headerH,
  ]);

  useEffect(() => {
    return () => {
      navigation.setOptions({ headerShown: true, orientation: 'portrait' });
    };
  }, [navigation]);

  /** One picker, mounted by whichever branch is on screen. */
  const riwayahSheet = (
    <RiwayahPicker
      visible={riwayahPickerVisible}
      current={riwayah}
      onClose={() => setRiwayahPickerVisible(false)}
      onPick={id => {
        setRiwayahPickerVisible(false);
        if (id !== riwayah) switchRiwayah(id);
      }}
      onManage={() => {
        setRiwayahPickerVisible(false);
        navigation.navigate('QuranDownloads');
      }}
    />
  );

  return (
    // A fragment, not the reader alone: the picker is opened from the
    // header, so it has to be mounted beside the reader that header
    // belongs to. Returning the reader by itself once left the control
    // live and the sheet unmounted — the tap set the flag, nothing
    // appeared, and the picker turned up later when a switch to
    // translation view mounted it with the flag already true.
    <>
      <MushafReader
        surahNumber={surahNumber}
        initialPage={initialPage}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        audioSheetSignal={audioSheetSignal}
        onTitleChange={handleReaderTitleChange}
        onPageChange={handleReaderPageChange}
      />
      {riwayahSheet}
    </>
  );
}

const headerSide = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: desktopSize(10) },
  padStart: { paddingStart: SPACING.sm },
});
