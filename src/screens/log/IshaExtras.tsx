/**
 * Witr and Qiyam al-Layl, under Isha because that is when they are prayed.
 *
 * They are NOT two more pips on the Isha tile, because they are not two more
 * of the same thing. Witr is its own prayer with its own name and it either
 * happened or it did not — a toggle, not a counter. Qiyam has no fixed number
 * at all: someone may pray two rak'ah or twenty, and a control that stops at
 * two would be telling them they had finished when they had not.
 *
 * The Qiyam line says out loud that it is not counted toward the streak. An
 * uncounted number sitting beside a counted one will otherwise be assumed to
 * count, and the first time the streak fails to move the app looks broken
 * rather than deliberate.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import { tabularNumeralStyle } from '../../theme/textScale';
import { sunnahGold } from '../../practice/sunnahTheme';

type Props = {
  witr: boolean;
  qiyam: number;
  palette: AppPalette;
  onToggleWitr: () => void;
  onAddQiyam: () => void;
  onResetQiyam: () => void;
};

function IshaExtrasImpl({
  witr,
  qiyam,
  palette,
  onToggleWitr,
  onAddQiyam,
  onResetQiyam,
}: Props) {
  const { t } = useTranslation();
  const gold = sunnahGold(palette.isDark);

  return (
    <View style={[styles.wrap, { backgroundColor: palette.accentBg }]}>
      <Text style={[styles.head, { color: palette.muted }]} numberOfLines={1}>
        {t('sunnah.afterIsha', 'After Isha')}
      </Text>

      <View style={styles.row}>
        <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
          {t('sunnah.witr', 'Witr')}
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: witr }}
          accessibilityLabel={t('sunnah.witr', 'Witr')}
          onPress={onToggleWitr}
          hitSlop={6}
          style={[
            styles.toggle,
            { backgroundColor: witr ? gold : palette.card },
          ]}
        >
          <Text
            style={[
              styles.toggleLabel,
              { color: witr ? (palette.isDark ? '#211A06' : '#FFFFFF') : palette.muted },
            ]}
            numberOfLines={1}
          >
            {witr ? t('sunnah.prayed', 'Prayed') : t('sunnah.logIt', 'Log')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <View style={styles.nameCol}>
          <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
            {t('sunnah.qiyam', 'Qiyam al-Layl')}
          </Text>
          {/* Numberless on purpose: a sentence carrying {{count}} triggers
              i18next pluralisation, and Arabic needs six forms for it. The
              number lives in the figure beside it instead. */}
          <Text style={[styles.sub, { color: palette.muted }]} numberOfLines={1}>
            {t('sunnah.qiyamNote', 'Not counted toward the streak')}
          </Text>
        </View>
        <View style={styles.stepper}>
          {qiyam > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sunnah.resetQiyam', 'Reset Qiyam al-Layl')}
              onPress={onResetQiyam}
              hitSlop={6}
            >
              <Text style={[styles.reset, { color: palette.muted }]}>
                {t('sunnah.reset', 'Reset')}
              </Text>
            </Pressable>
          ) : null}
          <Text
            style={[styles.count, tabularNumeralStyle, { color: palette.text }]}
            accessibilityLabel={t('sunnah.qiyamCountA11y', 'Qiyam al-Layl logged')}
          >
            {qiyam}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sunnah.addQiyam', 'Log one Qiyam al-Layl')}
            onPress={onAddQiyam}
            hitSlop={6}
            style={[styles.step, { backgroundColor: palette.card }]}
          >
            <Text style={[styles.stepLabel, { color: palette.text }]}>+</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const IshaExtras = memo(IshaExtrasImpl);

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    // On the container so the two rows are separated as well as the heading;
    // a marginBottom on the heading alone left Witr and Qiyam touching.
    gap: 8,
  },
  head: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameCol: { flex: 1 },
  name: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  sub: { fontSize: 11, marginTop: 1 },
  toggle: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 11 },
  toggleLabel: { fontSize: 12, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 16, fontWeight: '700', lineHeight: 19 },
  count: { minWidth: 20, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  reset: { fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
});
