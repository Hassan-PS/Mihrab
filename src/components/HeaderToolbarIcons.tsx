// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme; donations section uses platform brand colors).
import { memo } from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

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
function CalendarIconImpl({
  color,
  size = ICON,
}: {
  color: ColorValue;
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

export const CalendarIcon = memo(CalendarIconImpl);

/** Compass dial + filled needle diamond (Feather-style). */
function CompassIconImpl({
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

export const CompassIcon = memo(CompassIconImpl);

/**
 * Lucide-style settings gear (stroke) — reads clearly as a cog, not a flower.
 */
function SettingsIconImpl({
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
      <Path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const SettingsIcon = memo(SettingsIconImpl);

function HeaderToolbarIconsImpl({
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

/**
 * Memo'd. Used in screen headers — re-renders only when one of the 7 props
 * actually changes (typically: tintColor on theme switch, accessibility labels
 * on locale switch, or a stale callback identity if a parent forgets useCallback).
 */
export const HeaderToolbarIcons = memo(HeaderToolbarIconsImpl);

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
