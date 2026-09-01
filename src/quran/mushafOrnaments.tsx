/**
 * The illuminated furniture of a mushaf page — the surah band and the
 * basmalah that open every surah.
 *
 * In the Madinah print a surah does not begin with a line of text; it begins
 * with a **band**: a rectangle ruled twice, its border filled with worked
 * ornament, a rosette closing each end, and the surah's name set in the middle.
 * The basmalah follows it, unframed, in the same hand as the page.
 *
 * We are not reproducing the illumination — the print's is polychrome gold and
 * lapis, and imitating it badly is worse than not imitating it. What is drawn
 * here is its *structure*, in one colour, at the app's own weight: the double
 * rule, a dentil course between the rules, and an eight-point rosette at each
 * end. That reads as deliberate at the size a phone actually renders it, which
 * a traced arabesque does not — it turns to mud below about 40 dp of height.
 *
 * Everything is expressed as a fraction of the band's height, so it holds
 * together from a phone in portrait to an iPad spread without a second set of
 * numbers.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { FONTS } from '../theme/typography';
import { findSurah } from './quran';

/** Eight-point star: two squares, one at 45°, as a single closed path. */
function starPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    // Alternating radii turn the 16 vertices into eight points and eight
    // notches — the standard khatim/seal star of Islamic ornament.
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)},${(
        cy +
        radius * Math.sin(angle)
      ).toFixed(2)}`,
    );
  }
  return `M${points.join('L')}Z`;
}

/** A diamond (square on its point) — the unit of the dentil course. */
function diamondPath(cx: number, cy: number, r: number): string {
  return `M${cx.toFixed(2)},${(cy - r).toFixed(2)}L${(cx + r).toFixed(2)},${cy.toFixed(
    2,
  )}L${cx.toFixed(2)},${(cy + r).toFixed(2)}L${(cx - r).toFixed(2)},${cy.toFixed(2)}Z`;
}

/**
 * The band's two rules and the ornament course between them, as fractions of
 * its height. Exported because the name that sits inside has to be sized from
 * what is left over — see `surahBandFieldHeight`.
 */
const BAND_STROKE = 0.028;
const BAND_COURSE = 0.12;

/**
 * The clear height inside both rules — all the room the surah's name has.
 *
 * Arabic in Amiri drops a long way below the baseline (the tail of ق, ر, ن,
 * the ة), and a name sized against the band's *outer* height put those tails
 * straight through the inner rule. Size the name from this instead: it is the
 * only measurement that describes the space actually available.
 */
export function surahBandFieldHeight(height: number): number {
  return height * (1 - 2 * (BAND_STROKE + BAND_COURSE));
}

export type SurahBandProps = {
  width: number;
  height: number;
  /** The single colour everything is drawn in — the page's ornament colour. */
  color: string;
};

/**
 * The band itself, drawn behind the surah's name.
 *
 * Returns the horizontal inset the name must keep clear of, so the caller can
 * centre the text without it ever running into the rosettes.
 */
export function surahBandTextInset(height: number): number {
  return height * 0.62;
}

export function SurahBand({ width, height, color }: SurahBandProps) {
  if (width <= 0 || height <= 0) return null;

  const stroke = Math.max(1, height * BAND_STROKE);
  const hair = Math.max(0.5, height * 0.016);

  // Outer rule, then the inner one a course inside it. The gap between the
  // two is where the ornament goes — exactly as the print lays it out.
  const outerInset = stroke;
  const course = height * BAND_COURSE;
  const innerInset = outerInset + course;

  const outer = {
    x: outerInset,
    y: outerInset,
    w: width - outerInset * 2,
    h: height - outerInset * 2,
    // Barely rounded. The print's band is a rectangle; rounding it far enough
    // to notice turns it into a UI pill, which is the thing this replaced.
    r: height * 0.08,
  };
  const inner = {
    x: innerInset,
    y: innerInset,
    w: width - innerInset * 2,
    h: height - innerInset * 2,
    r: height * 0.05,
  };
  if (inner.w <= 0 || inner.h <= 0) return null;

  // Rosettes sit INSIDE the field, flanking the name — seals, the way the
  // print sets them. Straddling the inner rule instead let the rule cut
  // through the star, which just looked like two shapes fighting.
  const rosetteR = course * 1.05;
  const rosetteCy = height / 2;
  const rosetteInset = innerInset + course * 0.45 + rosetteR;

  // Dentil course: diamonds marching along the strip between the two rules,
  // all the way round. Running them along the top and bottom only left the
  // short sides bare, which read as unfinished rather than restrained.
  const dentilR = course * 0.3;
  const midTop = outerInset + course / 2;
  const midBottom = height - outerInset - course / 2;
  const midLeft = outerInset + course / 2;
  const midRight = width - outerInset - course / 2;
  const step = course * 1.5;

  /** Diamonds spaced along a run, centred in whatever remainder is left. */
  const march = (
    from: number,
    to: number,
    place: (t: number) => string,
  ): string[] => {
    const span = to - from;
    const n = Math.floor(span / step);
    if (n < 1) return [];
    const lead = from + (span - (n - 1) * step) / 2;
    return Array.from({ length: n }, (_, i) => place(lead + i * step));
  };

  const dentils = [
    ...march(midLeft, midRight, t => diamondPath(t, midTop, dentilR)),
    ...march(midLeft, midRight, t => diamondPath(t, midBottom, dentilR)),
    ...march(midTop + step, midBottom - step, t =>
      diamondPath(midLeft, t, dentilR),
    ),
    ...march(midTop + step, midBottom - step, t =>
      diamondPath(midRight, t, dentilR),
    ),
  ];
  const count = dentils.length;

  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Rect
        x={outer.x}
        y={outer.y}
        width={outer.w}
        height={outer.h}
        rx={outer.r}
        ry={outer.r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
      />
      <Rect
        x={inner.x}
        y={inner.y}
        width={inner.w}
        height={inner.h}
        rx={inner.r}
        ry={inner.r}
        fill="none"
        stroke={color}
        strokeWidth={hair}
        opacity={0.75}
      />
      {count > 0 ? (
        <Path d={dentils.join(' ')} fill={color} opacity={0.42} />
      ) : null}
      {[rosetteInset, width - rosetteInset].map((cx, i) => (
        <Path
          key={i}
          d={starPath(cx, rosetteCy, rosetteR)}
          fill={color}
          opacity={0.72}
        />
      ))}
      {[rosetteInset, width - rosetteInset].map((cx, i) => (
        <Circle
          key={`c${i}`}
          cx={cx}
          cy={rosetteCy}
          r={rosetteR * 0.2}
          fill={color}
        />
      ))}
    </Svg>
  );
}

export type BasmalahRuleProps = {
  width: number;
  height: number;
  color: string;
};

/**
 * The flourish either side of the basmalah: a rule that fades as it leaves the
 * text, closed by a small diamond.
 *
 * The print leaves the basmalah bare, and for good reason — it is the phrase
 * that carries the line, not any decoration around it. What this adds is only
 * what a bare centred line of type lacks on a screen: something to sit the
 * phrase between, so it reads as placed rather than as text that happened to
 * land there. It is drawn at a third of the band's weight so it never competes
 * with the band above it.
 */
export function BasmalahFlourish({ width, height, color }: BasmalahRuleProps) {
  if (width <= 2 || height <= 0) return null;
  const cy = height / 2;
  // The same eight-point seal as the band's, at a quarter of the size — the
  // two ornaments on the page are then the one motif at two scales, rather
  // than two unrelated decorations.
  const r = Math.max(1.5, height * 0.2);
  const ruleEnd = width - r * 2.6;
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Path
        d={`M0,${cy.toFixed(2)}H${ruleEnd.toFixed(2)}`}
        stroke={color}
        strokeWidth={Math.max(0.5, height * 0.045)}
        opacity={0.22}
      />
      <Path d={starPath(width - r, cy, r)} fill={color} opacity={0.5} />
    </Svg>
  );
}


// ── The rows, as a page places them ───────────────────────────────────
//
// The band and the basmalah are drawn identically by BOTH renderers — the
// glyph one that reproduces the Madinah print line for line, and the
// Unicode one a second riwayah needs (`MushafUnicodePage`). They were
// copied into the first renderer when there was only one; a second copy
// is how two muṣḥafs quietly start looking different from each other, one
// ornament at a time. So the placement lives here with the drawing, and
// the renderers pass only what genuinely differs: how tall the row is and
// how big the page's own text is set.

/** What a page's palette has to offer its furniture. */
export type OrnamentColors = {
  /** Band strokes, rosettes, the basmalah's flourish. */
  accent: string;
  /** The surah's name inside the band. */
  heading: string;
  /** The page's own ink — the basmalah is a line of the muṣḥaf, not a caption. */
  text: string;
};

/**
 * The word that precedes the name in a band: “sūrat …”.
 *
 * Not named `..._PREFIX`: `syncCompleteness.test.ts` reads the source for
 * `const *_KEY/*_PREFIX = '…'` to find every storage key the app declares,
 * and a constant that merely LOOKS like one fails that test as an
 * undeclared store. The test is right to be blunt about it; this is the
 * cheaper side to fix.
 */
