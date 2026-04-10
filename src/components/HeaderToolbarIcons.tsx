import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';

type Props = {
  tintColor: string;
  onMonth: () => void;
  onCompass: () => void;
  onSettings: () => void;
  monthA11yLabel: string;
  compassA11yLabel: string;
  settingsA11yLabel: string;
  /** When false, only month + compass (e.g. home body row). Default true. */
  showSettings?: boolean;
};

const ICON = 24;

/** Wall calendar: page + twin rings + header line (Feather-style). */
export function CalendarIcon({
  color,
  size = ICON,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no">
      <Rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
        ry="2"
        stroke={color}
        strokeWidth={2}
        fill="none"
      />
      <Path
        d="M16 2v4M8 2v4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M3 10h18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Compass dial + filled needle diamond (Feather-style). */
export function CompassIcon({
  color,
  size = ICON,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={2} fill="none" />
      <Polygon
        fill={color}
        points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88 16.24,7.76"
      />
    </Svg>
  );
}

const GEAR_TOOTH_ANGLES = [0, 60, 120, 180, 240, 300];

/** Classic 6-tooth gear around a hub ring. */
function SettingsIcon({
  color,
  size = ICON,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no">
      <Circle
        cx="12"
        cy="12"
        r="3.35"
        stroke={color}
        strokeWidth={1.85}
        fill="none"
      />
      {GEAR_TOOTH_ANGLES.map(deg => (
        <G key={deg} transform={`rotate(${deg} 12 12)`}>
          <Rect
            x="10.2"
            y="1.65"
            width="3.6"
            height="5"
            rx="1"
            fill={color}
          />
        </G>
      ))}
    </Svg>
  );
}

export function HeaderToolbarIcons({
  tintColor,
  onMonth,
  onCompass,
  onSettings,
  monthA11yLabel,
  compassA11yLabel,
  settingsA11yLabel,
  showSettings = true,
}: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={monthA11yLabel}
        onPress={onMonth}
        hitSlop={10}
        style={styles.hit}>
        <CalendarIcon color={tintColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={compassA11yLabel}
        onPress={onCompass}
        hitSlop={10}
        style={styles.hit}>
        <CompassIcon color={tintColor} />
      </Pressable>
      {showSettings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={settingsA11yLabel}
          onPress={onSettings}
          hitSlop={10}
          style={styles.hit}>
          <SettingsIcon color={tintColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hit: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
