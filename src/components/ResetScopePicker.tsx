/**
 * How much of the prayer log to undo — issue #13.
 *
 * ── WHY A PICKER AND NOT FOUR BUTTONS ─────────────────────────────────
 *
 * The request was "either one prayer at a time, or the whole day / month /
 * year, or the whole log", which is four scopes plus the per-prayer tap the
 * Log already has. A stock `Alert` takes three buttons before Android
 * starts stacking them illegibly, and four destructive rows on the Log
 * screen itself would put "clear everything" one mis-tap from a record
 * nobody can rebuild.
 *
 * So one quiet row opens this, and this shows the four with THEIR COUNTS
 * ALREADY ON THEM. That is the whole point of the screen: the person who
 * needs it is the person who just discovered they wrote three months of
 * prayers they did not pray, and what they need before choosing is to see
 * that "this month" is 140 and "everything" is 412. A scope with nothing in
 * it is shown, greyed, rather than hidden — an option that vanishes leaves
 * you wondering whether you misremembered it.
 *
 * Choosing here does not clear anything. It hands the plan back for a
 * second, figures-first confirmation (`FillSummary` in `ConfirmModal`),
 * because this is the one action in the app that removes what someone
 * recorded about their own worship.
 */
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { cardEdgeStyle } from '../theme/chrome';
import { tabularNumeralStyle } from '../theme/textScale';
import type { ResetPlan, ResetScope } from '../journal/resetLog';

const SCOPE_LABEL: Record<ResetScope, { key: string; fallback: string }> = {
  day: { key: 'log.resetScopeDay', fallback: 'This day' },
  month: { key: 'log.resetScopeMonth', fallback: 'This month' },
  year: { key: 'log.resetScopeYear', fallback: 'This year' },
  all: { key: 'log.resetScopeAll', fallback: 'Everything' },
};

export function ResetScopePicker({
  visible,
  plans,
  dayLabel,
  onPick,
  onCancel,
}: {
  visible: boolean;
  /** Every scope, with what it would clear. Widening order. */
  plans: ResetPlan[];
  /** The day the "this day / month / year" scopes are relative to. */
  dayLabel: string;
  onPick: (plan: ResetPlan) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: palette.overlay }]}
        onPress={onCancel}
      >
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: palette.text }]}>
            {t('log.resetTitle', 'Reset the prayer log')}
          </Text>
          <Text style={[styles.message, { color: palette.muted }]}>
            {t('log.resetBody', {
              defaultValue:
                'Choose how much to clear, relative to {{day}}. Fasts, sunnah prayers and dhikr are separate records and are not touched.',
              day: dayLabel,
            })}
          </Text>

          <ScrollView style={styles.list} bounces={false}>
            {plans.map(plan => {
              const empty = plan.prayers === 0;
              const label = SCOPE_LABEL[plan.scope];
              return (
                <Pressable
                  key={plan.scope}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: empty }}
                  accessibilityLabel={`${t(label.key, label.fallback)} — ${t(
                    'log.resetCount',
                    {
                      defaultValue: '{{prayers}} prayers on {{days}} days',
                      prayers: plan.prayers,
                      days: plan.days,
                    },
                  )}`}
                  disabled={empty}
                  onPress={() => onPick(plan)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: palette.border ?? palette.muted },
                    empty && styles.rowEmpty,
                    pressed && !empty && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: empty ? palette.muted : palette.text },
                    ]}
                  >
                    {t(label.key, label.fallback)}
                  </Text>
                  <Text
                    style={[
                      styles.rowCount,
                      tabularNumeralStyle,
                      { color: palette.muted },
                    ]}
                  >
                    {empty
                      ? t('log.resetNothing', 'nothing')
                      : t('log.resetCount', {
                          defaultValue: '{{prayers}} prayers on {{days}} days',
                          prayers: plan.prayers,
                          days: plan.days,
                        })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={onCancel}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.cancelLabel, { color: palette.muted }]}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  message: { fontSize: 15, lineHeight: 21 },
  list: { marginTop: 14, maxHeight: 320 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  rowEmpty: { opacity: 0.55 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowCount: { fontSize: 12.5, marginTop: 3 },
  cancel: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 12 },
  cancelLabel: { fontSize: 15, fontWeight: '600' },
});
