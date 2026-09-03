/**
 * Ayah action sheet — QR-8/9/12, unified in v2.7.28.
 *
 * Bottom sheet shown on long-pressing an ayah (mushaf page or
 * translation card). ONE panel for everything about the ayah:
 *
 *   • translation peek + real tafsir (on-demand, cached offline),
 *   • bookmark (five colors), star, khatmah "I am here" pin,
 *   • play from here / repeat / share (text or image card),
 *   • the full recitation controls (reciter, download, speed,
 *     memorization, range player) — the header "Recitation" button
 *     opens this same sheet scrolled straight to this section.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { arabicTextStyle } from '../../theme/typography';
import { findSurah, loadSurah } from '../quran';
import { getAyahTranslation } from '../translations';
import { useActiveEdition } from '../useActiveEdition';
import {
  activeKhatmah,
  addBookmark,
  clearKhatmahPosition,
  findBookmark,
  isStarred,
  removeBookmark,
  setKhatmahPosition,
  toggleStar,
  useQuranState,
  setQuranPrefs,
  BOOKMARK_COLORS,
  KHATMAH_COLOR,
  type BookmarkColor,
} from '../quranState';
import {
  loadTafsir,
  resolveTafsirEdition,
  TAFSIR_EDITIONS,
} from '../tafsir';
import { playFromAyah, playRange } from '../audio/playback';
import { RecitationControls } from '../audio/RecitationControls';
import { ShareAyahModal } from './ShareAyahModal';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { RowAction, SectionHead } from '../../components/controls';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { MODAL_ORIENTATIONS } from '../../components/modalOrientations';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The sheet's own padding, before the safe-area insets are added to it. */
const SHEET_H_PADDING = 18;
const SHEET_BOTTOM_PADDING = 26;

/** Clamp heights, and the text lengths past which a toggle is worth showing. */
const TRANSLATION_CLAMP_LINES = 5;
const TAFSIR_CLAMP_LINES = 8;
const LONG_TRANSLATION = 260;
const LONG_TAFSIR = 420;

type Props = {
  visible: boolean;
  onClose: () => void;
  surah: number;
  ayah: number;
  page: number;
  /** Open pre-scrolled to the recitation section (header button). */
  scrollToAudio?: boolean;
};

