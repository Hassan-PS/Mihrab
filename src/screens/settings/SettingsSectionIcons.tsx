/**
 * One glyph per settings section.
 *
 * A list of seven rows is scanned by shape before it is read, and an
 * icon is what makes the second visit to a settings screen faster than
 * the first. They are drawn here rather than pulled from a font so they
 * share the app's stroke weight, and they take a colour so a row can
 * carry the accent when it is the one being pointed at.
 */
import { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

type P = { size?: number; color: ColorValue };
const S = 22;

/** Half-filled circle — light and dark. */
export const AppearanceIcon = memo(({ size = S, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={1.8} fill="none" />
    <Path d="M12 3.5a8.5 8.5 0 0 0 0 17V3.5z" fill={color} />
  </Svg>
));

/** A sun over a horizon — the day the times divide. */
export const PrayerTimesIcon = memo(({ size = S, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={1.8} fill="none" />
    <Path
      d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </Svg>
));

/** A bell. */
export const NotificationsIcon = memo(({ size = S, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16z"
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
  </Svg>
));

/** A pin. */
export const LocationIcon = memo(({ size = S, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
      fill="none"
    />
    <Circle cx="12" cy="10" r="2.5" stroke={color} strokeWidth={1.8} fill="none" />
  </Svg>
));

/** Two panes — the home screen's own surfaces. */
export const WidgetsIcon = memo(({ size = S, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} fill="none" />
    <Rect x="13" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} fill="none" />
    <Rect x="3" y="13" width="18" height="8" rx="2" stroke={color} strokeWidth={1.8} fill="none" />
  </Svg>
));

/** An open book. */
export const QuranIcon = memo(({ size = S, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 6.5S9.8 4.8 4.5 5v13c5.3-.2 7.5 1.5 7.5 1.5s2.2-1.7 7.5-1.5V5c-5.3-.2-7.5 1.5-7.5 1.5z"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
      fill="none"
    />
    <Path d="M12 6.5v13" stroke={color} strokeWidth={1.8} />
  </Svg>
));

/** An i in a circle. */
export const AboutIcon = memo(({ size = S, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={1.8} fill="none" />
    <Path d="M12 11v5.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    <Circle cx="12" cy="7.8" r="1.15" fill={color} />
  </Svg>
));

/** The chevron on the trailing edge of every row. Mirrors under RTL. */
export const ChevronIcon = memo(
  ({ size = 18, color, rtl = false }: P & { rtl?: boolean }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={rtl ? 'M14.5 6L9 12l5.5 6' : 'M9.5 6l5.5 6-5.5 6'}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  ),
);
