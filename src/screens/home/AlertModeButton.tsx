/**
 * How this prayer announces itself — the control, on the row.
 *
 * A speaker for the adhan, a bell for the plain alert, a struck bell for
 * silence. One tap cycles; the label under it names the state, because a
 * glyph alone asks the reader to remember which of three it is looking
 * at and this is a control people will set once and then rely on.
 *
 * It lives beside the time, not in Settings, because the question it
 * answers is a question about THIS prayer — Fajr at 04:30 is a different
 * decision from Maghrib — and a setting three screens away that has to
 * be changed twice a day is a setting people abandon.
 */
import { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Line } from 'react-native-svg';
import type { AppPalette } from '../../theme/appPalette';
import type { PrayerAlertMode } from '../../settings/alertModes';

const SIZE = 20;

/** A speaker with two waves — the call going out. */
function AdhanGlyph({ color }: { color: ColorValue }) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24">
      <Path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill={color}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** A bell — an alert, not a call. */
function BellGlyph({
  color,
  struck,
}: {
  color: ColorValue;
  struck?: boolean;
}) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24">
      <Path
        d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5H4.5L6 16z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M10 19a2 2 0 0 0 4 0"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
      {struck ? (
        <Line
          x1="4"
          y1="20"
          x2="20"
          y2="4"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

type Props = {
  mode: PrayerAlertMode;
  palette: AppPalette;
  /** Cycle to the next mode this row allows. */
  onPress: () => void;
  /** The localised prayer name, for the accessibility label. */
  prayerLabel: string;
  /** Muted styling for Sunrise and the night marks. */
  secondary?: boolean;
};

function AlertModeButtonImpl({
  mode,
  palette,
  onPress,
  prayerLabel,
  secondary = false,
}: Props) {
  const { t } = useTranslation();

  const label =
    mode === 'adhan'
      ? t('settings.alertModeAdhan', 'Adhan')
      : mode === 'notification'
        ? t('settings.alertModeNotification', 'Alert')
        : t('settings.alertModeSilent', 'Silent');

  // Silence reads as absence: the struck bell and its word sit back, so a
  // glance down the card shows which prayers will speak.
  const tint =
    mode === 'silent'
      ? palette.muted
      : secondary
        ? palette.muted
        : palette.accentSolid;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${prayerLabel} — ${label}`}
      accessibilityHint={t(
        'settings.alertModeHint',
        'Changes how this prayer alerts you',
      )}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={styles.glyph}>
        {mode === 'adhan' ? (
          <AdhanGlyph color={tint} />
        ) : (
          <BellGlyph color={tint} struck={mode === 'silent'} />
        )}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: tint }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export const AlertModeButton = memo(AlertModeButtonImpl);

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    paddingVertical: 2,
  },
  pressed: { opacity: 0.55 },
  glyph: { height: SIZE, justifyContent: 'center' },
  label: { fontSize: 9, fontWeight: '600', marginTop: 1 },
});
