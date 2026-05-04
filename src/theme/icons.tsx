/**
 * Iconography system — task #37.
 *
 * The app uses `react-native-svg` (already a dep) for icons rather than a
 * pre-built icon library — keeps the bundle slim and lets us hand-tune
 * a small set for the unique islamic-art accents (crescent, mihrab arch,
 * geometric star).
 *
 * Two layers:
 *
 *   • Generic-utility icons (calendar, compass, settings) — already in
 *     `src/components/HeaderToolbarIcons.tsx`. Style = stroked,
 *     2 px width, 24 px viewBox, monochrome via `color` prop.
 *
 *   • App-specific motifs — declared here as inline SVG component factories.
 *     Used for the seasonal treatments (#41) and the empty-state
 *     illustrations (#42).
 *
 * Style guide:
 *   • All icons rendered as 24 × 24 by default.
 *   • Stroke width 2, line caps round, line joins round.
 *   • Single-color via `color` prop — never multi-color (principle 4:
 *     "the app shouldn't shout").
 *   • Triangle-trick borders (`borderLeftWidth + transparent`) require a
 *     `// rtl-safe: triangle geometry` comment per task #14 conventions.
 */

import * as React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type IconProps = { size?: number; color?: string };

/** Crescent moon — used for Ramadan banner, dynamic icon variant.
 *  Geometric, never decorative wallpaper (principle 2: reverent, not heavy). */
export function CrescentIcon({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
        fill={color}
      />
    </Svg>
  );
}

/** Mihrab arch — used as a quiet header accent. */
export function MihrabArchIcon({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 21V14a7 7 0 0114 0v7"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 21h14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** 8-pointed star — Islamic geometric motif used as Eid flourish.
 *  Reverent accent only — never tiled, never used as background. */
export function EightPointStarIcon({ size = 24, color = '#000' }: IconProps) {
  // Two overlaid squares rotated 45° → 8-point star.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l3 6 6 1.5-4.5 4.5 1.5 6-6-3-6 3 1.5-6L3 9.5 9 8z"
        fill={color}
      />
    </Svg>
  );
}

/** Tasbih beads — small line of 5 dots used for the Tasbih nav button. */
export function TasbihIcon({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[4, 8, 12, 16, 20].map((cx, i) => (
        <Circle
          key={i}
          cx={cx}
          cy={12}
          r={2}
          fill={i === 2 ? color : 'none'}
          stroke={color}
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

/** Open book — used for Quran nav button and reading-streak badge. */
export function BookIcon({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M2 4.5A2.5 2.5 0 014.5 2H10v18H4.5A2.5 2.5 0 012 17.5V4.5z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M22 4.5A2.5 2.5 0 0019.5 2H14v18h5.5a2.5 2.5 0 002.5-2.5V4.5z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Map pin / location marker — used for the "Use device location" CTA on
 *  the welcome / location-setup screen. */
export function MapPinIcon({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 22s7-7.58 7-13a7 7 0 10-14 0c0 5.42 7 13 7 13z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={12}
        cy={9}
        r={2.5}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
    </Svg>
  );
}

/** Magnifying glass — used for the "Search city or coords" CTA. */
export function SearchIcon({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={11}
        cy={11}
        r={7}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M16.5 16.5L21 21"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Mosque silhouette — used for the mosque-finder nav button and as the
 *  empty-state illustration for "no mosques found nearby." */
export function MosqueIcon({ size = 24, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* dome */}
      <Path
        d="M6 12a6 6 0 1112 0"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* crescent atop dome */}
      <Circle cx={12} cy={3.5} r={1} fill={color} />
      {/* base wall */}
      <Path
        d="M3 12v9h18v-9"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* archway */}
      <Path
        d="M10 21v-3a2 2 0 014 0v3"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
