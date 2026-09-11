/**
 * "Its time has passed — how was it prayed?"
 *
 * The question the check on Today asks once a prayer's window has closed
 * (see quickLog.ts). WHICH answers it offers is the moment's to decide,
 * not this file's — issue #40: inside a Mālikī second window there are
 * two, the first time or after it, because the prayer can still be
 * prayed in its own time; once the window has gone entirely there are
 * four, the Log's own set, missed among them. The caller passes the set
 * and the sheet asks the question that fits it.
 *
 * ── ONE CARD, ONE LEVEL DEEP ──────────────────────────────────────────
 *
 * Drawn the way every group in the app is drawn since the redesign: the
 * card holds rows, the rows are divided by an inset hairline, and nothing
 * on it is a box inside a box. The first draft gave each answer a bordered
 * button of its own, which was four outlines stacked on a card that
 * already had one. The day sits above the prayer's name as a label; the
 * question is the one line of prose; the answers are rows; cancel is the
 * quiet last row rather than a button floating at the corner.
 */
import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RowDivider } from '../../components/ui/Group';
import { cardEdgeStyle } from '../../theme/chrome';
import type { PassedPrayerAnswer } from '../../journal/quickLog';
import { LAYOUT, RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, typeStyle } from '../../theme/typography';

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
          accessibilityLabel={t('journal.passedTitle', {
            defaultValue: 'Log {{prayer}} · {{day}}',
            prayer: question?.prayer ?? '',
            day: question?.day ?? '',
          })}
          style={[styles.sheet, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}
          onPress={() => {}}>
          <View style={styles.head}>
            <Text style={[typeStyle('label'), { color: palette.muted }]} numberOfLines={1}>
              {question?.day ?? ''}
            </Text>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {question?.prayer ?? ''}
            </Text>
            <Text style={[typeStyle('footnote'), styles.message, { color: palette.muted }]}>
              {question?.secondOpen
                ? t('journal.passedFirstBody', {
                    defaultValue:
                      'Its first time has passed and the second is open. Was it prayed in the first time, or after it?',
                  })
                : t('journal.passedBody', {
                    defaultValue: 'Its time has passed. How was it prayed?',
                  })}
            </Text>
          </View>
          {(question?.answers ?? []).map(status => (
            <View key={status}>
              <RowDivider inset={LAYOUT.gutter} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(`journal.status.${status}`)}
                onPress={() => onAnswer(status)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: palette.controlBg },
                ]}>
                <Text style={[typeStyle('headline'), { color: palette.text }]}>
                  {t(`journal.status.${status}`)}
                </Text>
              </Pressable>
            </View>
          ))}
          <RowDivider inset={0} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={onCancel}
            style={({ pressed }) => [
              styles.row,
              styles.cancel,
              pressed && { backgroundColor: palette.controlBg },
            ]}>
            <Text style={[typeStyle('headline'), { color: palette.muted }]}>
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
    maxWidth: 360,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  head: {
    paddingHorizontal: LAYOUT.gutter,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: 2,
  },
  title: { fontSize: TYPE.title3.fontSize, fontWeight: '700' },
  message: { marginTop: SPACING.xs },
  row: {
    paddingHorizontal: LAYOUT.gutter,
    minHeight: SPACING.xxxl,
    justifyContent: 'center',
  },
  cancel: { alignItems: 'center' },
});
