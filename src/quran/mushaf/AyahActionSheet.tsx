/**
 * Ayah action sheet — QR-8/9/12 (docs/quran-reader-plan.md).
 *
 * Bottom sheet shown when the user taps an ayah (mushaf page or
 * translation card). Combines the "translation peek" (read the meaning
 * without leaving the mushaf — Ayah's signature flow) with the action
 * row: play from here, repeat this ayah, bookmark (five colors), star,
 * copy, share.
 */
import { useEffect, useState } from 'react';
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
  addBookmark,
  BOOKMARK_COLORS,
  findBookmark,
  isStarred,
  removeBookmark,
  toggleStar,
  useQuranState,
  type BookmarkColor,
} from '../quranState';
import { playFromAyah, playRange } from '../audio/playback';
import { ShareAyahModal } from './ShareAyahModal';

type Props = {
  visible: boolean;
  onClose: () => void;
  surah: number;
  ayah: number;
  page: number;
};

export function AyahActionSheet({ visible, onClose, surah, ayah, page }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const edition = useActiveEdition();
  const state = useQuranState();
  const [arabic, setArabic] = useState<string>('');
  const [shareCardVisible, setShareCardVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setArabic('');
    void loadSurah(surah).then(loaded => {
      if (cancelled || !loaded) return;
      setArabic(loaded.arabic[ayah - 1] ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [visible, surah, ayah]);

  const meta = findSurah(surah);
  const translation = getAyahTranslation(edition, surah, ayah);
  const starred = isStarred(state, surah, ayah);
  const bookmark = findBookmark(state, surah, ayah);
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

        <ScrollView style={styles.peek} bounces={false}>
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
        </ScrollView>

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
    maxHeight: '70%',
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
  peek: { maxHeight: 240 },
  arabic: {
    fontSize: 24,
    lineHeight: 54,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  translation: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  bookmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bookmarkLabel: { fontSize: 13, marginEnd: 4 },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    transform: [{ scale: 1.15 }],
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: { fontSize: 14, fontWeight: '600' },
});
