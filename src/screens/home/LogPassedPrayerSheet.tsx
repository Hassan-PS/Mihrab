/**
 * "Its time has passed — how was it prayed?"
 *
 * The question the check on Today asks once a prayer's window has closed
 * (see quickLog.ts). WHICH answers it offers is the moment's to decide,
 * not this file's — issue #40: inside a Mālikī second window there are
 * two, the first time or after it, because the prayer can still be
 * prayed in its own time; once the window has gone entirely there are
 * four, the Log's own set, missed among them. The caller passes the set
 * and the sheet asks the question that fits it. Drawn as the reset
 * picker is: a titled card on the overlay, one row per answer, cancel at
 * the foot.
 */
import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import type { PassedPrayerAnswer } from '../../journal/quickLog';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

type Props = {
  /**
   * The prayer's name in the app language, the day's label, and what may
   * be answered — `answers` comes from `passedPrayerAnswers`, so the
   * sheet never offers a status the clock has already ruled out.
   */
  question: {
    prayer: string;
    day: string;
    answers: readonly PassedPrayerAnswer[];
    /** True while the second window is still open: fewer answers, and its own question. */
    secondOpen: boolean;
  } | null;
  onAnswer: (status: PassedPrayerAnswer) => void;
  onCancel: () => void;
};

function LogPassedPrayerSheetImpl({ question, onAnswer, onCancel }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  return (
    <Modal
      visible={question != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}>
      {/* `accessible={false}` on both, as on every sheet in the app: a
          Pressable with children swallows them on iOS, and VoiceOver
          would read the whole card as one label. */}
      <Pressable
        accessible={false}
        style={[styles.scrim, { backgroundColor: palette.overlay }]}
        onPress={onCancel}>
        <Pressable
          accessible={false}
          style={[styles.sheet, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}
          onPress={() => {}}>
          <Text style={[styles.title, { color: palette.text }]}>
            {t('journal.passedTitle', {
              defaultValue: 'Log {{prayer}} · {{day}}',
              prayer: question?.prayer ?? '',
              day: question?.day ?? '',
            })}
          </Text>
          <Text style={[styles.message, { color: palette.muted }]}>
            {question?.secondOpen
              ? t('journal.passedFirstBody', {
                  defaultValue:
                    'Its first time has passed and the second is open. Was it prayed in the first time, or after it?',
                })
              : t('journal.passedBody', {
                  defaultValue: 'Its time has passed. How was it prayed?',
                })}
          </Text>
          {(question?.answers ?? []).map(status => (
            <Pressable
              key={status}
              accessibilityRole="button"
              accessibilityLabel={t(`journal.status.${status}`)}
              onPress={() => onAnswer(status)}
              style={({ pressed }) => [
                styles.row,
                { borderColor: palette.border ?? palette.muted },
                pressed && { backgroundColor: palette.controlBg },
              ]}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                {t(`journal.status.${status}`)}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={onCancel}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.cancelLabel, { color: palette.muted }]}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const LogPassedPrayerSheet = memo(LogPassedPrayerSheetImpl);

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxl },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: { fontSize: TYPE.title3.fontSize, fontWeight: '700', marginBottom: SPACING.sm },
  message: { fontSize: TYPE.callout.fontSize, lineHeight: 21, marginBottom: SPACING.lg },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  rowLabel: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  cancel: { alignSelf: 'flex-end', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  cancelLabel: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
});
