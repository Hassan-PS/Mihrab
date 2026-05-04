// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useCallback } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  clampOffset,
  MAX_OFFSET_MAGNITUDE,
  type PrayerOffsetMinutes,
} from '../../settings/prayerOffsets';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { modalStyles } from './modalStyles';

/**
 * Per-prayer offsets modal — task #22.
 *
 * Lets the user adjust each daily prayer by ±N minutes (clamped to
 * MAX_OFFSET_MAGNITUDE = 30 by `prayerOffsets.ts`). The control is a
 * stepper to keep accessibility predictable on every locale (no slider
 * RTL gotchas, no hidden gestures).
 *
 * The data layer (`applyOffsets`) is already consumed by the prayer-times
 * fetch pipeline before caching/widget push, so picking values here
 * translates directly into the table on Home and the alarms scheduled
 * by `syncPrayerNotifications`.
 */
const PRAYERS: ReadonlyArray<keyof PrayerOffsetMinutes> = [
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
];

type Props = {
  visible: boolean;
  current: PrayerOffsetMinutes;
  palette: AppPalette;
  onChange: (next: PrayerOffsetMinutes) => void;
  onClose: () => void;
};

export const PrayerOffsetsModal = memo(function PrayerOffsetsModal({
  visible,
  current,
  palette,
  onChange,
  onClose,
}: Props) {
  const { t } = useTranslation();

  const setOffset = useCallback(
    (key: keyof PrayerOffsetMinutes, delta: number) => {
      const prev = current[key] ?? 0;
      const next = clampOffset(prev + delta);
      const merged: PrayerOffsetMinutes = { ...current };
      if (next === 0) delete merged[key];
      else merged[key] = next;
      onChange(merged);
    },
    [current, onChange],
  );

  const reset = useCallback(() => {
    onChange({});
  }, [onChange]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.prayerOffsetsTitle')}
          </Text>
          <ScrollView contentContainerStyle={styles.list}>
            <Text
              style={[
                styles.help,
                { color: palette.muted, paddingHorizontal: 16 },
              ]}>
              {t('settings.prayerOffsetsHelp', {
                max: MAX_OFFSET_MAGNITUDE,
              })}
            </Text>
            {PRAYERS.map(prayer => {
              const value = current[prayer] ?? 0;
              return (
                <View key={prayer} style={styles.row}>
                  <Text style={[styles.label, { color: palette.text }]}>
                    {t(`prayer.${prayer}`)}
                  </Text>
                  <View style={styles.stepper}>
                    <StepperButton
                      label="-"
                      a11y={t('settings.prayerOffsetsDecrease', {
                        prayer: t(`prayer.${prayer}`),
                      })}
                      onPress={() => setOffset(prayer, -1)}
                      palette={palette}
                      disabled={value <= -MAX_OFFSET_MAGNITUDE}
                    />
                    <Text
                      style={[
                        styles.value,
                        tabularNumeralStyle,
                        { color: palette.accent },
                      ]}
                      maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                      {value > 0 ? `+${value}` : value}
                    </Text>
                    <StepperButton
                      label="+"
                      a11y={t('settings.prayerOffsetsIncrease', {
                        prayer: t(`prayer.${prayer}`),
                      })}
                      onPress={() => setOffset(prayer, 1)}
                      palette={palette}
                      disabled={value >= MAX_OFFSET_MAGNITUDE}
                    />
                  </View>
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.prayerOffsetsReset')}
              onPress={reset}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.reset,
                pressed && { opacity: 0.6 }, hovered && { opacity: 0.92 },
              ]}>
              <Text style={[styles.resetLabel, { color: palette.danger }]}>
                {t('settings.prayerOffsetsReset')}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

function StepperButton({
  label,
  a11y,
  onPress,
  palette,
  disabled,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  palette: AppPalette;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.stepBtn,
        {
          backgroundColor: palette.accentBg,
          borderColor: palette.border,
        },
        pressed && { opacity: 0.7 }, hovered && { opacity: 0.92 },
        disabled && { opacity: 0.35 },
      ]}>
      <Text style={[styles.stepBtnLabel, { color: palette.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: SPACING.xl },
  help: { ...typeStyle('footnote'), marginBottom: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  label: { ...typeStyle('headline') },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  stepBtn: {
    width: 36,           // 36pt circular tap target
    height: 36,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnLabel: {
    ...typeStyle('title3'),
    fontWeight: '700',
  },
  value: {
    ...typeStyle('headline'),
    minWidth: 44,
    textAlign: 'center',
  },
  reset: {
    paddingVertical: SPACING.md + 2, // tokens-ok-line: 14px tap baseline
    alignItems: 'center',
  },
  resetLabel: { ...typeStyle('callout'), fontWeight: '600' },
});
