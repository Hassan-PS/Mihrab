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

  const shareText = async () => {
    const body = `${arabic}\n\n${translation}\n\n— ${reference}`;
    try {
      await Share.share({ message: body });
    } catch {
      /* user cancelled */
    }
  };

  const actionBtn = (
    label: string,
    onPress: () => void,
    emphasized = false,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.action,
        {
          backgroundColor: emphasized ? palette.accentBg : 'transparent',
          borderColor: palette.border,
        },
      ]}>
      <Text
        style={[
          styles.actionLabel,
          { color: emphasized ? palette.accentSolid : palette.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        accessibilityLabel={t('common.close', 'Close')}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: palette.card }]}>
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
            <Text style={[styles.translation, { color: palette.muted }]}>
              {translation}
            </Text>
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
                <Text
                  style={[
                    styles.tafsirText,
                    { color: palette.text },
                    tafsirEdition.rtl && styles.tafsirRtl,
                  ]}>
                  {tafsirText}
                </Text>
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
            {actionBtn(
              t('quran.playFromHere', 'Play from here'),
              () => {
                onClose();
                void playFromAyah(surah, ayah);
              },
              true,
            )}
            {actionBtn(t('quran.repeatAyah', 'Repeat this ayah'), () => {
              onClose();
              void playRange({ surah, ayah }, { surah, ayah });
            })}
            {actionBtn(t('common.share', 'Share'), () => {
              void shareText();
            })}
            {actionBtn(t('quran.shareAsImage', 'Share as image'), () => {
              setShareCardVisible(true);
            })}
          </View>

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
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 26,
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
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: { fontSize: 14, fontWeight: '600' },
});
