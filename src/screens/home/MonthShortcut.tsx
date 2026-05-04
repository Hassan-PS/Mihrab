import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarIcon } from '../../components/HeaderToolbarIcons';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { HOME_CARD_RADIUS } from './tokens';

/** Pressable shortcut card linking to the month view. */
type MonthShortcutProps = {
  onPress: () => void;
};

function MonthShortcutImpl({ onPress }: MonthShortcutProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.monthTimesLink')}
      accessibilityHint={t('a11y.openMonth')}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.shortcut,
        {
          backgroundColor: palette.card,
          borderRadius: HOME_CARD_RADIUS,
          ...cardEdgeStyle(palette),
        },
        pressed && { opacity: 0.75 }, hovered && { opacity: 0.92 },
      ]}>
      <CalendarIcon color={palette.accent} size={20} />
      <Text style={[styles.label, { color: palette.accent }]}>
        {t('home.monthTimesLink')}
      </Text>
    </Pressable>
  );
}

export const MonthShortcut = memo(MonthShortcutImpl);

const styles = StyleSheet.create({
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  label: { fontSize: 16, fontWeight: '600' },
});
