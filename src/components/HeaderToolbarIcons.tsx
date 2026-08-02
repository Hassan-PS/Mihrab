// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme; donations section uses platform brand colors).
import { memo } from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { SettingsGearIcon } from '../theme/icons';

type Props = {
  tintColor: string;
  onMonth: () => void;
  onCompass: () => void;
  onSettings: () => void;
  monthA11yLabel: string;
  compassA11yLabel: string;
  settingsA11yLabel: string;
  /** When false, settings doesn't render (e.g. home body row). Default true. */
  showSettings?: boolean;
  /**
   * When false, the calendar (month) icon doesn't render. Used on the home
   * screen header where the same destination is offered by the
   * "Prayer times for the whole month" link below the prayer table —
   * the duplicate header icon was visual noise. Default true so other
   * screens (Compass, Quran, Settings) keep their toolbar.
   */
  showMonth?: boolean;
  /**
   * When false, the compass icon doesn't render. Used on the home screen
   * for the same reason as showMonth — Compass already lives in the
   * QuickActionsGrid tile under the prayer table. Default true.
   */
  showCompass?: boolean;
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
 * The settings gear now lives in the shared icon set (`theme/icons.tsx`)
 * because the Settings TAB draws it too — one destination, one glyph. This
 * wrapper only pins the toolbar's size.
 */
function SettingsIconImpl({
  color,
  size = ICON,
}: {
  color: string;
  size?: number;
}) {
  return <SettingsGearIcon color={color} size={size} />;
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
  showMonth = true,
  showCompass = true,
}: Props) {
  return (
    <View style={styles.row}>
      {showMonth ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={monthA11yLabel}
          onPress={onMonth}
          hitSlop={10}
          style={styles.hit}>
          <CalendarIcon color={tintColor} />
        </Pressable>
      ) : null}
      {showCompass ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={compassA11yLabel}
          onPress={onCompass}
          hitSlop={10}
          style={styles.hit}>
          <CompassIcon color={tintColor} />
        </Pressable>
      ) : null}
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
