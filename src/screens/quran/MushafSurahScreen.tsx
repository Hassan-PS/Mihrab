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
import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { desktopSize } from '../../responsive/desktop';
import { useAppPalette } from '../../hooks/useAppPalette';
import { isMacCatalyst } from '../../responsive/breakpoints';
import type { SurahIndex } from '../../quran/quran';
import { MushafReader } from '../../quran/MushafReader';
import {
  resolveRiwayah,
  riwayahById,
  type RiwayahId,
  riwayahChoiceExists,
} from '../../quran/riwayat';
import { useRiwayahAvailability } from '../../quran/riwayahData';
import { surahName } from '../../quran/surahName';
import {
  setQuranPrefs,
  useQuranState,
  useQuranHydrated,
} from '../../quran/quranState';
import type { RootStackParamList } from '../../navigation/types';
import { arabicTextStyle } from '../../theme/typography';
import { RiwayahPicker } from '../../quran/RiwayahPicker';

const isIOS = Platform.OS === 'ios';

type Props = {
  surah: SurahIndex;
  surahNumber: number;
  /** Open at an explicit page (deep links from Juz/Page/Bookmark nav). */
  initialPage?: number;
  /** Switch to the translation reader. */
  onToggleMode: () => void;
};

export function MushafSurahScreen({
  surah,
  surahNumber,
  initialPage,
  onToggleMode,
}: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const quran = useQuranState();
  const quranHydrated = useQuranHydrated();

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

  const switchRiwayah = useCallback(
    (id: RiwayahId) => {
    const target = riwayahById(id);
    setQuranPrefs({ riwayah: target.id });
    // Said ONCE, on the first switch to a muṣḥaf that reflows — see
    // `riwayahNoticeSeen`. The reader keeps their place either way; what
    // they need to know is that the lines will not fall where their
    // printed copy puts them.
    if (
      riwayahById(target.id).render === 'unicode' &&
      !quran.prefs.riwayahNoticeSeen
    ) {
      setQuranPrefs({ riwayahNoticeSeen: true });
      Alert.alert(
        t('quran.riwayahReflowTitle', 'Pages match, lines may not'),
        t(
          'quran.riwayahReflowBody',
          'This muṣḥaf starts and ends every page exactly where the printed one does, but its lines are laid out by your device rather than taken from the print, so they will not always break in the same places.',
        ),
      );
    }
    },
    [quran.prefs.riwayahNoticeSeen, t],
  );

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
   * Header title for mushaf mode — the surah the visible PAGE starts with,
   * which drifts away from the route's surah as the reader is paged.
   *
   * Held as state (rather than the reader calling `navigation.setOptions`
   * directly) so this screen stays the single writer of the title. With
   * two writers the header effect below — which re-runs on fullscreen
   * toggles, palette and night-mode changes — kept clobbering the reader's
   * value with the route's static `surah.romanized`.
   */
  const [readerTitle, setReaderTitle] = useState<string | null>(null);
  const handleReaderTitleChange = useCallback((title: string) => {
    setReaderTitle(title);
  }, []);
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
    // Before the stored blob is read, `mushafNightMode` is its default of
    // false, so this would paint the screen pure white and then flip to
    // #101010 a moment later when the real preference arrives. Hold the app's
    // own background until we actually know — it is the colour already on
    // screen, so waiting shows as nothing at all, where guessing shows as a
    // full-window white flash on a large Mac Catalyst window.
    const contentStyle = {
      backgroundColor: !quranHydrated
        ? palette.bg
        : quran.prefs.mushafNightMode
          ? '#101010'
          : '#ffffff',
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
    const pageChrome =
      isIOS && quranHydrated
        ? {
            headerBlurEffect: (quran.prefs.mushafNightMode
              ? 'dark'
              : 'light') as 'dark' | 'light',
            headerTintColor: quran.prefs.mushafNightMode ? '#f2f2f2' : '#1a1a1a',
            headerTitleStyle: {
              color: quran.prefs.mushafNightMode ? '#f2f2f2' : '#1a1a1a',
              writingDirection: isArabic ? 'rtl' : 'ltr',
              // writingDirection is a valid TextStyle prop, but react-navigation
              // types the title style as a narrower Pick<> that omits it.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            headerLargeTitleStyle: {
              color: quran.prefs.mushafNightMode ? '#f2f2f2' : '#1a1a1a',
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
      headerRight: () => (
        // Wider gaps on the Mac: these are pointer targets on a desktop,
        // not thumb targets on a tablet, and Catalyst has already scaled
        // the whole row down (responsive/desktop.ts).
        <View
          style={{
            flexDirection: 'row',
            gap: desktopSize(14),
            alignItems: 'center',
          }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.playbackSettings', 'Recitation')}
            // Unified sheet (v2.7.28): open the ayah panel scrolled to the
            // recitation controls — everything lives in one place.
            onPress={() => setAudioSheetSignal(s => s + 1)}
            hitSlop={10}
            style={{ paddingHorizontal: 4 }}>
            <Text
              style={{
                color: palette.accentSolid,
                fontSize: desktopSize(15),
                fontWeight: '700',
              }}>
              {`♪ ${t('quran.audioButton', 'Audio')}`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'quran.switchToTranslation',
              'Switch to translation view',
            )}
            onPress={onToggleMode}
            hitSlop={10}
            style={{ paddingHorizontal: 4 }}>
            <Text
              style={{
                color: palette.accentSolid,
                fontSize: desktopSize(15),
                fontWeight: '700',
              }}>
              {t('quran.viewToggleTranslation', 'Tafsir')}
            </Text>
          </Pressable>
          {riwayahChoiceExists() ? (
            // The riwayah lives with the view controls, as asked — and only
            // here, because the translation reader draws its Arabic from
            // the ayah database, which is Hafs. A control that appeared to
            // change the script there would be lying.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.riwayahPickerOpen', {
                defaultValue: 'Reading tradition: {{name}}. Tap to change.',
                name: t(riwayahById(riwayah).nameKey, riwayahById(riwayah).arabic),
              })}
              onPress={() => setRiwayahPickerVisible(true)}
              hitSlop={10}
              style={{ paddingHorizontal: 4 }}>
              {/* The muṣḥaf you are IN, with the caret that says there
                  are others — see `RiwayahPicker` for why this stopped
                  naming the next one instead. */}
              <Text
                style={{
                  ...arabicTextStyle('body'),
                  color: palette.accentSolid,
                  fontSize: desktopSize(17),
                  fontWeight: '700',
                }}>
                {`${riwayahById(riwayah).arabic} ▾`}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.enterFullscreen', 'Enter fullscreen')}
            onPress={() => setIsFullscreen(true)}
            hitSlop={10}
            style={{ paddingHorizontal: 4 }}>
            <Text
              style={{
                color: palette.accentSolid,
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
    isFullscreen,
    readerTitle,
    palette.accentSolid,
    palette.bg,
    quran.prefs.mushafNightMode,
    quranHydrated,
    riwayah,
    switchRiwayah,
    t,
    onToggleMode,
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
      />
      {riwayahSheet}
    </>
  );
}
