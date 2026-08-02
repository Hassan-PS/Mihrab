/**
 * Four control primitives, replacing eight shapes (design review 2f).
 *
 * The ayah sheet had outlined chips at 12pt radius, outlined chips at 16pt,
 * hairline action pills at 12pt, a tinted reciter row at 10pt, a hairline
 * download row at 10pt, circular stepper buttons at 16pt, an outlined tafsir
 * toggle at 10pt and bare colour dots. Every one a different object, and
 * twenty of them presented as equals.
 *
 * Two rules run through all four:
 *
 *   FILLED, NOT OUTLINED. A selected chip used to carry a tinted background
 *   AND a coloured border AND coloured text — three signals for one bit.
 *   Worse, `StyleSheet.hairlineWidth` borders round to zero on some Android
 *   densities and vanish outright; a fill never does. One filled surface
 *   says "selected" once.
 *
 *   ONE RADIUS FAMILY. 12–14pt everywhere, so a chip, a button and a
 *   stepper read as three sizes of the same object rather than three
 *   objects.
 *
 * `palette.controlBg` / `palette.onAccent` carry the light/dark pair, so
 * none of this gets re-derived per control.
 */
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../hooks/useAppPalette';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import { desktopSize } from '../responsive/desktop';

// ── Chip ──────────────────────────────────────────────────────────────

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** 'radio' inside a single-choice group (speed, pause factor). */
  role?: 'radio' | 'button';
};

export const Chip = memo(function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  role = 'radio',
}: ChipProps) {
  const { palette } = useAppPalette();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? palette.accentSolid : palette.controlBg,
        },
      ]}>
      <Text
        style={[
          styles.chipLabel,
          { color: selected ? palette.onAccent : palette.text },
        ]}
        numberOfLines={1}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {label}
      </Text>
    </Pressable>
  );
});

// ── Row action ────────────────────────────────────────────────────────

export type RowActionProps = {
  label: string;
  onPress: () => void;
  /** The one emerald button in a group. Everything else is warm grey. */
  emphasized?: boolean;
  /** Optional leading glyph, e.g. ▶ or ↻. */
  glyph?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
};

export const RowAction = memo(function RowAction({
  label,
  onPress,
  emphasized = false,
  glyph,
  accessibilityLabel,
  disabled = false,
}: RowActionProps) {
  const { palette } = useAppPalette();
  const fg = emphasized ? palette.onAccent : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.action,
        {
          backgroundColor: emphasized ? palette.accentSolid : palette.controlBg,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}>
      {glyph ? (
        <Text style={[styles.actionGlyph, { color: fg }]}>{glyph}</Text>
      ) : null}
      <Text
        style={[styles.actionLabel, { color: fg }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {label}
      </Text>
    </Pressable>
  );
});

// ── Stepper ───────────────────────────────────────────────────────────

export type StepperProps = {
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  atMin?: boolean;
  atMax?: boolean;
};

/**
 * One grouped control, not two floating circles: the ± and the value read
 * as a single object and share the chip's radius family.
 */
export const Stepper = memo(function Stepper({
  value,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  atMin = false,
  atMax = false,
}: StepperProps) {
  const { palette } = useAppPalette();
  return (
    <View style={[styles.stepper, { backgroundColor: palette.controlBg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decrementLabel}
        accessibilityState={{ disabled: atMin }}
        disabled={atMin}
        onPress={onDecrement}
        hitSlop={6}
        style={styles.stepperBtn}>
        <Text
          style={[
            styles.stepperGlyph,
            { color: atMin ? palette.muted : palette.accent },
          ]}>
          −
        </Text>
      </Pressable>
      <Text
        style={[styles.stepperValue, { color: palette.text }]}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={incrementLabel}
        accessibilityState={{ disabled: atMax }}
        disabled={atMax}
        onPress={onIncrement}
        hitSlop={6}
        style={styles.stepperBtn}>
        <Text
          style={[
            styles.stepperGlyph,
            { color: atMax ? palette.muted : palette.accent },
          ]}>
          +
        </Text>
      </Pressable>
    </View>
  );
});

// ── Section head ──────────────────────────────────────────────────────

/**
 * 12pt uppercase muted was already right; what it lacked was a rule above
 * it, so a sheet of twenty controls reads as four sections instead of one
 * long scroll.
 */
export const SectionHead = memo(function SectionHead({
  label,
  first = false,
  trailing,
}: {
  label: string;
  /** No rule above the first section — nothing to separate it from. */
  first?: boolean;
  trailing?: ReactNode;
}) {
  const { palette } = useAppPalette();
  return (
    <View
      style={[
        styles.sectionHead,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.border ?? palette.muted,
        },
      ]}>
      <Text
        style={[styles.sectionLabel, { color: palette.muted }]}
        numberOfLines={1}>
        {label}
      </Text>
      {trailing}
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: desktopSize(13),
    paddingVertical: desktopSize(8),
    borderRadius: 13,
    minWidth: 44,
    alignItems: 'center',
  },
  chipLabel: { fontSize: desktopSize(13), fontWeight: '600' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: desktopSize(14),
    paddingVertical: desktopSize(11),
    borderRadius: 14,
  },
  actionGlyph: { fontSize: desktopSize(13), fontWeight: '700' },
  actionLabel: { fontSize: desktopSize(13.5), fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    paddingHorizontal: 4,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: { fontSize: 18, fontWeight: '700' },
  stepperValue: {
    minWidth: 38,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 18,
    paddingTop: 14,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
