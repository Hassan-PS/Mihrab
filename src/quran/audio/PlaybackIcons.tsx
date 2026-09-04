/**
 * The four marks the recitation controls are made of.
 *
 * Drawn, not typed. A glyph like ▶︎ or ✕ is somebody else's artwork at
 * somebody else's weight: it lands at a different size and stroke on
 * every platform and Android skin, some of them render it in colour, and
 * none of them take the accent when the control is active. These are the
 * same 2pt round-capped strokes as the rest of the app's icons, and they
 * take a resolved hex — react-native-svg draws nothing at all when handed
 * a PlatformColor.
 *
 * Shared by the bar under the title bar and by the now-playing row on the
 * Qur'an page, so the same action is the same shape wherever it appears.
 */
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';

export function PlayIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 4.5 19.5 12 7 19.5V4.5Z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({
  color,
  size = 18,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={4.5} width={4} height={15} rx={1.4} fill={color} />
      <Rect x={14} y={4.5} width={4} height={15} rx={1.4} fill={color} />
    </Svg>
  );
}

/** Stop the recitation and put the bar away. */
export function CloseIcon({
  color,
  size = 18,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6 6 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * A beamed pair of quavers — "the player", as opposed to the muṣḥaf.
 *
 * The noteheads are FILLED and the stems are stroked, which is how a note
 * is actually drawn and the only version of this that survives 16 points.
 * The first attempt stroked everything, so at that size the two heads
 * came out as rings with a hole in the middle — two small circles that
 * read as anything but a note, sitting next to a solid play triangle and
 * a solid pause bar. The heads are also tilted, because a horizontal
 * ellipse under a vertical stem is a lollipop.
 */
export function TilawahIcon({
  color,
  size = 18,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Stems, and the beam that joins them. */}
      <Path
        d="M9.4 17.2V6.1l9.2-2v11.1"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.4 8.6l9.2-2"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      {/* Noteheads, tilted the way a print one is. */}
      <Ellipse
        cx={7}
        cy={17.4}
        rx={2.9}
        ry={2.2}
        transform="rotate(-18 7 17.4)"
        fill={color}
      />
      <Ellipse
        cx={16.2}
        cy={15.4}
        rx={2.9}
        ry={2.2}
        transform="rotate(-18 16.2 15.4)"
        fill={color}
      />
    </Svg>
  );
}

/** An open book — the muṣḥaf, as opposed to the player. */
export function ReaderIcon({
  color,
  size = 18,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 6.5C10.5 5.2 8.6 4.5 6 4.5H3v14h3c2.6 0 4.5.7 6 2 1.5-1.3 3.4-2 6-2h3v-14h-3c-2.6 0-4.5.7-6 2Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M12 6.5v14" stroke={color} strokeWidth={2} />
    </Svg>
  );
}
