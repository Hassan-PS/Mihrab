import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { QuranBookIcon } from '../../theme/icons';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import { HOME_CARD_RADIUS } from './tokens';

/**
 * Wide pressable shortcut into the Quran (v2.7.30). Took over the slot
 * the month-view shortcut occupied — the Quran is one of the app's main
 * thoughts and deserves the hero shortcut; the month view now lives as
 * the calendar chip on the Today card + a tile in the quick-actions grid.
 */
type QuranShortcutProps = {
  onPress: () => void;
};

function QuranShortcutImpl({ onPress }: QuranShortcutProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.quranShortcut', 'Open the Quran')}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.shortcut,
        styles.clip,
        {
          borderRadius: HOME_CARD_RADIUS,
          ...cardEdgeStyle(palette),
        },
        pressed && { opacity: 0.75 }, hovered && { opacity: 0.92 },
      ]}>
      <GlassSurface style={StyleSheet.absoluteFill} bordered={false} />
      {/* accentSolid is the resolved hex string (SVG needs a string;
          Material You's `accent` can be an opaque ColorValue). */}
      <QuranBookIcon color={palette.accentSolid} size={22} />
      <Text style={[styles.label, { color: palette.accent }]}>
        {t('home.quranShortcut', 'Open the Quran')}
      </Text>
    </Pressable>
  );
}

export const QuranShortcut = memo(QuranShortcutImpl);

const styles = StyleSheet.create({
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  clip: { overflow: 'hidden' },
  label: { fontSize: 16, fontWeight: '600' },
});
