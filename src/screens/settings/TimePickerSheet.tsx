/**
 * "At what time?" — an hour stepper and four quarter-hour chips.
 *
 * Deliberately not the platform date picker: every reminder here is a
 * wall-clock time of day with no date, and both platforms' pickers put a
 * date wheel beside it that has no answer. The stepper wraps at midnight
 * and the time above it is read by the app's own clock formatter, so
 * "9:00 PM" says which half of the day the wrapping 0–23 hour landed in.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useClockFormatter } from '../../hooks/useClockFormatter';

export function TimePickerSheet({
  visible,
  hour,
  minute,
  onChangeHour,
  onChangeMinute,
  onClose,
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onChangeHour: (h: number) => void;
  onChangeMinute: (m: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();
  const label = clock(
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
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
        <Text style={[styles.title, { color: palette.text }]}>
          {t('settings.ayahOfDayTime', 'Notification time')}
        </Text>
        <View style={styles.hourRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.hourDown', 'Hour −')}
            hitSlop={8}
            onPress={() => onChangeHour((hour + 23) % 24)}
            style={[styles.stepBtn, { borderColor: palette.border }]}>
            <Text style={[styles.stepGlyph, { color: palette.accentSolid }]}>
              −
            </Text>
          </Pressable>
          <Text style={[styles.timeValue, { color: palette.text }]}>
            {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.hourUp', 'Hour +')}
            hitSlop={8}
            onPress={() => onChangeHour((hour + 1) % 24)}
            style={[styles.stepBtn, { borderColor: palette.border }]}>
            <Text style={[styles.stepGlyph, { color: palette.accentSolid }]}>
              +
            </Text>
          </Pressable>
        </View>
        <View style={styles.minuteRow}>
          {[0, 15, 30, 45].map(m => {
            const selected = minute === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onChangeMinute(m)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected
                      ? palette.accentBg
                      : 'transparent',
                    borderColor: selected ? palette.accentSolid : palette.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipLabel,
                    { color: selected ? palette.accentSolid : palette.muted },
                  ]}>
                  :{String(m).padStart(2, '0')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.done', 'Done')}
          onPress={onClose}
          style={[styles.doneBtn, { backgroundColor: palette.accentSolid }]}>
          <Text style={styles.doneLabel}>{t('common.done', 'Done')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 20, fontWeight: '700' },
  timeValue: {
    fontSize: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 110,
    textAlign: 'center',
  },
  minuteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipLabel: { fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
  doneBtn: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneLabel: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