const SURAH_WORD = 'سورة ';
const BASMALAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

export type SurahBandRowProps = {
  surah: number;
  /** Width of the page's text block. */
  width: number;
  /** Height of the row the band sits in. */
  rowHeight: number;
  /** The page's text size — the name is capped against it. */
  fontSize: number;
  colors: OrnamentColors;
  /** Fraction of the row the band itself occupies. */
  bandScale?: number;
  /** Cap on the name, as a fraction of the page's text size. */
  nameScale?: number;
};

/**
 * A surah's opening: the band, across the whole measure, with the name in it.
 *
 * The name is sized from the clear space INSIDE both rules, never from the
 * band's outer height — Amiri's descenders (the tails of ق, ر, ن and the ة)
 * ran straight through the inner rule when it was sized the other way.
 */
export function SurahBandRow({
  surah,
  width,
  rowHeight,
  fontSize,
  colors,
  bandScale = 0.94,
  nameScale = 0.78,
}: SurahBandRowProps) {
  const bandHeight = rowHeight * bandScale;
  const fieldHeight = surahBandFieldHeight(bandHeight);
  const nameSize = Math.min(fontSize * nameScale, fieldHeight * 0.62);
  const name = findSurah(surah)?.arabic ?? '';
  return (
    <View style={[rowStyles.row, { height: rowHeight }]}>
      <View style={{ width, height: bandHeight }}>
        <View style={StyleSheet.absoluteFill}>
          <SurahBand width={width} height={bandHeight} color={colors.accent} />
        </View>
        <View
          style={[
            rowStyles.bandLabel,
            { paddingHorizontal: surahBandTextInset(bandHeight) },
          ]}
        >
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{
              fontFamily: FONTS.arabicQuran,
              fontSize: nameSize,
              color: colors.heading,
              // The glyph box is centred in the full field, so ascenders and
              // descenders share the clearance evenly.
              lineHeight: fieldHeight,
            }}
          >
            {`${SURAH_WORD}${name}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

export type BasmalahRowProps = {
  width: number;
  rowHeight: number;
  fontSize: number;
  colors: OrnamentColors;
  /** Flourish width, as a fraction of the measure. */
  flourishScale?: number;
  /** The phrase's size, as a fraction of the page's text size. */
  textScale?: number;
};

/**
 * The basmalah, set between its two flourishes.
 *
 * At the page's own size and in the page's own ink rather than small and
 * grey: in the print this is a line of the muṣḥaf, not a caption above one.
 */
export function BasmalahRow({
  width,
  rowHeight,
  fontSize,
  colors,
  flourishScale = 0.17,
  textScale = 0.84,
}: BasmalahRowProps) {
  const flourishWidth = width * flourishScale;
  const flourishHeight = rowHeight * 0.5;
  return (
    <View style={[rowStyles.row, { height: rowHeight }]}>
      <View style={rowStyles.basmalahRow}>
        <BasmalahFlourish
          width={flourishWidth}
          height={flourishHeight}
          color={colors.accent}
        />
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: FONTS.arabicQuran,
            fontSize: fontSize * textScale,
            color: colors.text,
            lineHeight: rowHeight * 0.94,
          }}
        >
          {BASMALAH}
        </Text>
        {/* Mirrored, so the pair reads the same from either end. */}
        <View style={rowStyles.flourishMirror}>
          <BasmalahFlourish
            width={flourishWidth}
            height={flourishHeight}
            color={colors.accent}
          />
        </View>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  bandLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  basmalahRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // The flourish is drawn pointing one way; the far side is the same drawing
  // reflected, so the two are guaranteed to match.
  flourishMirror: { transform: [{ scaleX: -1 }] },
});
