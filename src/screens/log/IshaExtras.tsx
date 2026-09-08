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
 *
 * DIMMED UNTIL ISHA HAS COME IN, like every other control in the row above.
 * Both of these are night prayers; offering them at noon invites a claim that
 * cannot have been true. It stays a dimmed panel rather than disappearing —
 * a section that comes and goes with the clock reads as a bug, and anything
 * already logged has to remain reachable to be undone.
 */
// tokens-ok: the witr mark on dark is ink on the accent
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import { tabularNumeralStyle } from '../../theme/textScale';
import { sunnahMark } from '../../practice/sunnahTheme';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

type Props = {
  witr: boolean;
  qiyam: number;
  palette: AppPalette;
  /** Isha has not come in. Dimmed and inert, like the chips above. */
  notYet?: boolean;
  onToggleWitr: () => void;
  onAddQiyam: () => void;
  onResetQiyam: () => void;
};

function IshaExtrasImpl({
  witr,
  qiyam,
  palette,
  notYet,
  onToggleWitr,
  onAddQiyam,
  onResetQiyam,
}: Props) {
  const { t } = useTranslation();
  const gold = sunnahMark(palette);
  const dead = notYet === true;

  return (
    <View style={[styles.wrap, dead && styles.wrapNotYet]}>
      <Text style={[styles.head, { color: palette.muted }]} numberOfLines={1}>
        {t('sunnah.afterIsha', 'After Isha')}
      </Text>

      <View
        style={[
          styles.row,
          { borderTopColor: palette.border ?? palette.muted },
        ]}
      >
        <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
          {t('sunnah.witr', 'Witr')}
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: witr, disabled: dead }}
          accessibilityLabel={t('sunnah.witr', 'Witr')}
          disabled={dead}
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

      <View
        style={[
          styles.row,
          { borderTopColor: palette.border ?? palette.muted },
        ]}
      >
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
              accessibilityState={{ disabled: dead }}
              disabled={dead}
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
            accessibilityState={{ disabled: dead }}
            disabled={dead}
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
  /**
   * A flat continuation of the prayer list, not a panel inside a row.
   *
   * It was a tinted block nested inside Isha's row — a third level of
   * containment on a screen that already goes card → row, and the only
   * background colour in the list. Witr and Qiyam are two more things you
   * log, on the same rhythm as everything above them, so they get the same
   * hairline rule and the same left edge instead of a box of their own.
   */
  wrap: {
    marginTop: SPACING.sm,
    gap: 2,
  },
  // The same 0.4 the status chips and the sunnah tile use, so the whole Isha
  // row dims as one piece rather than three shades of grey.
  wrapNotYet: { opacity: 0.4 },
  head: {
    marginTop: SPACING.xs,
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nameCol: { flex: 1 },
  name: { flex: 1, fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  sub: { fontSize: TYPE.caption.fontSize, marginTop: 1 },
  toggle: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  toggleLabel: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  step: { width: 28, height: 28, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: TYPE.body.fontSize, fontWeight: '700', lineHeight: 19 },
  count: { minWidth: 20, textAlign: 'center', fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  reset: { fontSize: TYPE.caption.fontSize, fontWeight: '600', textDecorationLine: 'underline' },
});
