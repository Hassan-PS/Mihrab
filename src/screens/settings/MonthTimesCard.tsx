/**
 * Month times, from Settings (design review 2e).
 *
 * The month view lost its tile when the tool grid went and its tab when
 * "More" went. It is reference material — a table you consult, not a daily
 * action — so it lives with the other things you set up once and come back
 * to occasionally. The Today card's own "Prayer times for the whole month"
 * row still reaches it in one tap from where the times are.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { CalendarIcon } from '../../components/HeaderToolbarIcons';

function MonthTimesCardImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.month')}
        accessibilityHint={t('a11y.openMonth')}
        onPress={() => navigation.navigate('MonthTimes' as never)}
        style={styles.row}>
        <CalendarIcon color={palette.accentSolid} size={20} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>
            {t('nav.month')}
          </Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            {t('home.monthTimesLink')}
          </Text>
        </View>
        <Text style={{ color: palette.accent, fontSize: 15 }}>›</Text>
      </Pressable>
    </View>
  );
}

export const MonthTimesCard = memo(MonthTimesCardImpl);

const styles = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 12.5, marginTop: 2 },
});