export function AyahActionSheet({
  visible,
  onClose,
  surah,
  ayah,
  page,
  scrollToAudio,
}: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  // The larger of the two, on both — see the sheet's note.
  const sideInset = Math.max(insets.left, insets.right);
  const { settings } = usePrayerSettings();
  const edition = useActiveEdition();
  const state = useQuranState();
  const [arabic, setArabic] = useState<string>('');
  const [shareCardVisible, setShareCardVisible] = useState(false);

  // ── Tafsir (v2.7.28; persisted v2.8) ────────────────────────────────
  // The chosen edition is derived from the persisted quran pref so it sticks
  // across sheet reopens and stays in sync with the Settings selector — it
  // used to live in ephemeral component state, which reverted to the default
  // on every remount.
  // ALL shipped tafsir editions (v2.7.40) — matches the companion-text
  // selector so a pick made anywhere is offered everywhere.
  const tafsirEditions = TAFSIR_EDITIONS;
  const [tafsirOpen, setTafsirOpen] = useState(false);
  const tafsirEdition = resolveTafsirEdition(
    state.prefs.tafsirEditionId,
    settings.language,
  );
  const setTafsirEdition = (ed: { id: string }) =>
    setQuranPrefs({ tafsirEditionId: ed.id });
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  /**
   * "Show more" state for the two long-form texts in the sheet (v2.8.4).
   *
   * A tafsir entry runs to several hundred words. Rendered whole it pushed
   * the recitation controls — reciter, speed, the range player — off the
   * bottom of the sheet, so the panel read as a tafsir reader with the audio
   * section buried. Both texts are clamped to a few lines with an expand
   * toggle, and BOTH toggles reset on every open: an expansion is a decision
   * about the ayah in front of you, not a mode to be inherited by the next
   * one.
   */
  const [tafsirExpanded, setTafsirExpanded] = useState(false);
  const [translationExpanded, setTranslationExpanded] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const audioSectionY = useRef(0);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setArabic('');
    // When the app-wide companion mode is tafsir (v2.7.40), the section the
    // user chose opens pre-expanded — the sheet leads with their preference.
    setTafsirOpen(state.prefs.companionMode === 'tafsir');
    setTafsirText(null);
    setTafsirExpanded(false);
    setTranslationExpanded(false);
    void loadSurah(surah).then(loaded => {
      if (cancelled || !loaded) return;
      setArabic(loaded.arabic[ayah - 1] ?? '');
    });
    return () => {
      cancelled = true;
    };
    // state.prefs.companionMode intentionally read once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, surah, ayah]);

  // The share card is a <Modal> NESTED inside this sheet's <Modal>. If the
  // sheet is hidden (or torn down) while the card is still flagged visible,
  // the inner modal window is orphaned above the app and eats every touch —
  // the same failure the reader's dismiss guard exists to prevent. Latch it
  // off as soon as the sheet stops being shown.
  useEffect(() => {
    if (!visible) setShareCardVisible(false);
  }, [visible]);

  // Scroll to the recitation section when opened from the header button.
  useEffect(() => {
    if (!visible || !scrollToAudio) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: audioSectionY.current, animated: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [visible, scrollToAudio]);

  useEffect(() => {
    if (!visible || !tafsirOpen) return;
    let cancelled = false;
    setTafsirLoading(true);
    setTafsirText(null);
    setTafsirExpanded(false);
    void loadTafsir(tafsirEdition.id, surah, ayah).then(text => {
      if (cancelled) return;
      setTafsirLoading(false);
      setTafsirText(text);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, tafsirOpen, tafsirEdition.id, surah, ayah]);

  const meta = findSurah(surah);
  const translation = getAyahTranslation(edition, surah, ayah);
  const starred = isStarred(state, surah, ayah);
  const bookmark = findBookmark(state, surah, ayah);
  const plan = activeKhatmah(state);
  const isKhatmahHere =
    plan?.position?.surah === surah && plan?.position?.ayah === ayah;
  const reference = `${meta?.romanized ?? ''} ${surah}:${ayah}`;

  /**
   * Share is ONE action with two formats, not two actions.
   *
   * "Share" and "Share as image" sat as equal siblings, so a row of four
   * read as four choices when it was really three plus a format. The
   * format question is asked only once the user has said they want to
   * share — on iOS through the system action sheet, on Android through
   * the same two-button alert pattern the app already uses.
   */
  const share = () => {
    const asText = t('quran.shareAsText', 'Share the text');
    const asImage = t('quran.shareAsImage', 'Share as image');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [asText, asImage, t('common.cancel', 'Cancel')],
          cancelButtonIndex: 2,
        },
        index => {
          if (index === 0) void shareText();
          if (index === 1) setShareCardVisible(true);
        },
      );
      return;
    }
    Alert.alert(t('common.share', 'Share'), undefined, [
      { text: asText, onPress: () => void shareText() },
      { text: asImage, onPress: () => setShareCardVisible(true) },
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
    ]);
  };

  const shareText = async () => {
    const body = `${arabic}\n\n${translation}\n\n— ${reference}`;
    try {
      await Share.share({ message: body });
    } catch {
      /* user cancelled */
    }
  };

  /** "Show more / Show less" link under a clamped block. */
  const moreToggle = (expanded: boolean, onToggle: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={6}
      onPress={onToggle}>
      <Text style={[styles.moreLink, { color: palette.accentSolid }]}>
        {expanded
          ? t('quran.showLess', 'Show less')
          : t('quran.showMore', 'Show more')}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      // Landscape too, or the muṣḥaf on its side cannot open this
      // at all — see MODAL_ORIENTATIONS.
      supportedOrientations={MODAL_ORIENTATIONS}
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        accessibilityLabel={t('common.close', 'Close')}
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: palette.card,
            /**
             * THE ISLAND IS ON THE SIDE IN LANDSCAPE, and it is over this
             * sheet, not beside it.
             *
             * The muṣḥaf is the one screen that turns, and turned on its
             * side an iPhone puts the cutout at one end of the LONG edge —
             * directly on top of the āyah, its translation, and whichever
             * control happened to be under it. The sheet is edge to edge
             * by design, so it takes the insets on itself.
             *
             * Symmetrically, on the larger of the two: the sheet is a
             * centred column of text, and shifting it off centre to dodge
             * a cutout on one side looks like a mistake rather than a
             * clearance.
             */
            paddingStart: SHEET_H_PADDING + sideInset,
            paddingEnd: SHEET_H_PADDING + sideInset,
            paddingBottom: SHEET_BOTTOM_PADDING + insets.bottom,
          },
        ]}>
        <View style={styles.headerRow}>
          <Text style={[styles.reference, { color: palette.muted }]}>
            {reference}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              starred
                ? t('quran.unstar', 'Remove star')
                : t('quran.star', 'Star this ayah')
            }
            hitSlop={10}
            onPress={() => toggleStar(surah, ayah)}>
            <Text
              style={{
                fontSize: 22,
                color: starred ? '#e0a52e' : palette.muted,
              }}>
              {starred ? '★' : '☆'}
            </Text>
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} style={styles.body} bounces={false}>
          {arabic ? (
            <Text style={[styles.arabic, { color: palette.text }]}>
              {arabic}
            </Text>
          ) : null}
          {translation ? (
            <>
              <Text
                numberOfLines={
                  translationExpanded ? undefined : TRANSLATION_CLAMP_LINES
                }
                style={[styles.translation, { color: palette.muted }]}>
                {translation}
              </Text>
              {translation.length > LONG_TRANSLATION
                ? moreToggle(translationExpanded, () =>
                    setTranslationExpanded(v => !v),
                  )
                : null}
            </>
          ) : null}

          {/* Tafsir (v2.7.28) */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: tafsirOpen }}
            accessibilityLabel={t('quran.tafsir', 'Tafsir')}
            onPress={() => setTafsirOpen(o => !o)}
            style={[styles.tafsirToggle, { borderColor: palette.border }]}>
            <Text style={[styles.tafsirToggleLabel, { color: palette.accentSolid }]}>
              {tafsirOpen
                ? `▾ ${t('quran.tafsir', 'Tafsir')}`
                : `▸ ${t('quran.showTafsir', 'Show tafsir')}`}
            </Text>
          </Pressable>
          {tafsirOpen ? (
            <View style={styles.tafsirBlock}>
              {tafsirEditions.length > 1 ? (
                <View style={styles.tafsirChips}>
                  {tafsirEditions.map(ed => {
                    const sel = ed.id === tafsirEdition.id;
                    return (
                      <Pressable
                        key={ed.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: sel }}
                        onPress={() => setTafsirEdition(ed)}
                        style={[
                          styles.tafsirChip,
                          {
                            backgroundColor: sel
                              ? palette.accentBg
                              : 'transparent',
                            borderColor: sel
                              ? palette.accentSolid
                              : palette.border,
                          },
                        ]}>
                        <Text
                          style={{
                            color: sel ? palette.accentSolid : palette.muted,
                            fontSize: 12,
                            fontWeight: '600',
                          }}>
                          {ed.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {tafsirLoading ? (
                <Text style={[styles.tafsirMeta, { color: palette.muted }]}>
                  {t('quran.loading', 'Loading…')}
                </Text>
              ) : tafsirText ? (
                <>
                  <Text
                    numberOfLines={
                      tafsirExpanded ? undefined : TAFSIR_CLAMP_LINES
                    }
                    style={[
                      styles.tafsirText,
                      { color: palette.text },
                      tafsirEdition.rtl && styles.tafsirRtl,
                    ]}>
                    {tafsirText}
                  </Text>
                  {tafsirText.length > LONG_TAFSIR
                    ? moreToggle(tafsirExpanded, () =>
                        setTafsirExpanded(v => !v),
                      )
                    : null}
                </>
              ) : (
                <Text style={[styles.tafsirMeta, { color: palette.muted }]}>
                  {t(
                    'quran.tafsirUnavailable',
                    'Tafsir unavailable — connect to the internet once to download it.',
                  )}
                </Text>
              )}
            </View>
          ) : null}

          {/* Bookmark colors — one bookmark per ayah, tap active color to remove. */}
          <View style={styles.bookmarkRow}>
            <Text style={[styles.bookmarkLabel, { color: palette.muted }]}>
              {t('quran.bookmark', 'Bookmark')}
            </Text>
            {(Object.keys(BOOKMARK_COLORS) as BookmarkColor[]).map(color => {
              const selected = bookmark?.color === color;
              return (
                <Pressable
                  key={color}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t('quran.bookmarkColor', {
                    defaultValue: 'Bookmark color {{color}}',
                    color,
                  })}
                  hitSlop={6}
                  onPress={() => {
                    if (selected && bookmark) removeBookmark(bookmark.id);
                    else addBookmark(surah, ayah, page, color);
                  }}
                  style={[
                    styles.colorDot,
                    { backgroundColor: BOOKMARK_COLORS[color] },
                    selected && styles.colorDotSelected,
                  ]}
                />
              );
            })}
          </View>

          {/* Khatmah pin (v2.7.28) — only while a plan is active. */}
          {plan ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isKhatmahHere }}
              accessibilityLabel={
                isKhatmahHere
                  ? t('quran.khatmahUnpin', 'Remove khatmah position')
                  : t('quran.khatmahPin', 'Set as my khatmah position')
              }
              onPress={() => {
                if (isKhatmahHere) clearKhatmahPosition();
                else setKhatmahPosition(surah, ayah, page);
              }}
              style={[
                styles.khatmahPin,
                {
                  borderColor: KHATMAH_COLOR,
                  backgroundColor: isKhatmahHere
                    ? `${KHATMAH_COLOR}26`
                    : 'transparent',
                },
              ]}>
              <View
                style={[styles.khatmahDot, { backgroundColor: KHATMAH_COLOR }]}
              />
              <Text style={[styles.khatmahPinLabel, { color: palette.text }]}>
                {isKhatmahHere
                  ? t('quran.khatmahPinned', 'Khatmah position — tap to remove')
                  : t('quran.khatmahPin', 'Set as my khatmah position')}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.actionsRow}>
            {/* Read → act → organise → tune. Play is the single emerald
                button; repeat sits beside it; share is one action that
                asks for a format afterwards. */}
            <View style={styles.actionsPrimary}>
              <RowAction
                label={t('quran.playFromHere', 'Play from here')}
                glyph="▶"
                emphasized
                onPress={() => {
                  onClose();
                  void playFromAyah(surah, ayah);
                }}
              />
            </View>
            <RowAction
              label={t('quran.repeatAyah', 'Repeat this ayah')}
              glyph="↻"
              onPress={() => {
                onClose();
                void playRange({ surah, ayah }, { surah, ayah });
              }}
            />
            <RowAction
              label={t('common.share', 'Share')}
              glyph="⇪"
              accessibilityLabel={t(
                'quran.shareChoiceA11y',
                'Share — opens a choice of text or image card',
              )}
              onPress={share}
            />
          </View>

          {/* Recitation is a different job from marking an ayah, so it
              gets its own rule and heading (2f). */}
          <SectionHead label={t('quran.recitation', 'Recitation')} />
          {/* Recitation controls — the header button lands here. */}
          <View
            onLayout={e => {
              audioSectionY.current = e.nativeEvent.layout.y;
            }}>
            <RecitationControls
              surahNumber={surah}
              onStartPlayback={onClose}
            />
          </View>
        </ScrollView>
      </View>
      <ShareAyahModal
        visible={shareCardVisible}
        onClose={() => setShareCardVisible(false)}
        surah={surah}
        ayah={ayah}
        arabic={arabic}
        translation={translation}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '82%',
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    // The horizontal and bottom padding are applied inline — they carry the
    // safe-area insets with them. See the sheet's own note.
    paddingTop: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reference: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  body: { flexGrow: 0 },
  arabic: {
    fontSize: 24,
    lineHeight: 54,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  translation: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  tafsirToggle: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  tafsirToggleLabel: { fontSize: 13, fontWeight: '700' },
  tafsirBlock: { marginTop: 10, gap: 8 },
  tafsirChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tafsirChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  tafsirMeta: { fontSize: 13, fontStyle: 'italic' },
  tafsirText: { fontSize: 14, lineHeight: 22 },
  tafsirRtl: { textAlign: 'right', writingDirection: 'rtl' },
  moreLink: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  bookmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  bookmarkLabel: { fontSize: 13, marginEnd: 4 },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    transform: [{ scale: 1.15 }],
  },
  khatmahPin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  khatmahDot: { width: 12, height: 12, borderRadius: 6 },
  khatmahPinLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  // The emerald button takes the row's full width; repeat and share share
  // the line below it, so the ranking is visible before it is read.
  actionsPrimary: { width: '100%' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
});
