/**
 * Font-rendered mushaf page — v2.8.0.
 *
 * Draws a page of the Madinah mushaf as text using that page's own QPC v2
 * font, in place of the 2600×4206 PNG the reader used until now. Vector text
 * is crisp at any size, costs a fraction of the memory, and re-lays out
 * instantly on rotation — and because every word is a real node, tapping a
 * word resolves an ayah directly instead of going through hand-measured
 * coordinate boxes.
 *
 * ## How a page is sized, and how a line is justified
 *
 * `pageMeasureEm()` gives the page's measure: its widest line as DRAWN — the
 * glyph advances plus a nominal space per gap — in ems of its own font.
 * Setting `fontSize = textWidth / measureEm` makes that line span the page
 * exactly, so every page comes out the same physical width even though the
 * 604 fonts are drawn at different design sizes.
 *
 * Every other line is then justified by SOLVING for its space: the gap that
 * makes `natural + gaps × space` equal the measure, held inside the band in
 * `docs/mushaf-fidelity-rules.md`. A line that would need more than the band
 * allows — and the line that closes a surah, which the print never stretches
 * — is set at the nominal space and centred.
 *
 * That only works because the gap is drawn in a font we ship, at a size
 * derived from that font's own space advance (`MUSHAF_SPACE_ADVANCE_EM`). The
 * QPC page fonts carry no space glyph, so a plain space falls back to whatever
 * face the platform picks, at a width we never measured and that differs
 * between iOS and Android. When that width came out wider than the box the
 * line was given, every line of page 49 lost its last word.
 *
 * The other half of that lesson is `MUSHAF_LINE_BOX_SLACK_EM`, reserved out
 * of the page block: Android lays a single line out by BREAKING it, and when
 * nothing in the line is breakable it breaks between glyphs — and a QPC glyph
 * is a whole word. A line one sub-pixel over its box therefore does not clip,
 * it loses a word. The line must simply never be wider than its box.
 *
 * There are no bidi control characters in the paragraph. QPC numbers its
 * glyphs in reading order, so a right-to-left paragraph of bare tokens is
 * already correct; see `lineTokenStream`.
 */
import React, { useCallback, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  MUSHAF_LINE_BOX_SLACK_EM,
  WORD_SPACE_EM,
  gapMetrics,
  getPageLayout,
  isFramedPage,
  lineGapCount,
  lineSpaceEm,
  lineTokenStream,
  pageBlockEm,
  pageMeasureEm,
  type MushafLine,
  type MushafWord,
} from './mushafLayout';
import type { AyahTint } from './ayahMarks';
import { useActiveWordOn, wordCode } from './audio/activeWordStore';
import { BasmalahRow, SurahBandRow } from './mushafOrnaments';
import { FONTS } from '../theme/typography';

/**
 * Height of one line as a multiple of the font size. Derived from the print:
 * the text block of a regular page is 2540 × 4157 px, i.e. 1.636 as tall as it
 * is wide, over 15 lines of a ~15.75 em measure.
 */
export const MUSHAF_LINE_HEIGHT_EM = 1.7183;

/**
 * The gap character: a no-break space, so a line has no ordinary break
 * opportunity in it. That is worth having, but do not mistake it for the
 * defence against losing a word — it is not. Measured on a Pixel: when a line
 * overflows its box with nothing breakable in it, Android breaks between
 * glyphs anyway, and a QPC glyph is a whole word, so the line still loses its
 * last one. Only `MUSHAF_LINE_BOX_SLACK_EM` prevents that, by making sure the
 * line never overflows in the first place. U+00A0's advance in AmiriQuran is
 * the same as the space's, so it costs nothing to use.
 */
const GAP = '\u00A0';

/** Ratio of page height to text width, used to size the page container. */
export function mushafPageAspect(page: number, lineCount: number): number {
  // Framed plates (1–2) hold fewer, larger lines but the same proportions.
  return isFramedPage(page) ? lineCount * 0.145 : lineCount * 0.109;
}

export type AyahRef = { surah: number; ayah: number };

export type MushafTextPageProps = {
  page: number;
  /** Width available for the page's text block, in dp. */
  width: number;
  colors: {
    text: string;
    /** Ayah medallions and surah band strokes. */
    accent: string;
    /** The surah's name inside its band — see the surface's night palette. */
    heading: string;
    /** Background behind the selected ayah. */
    selection: string;
    /** Surah plate / basmalah colour. */
    muted: string;
    /** Behind the one word being recited. */
    word: string;
  };
  /** Family name the page font is registered under; null → nothing to draw. */
  fontFamily: string | null;
  /**
   * Height of one line in dp. The reader passes the page box height divided by
   * the line count so a text page occupies exactly the same box an image page
   * did; without it the page falls back to the print's own proportions.
   */
  lineHeight?: number;
  selected?: AyahRef | null;
  /** Ayah currently being recited — highlighted while audio plays. */
  playing?: AyahRef | null;
  /**
   * Bookmarks and khatmah marks, as a colour per ayah (`ayahMarks.ts`).
   *
   * Optional, and when it is absent the page falls back to tinting
   * `selected ?? playing` in `colors.selection` — which is all this
   * renderer could show before there was a tint to hand it.
   */
  tint?: AyahTint;
  onWordPress?: (ref: AyahRef, word: MushafWord) => void;
  onWordLongPress?: (ref: AyahRef, word: MushafWord) => void;
  style?: StyleProp<ViewStyle>;
};

function sameAyah(a: AyahRef | null | undefined, w: MushafWord): boolean {
  return a != null && a.surah === w.surah && a.ayah === w.ayah;
}

/**
 * Memoized: a page is ~260 drawn pieces, and the reader re-renders for reasons
 * that have nothing to do with the page — a page turn, an ayah change during
 * recitation, the chrome coming and going. Without this the whole tree was
 * rebuilt each time, and because the callbacks below feed `LineView`'s own
 * memo, every line went with it.
 */
function MushafTextPage({
  page,
  width,
  colors,
  fontFamily,
  lineHeight: lineHeightProp,
  selected,
  playing,
  tint,
  onWordPress,
  onWordLongPress,
  style,
}: MushafTextPageProps) {
  const layout = useMemo(() => getPageLayout(page), [page]);

  // The page's measure as DRAWN — advances plus a nominal space per gap. The
  // widest line then spans the block exactly and no line can exceed it, so
  // nothing has to be shrunk by a safety factor and pages stop rendering
  // smaller than they need to be.
  const measureEm = useMemo(
    () => (layout ? pageMeasureEm(layout) : 0),
    [layout],
  );
  // Size from the BLOCK, not the measure: the block is the measure plus the
  // slack every line's box carries, so the widest line spans the measure and
  // its box still stops exactly at the edge of the page block.
  const fontSize = layout && measureEm > 0 ? width / pageBlockEm(layout) : 0;

  const handlePress = useCallback(
    (word: MushafWord) => {
      onWordPress?.({ surah: word.surah, ayah: word.ayah }, word);
    },
    [onWordPress],
  );

  const handleLongPress = useCallback(
    (word: MushafWord) => {
      onWordLongPress?.({ surah: word.surah, ayah: word.ayah }, word);
    },
    [onWordLongPress],
  );

  if (!layout || fontSize <= 0) return null;

  const lineHeight =
    lineHeightProp && lineHeightProp > 0
      ? lineHeightProp
      : fontSize * MUSHAF_LINE_HEIGHT_EM;

  /**
   * The colour an ayah's runs are drawn on, or null for the bare page.
   *
   * With a `tint` this is every mark the page carries — bookmarks, the
   * khatmah's position and its target, the selection, the reciter — each
   * already resolved to one colour per ayah by `ayahMarks.ts`. Without
   * one it is the old behaviour and nothing else: the selected or playing
   * ayah, in the page's neutral selection wash.
   */
  const tintOf = (w: MushafWord): string | null => {
    if (tint) return tint(w.surah, w.ayah);
    return sameAyah(selected ?? playing ?? null, w) ? colors.selection : null;
  };

  return (
    <View style={[{ width }, style]}>
      {layout.lines.map((line, index) => (
        <LineView
          key={index}
          line={line}
          measureEm={measureEm}
          width={width}
          fontSize={fontSize}
          lineHeight={lineHeight}
          fontFamily={fontFamily}
          colors={colors}
          marks={lineMarks(line, tintOf)}
          onPress={handlePress}
          onLongPress={handleLongPress}
        />
      ))}
    </View>
  );
}

/**
 * A line's marks as ONE STRING — the colour of each word, `|`-joined, and
 * '' when nothing on the line is marked.
 *
 * ── WHY A STRING ─────────────────────────────────────────────────────
 *
 * The tint used to reach every line as a function, and a function has no
 * value to compare: each new one — every recited ayah, every bookmark, every
 * time the selection moved — failed the memo on all fifteen lines of every
 * mounted page, and on a spread that is ninety lines re-shaped for a change
 * that touched two. A string compares by value, so a line whose marks are
 * the same as last time is the same as last time, whatever happened to the
 * page around it.
 */
export function lineMarks(
  line: MushafLine,
  tintOf: (w: MushafWord) => string | null,
): string {
  if (line.kind !== 'ayah') return '';
  let any = false;
  const parts = line.words.map(w => {
    const c = tintOf(w);
    if (c) any = true;
    return c ?? '';
  });
  return any ? parts.join('|') : '';
}

export default React.memo(MushafTextPage);

type LineViewProps = {
  line: MushafLine;
  /** The page's measure as drawn, in ems — what the font size derives from. */
  measureEm: number;
  width: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string | null;
  colors: MushafTextPageProps['colors'];
  /** See `lineMarks`: one colour per word, or '' for a bare line. */
  marks: string;
  onPress: (w: MushafWord) => void;
  onLongPress: (w: MushafWord) => void;
};

const LineView = React.memo(function LineView({
  line,
  measureEm,
  width,
  fontSize,
  lineHeight,
  fontFamily,
  colors,
  marks,
  onPress,
  onLongPress,
}: LineViewProps) {
  // The word being recited on THIS line, or -1 — a subscription per line,
  // answered as a number, so four polls a second wake the two lines that
  // carry the ayah and none of the others. Before the band/basmalah
  // returns: a hook, so it runs on every render of the line.
  const activeWord = useActiveWordOn(line);
  if (line.kind === 'surah') {
    // The band takes the full measure, as it does in the print, where a surah
    // opens across the whole text block rather than in a plate the width of
    // its own name — and it is drawn by `mushafOrnaments`, the same call the
    // Unicode renderer makes, so the two muṣḥafs cannot drift apart.
    return (
      <SurahBandRow
        surah={line.surah}
        width={width}
        rowHeight={lineHeight}
        fontSize={fontSize}
        colors={colors}
      />
    );
  }

  if (line.kind === 'basmalah') {
    return (
      <BasmalahRow
        width={width}
        rowHeight={lineHeight}
        fontSize={fontSize}
        colors={colors}
      />
    );
  }

  // Ayah line — ONE paragraph, not a view per word.
  //
  // Several QPC glyphs draw ink far wider than their advance so they
  // interlock with their neighbours: page 1's ٱلرَّحْمَٰنِ advances 1.29 em and
  // inks 2.86 em. Laying such a word out in its own box, at its own advance,
  // puts that ink on top of the word beside it — and no amount of gap fixes
  // it, because the gap moves the neighbour out of the interlock the font was
  // drawn for. Handing the whole line to the font as one paragraph is the only
  // way it lands right, so word taps are resolved from the advances instead.
  // The gaps are nested <Text> nodes inside that paragraph, which is not a new
  // break in the run: the page font has no space glyph, so every gap was
  // already a fallback run of its own — this one just has a width we know.
  const spaceEm = lineSpaceEm(line, measureEm);
  const space = spaceEm * fontSize;
  const lineWidth = line.natural * fontSize + space * lineGapCount(line);
  // The box the line is drawn in. The slack was reserved out of the page
  // block when the font size was chosen, so this is never wider than `width`
  // — nothing overflows its parent, on either platform.
  const boxWidth = lineWidth + fontSize * MUSHAF_LINE_BOX_SLACK_EM;
  const runRightEdge = (boxWidth - lineWidth) / 2 + lineWidth;

  const wordAt = (xFromRight: number): MushafWord | null => {
    let cursor = 0;
    for (const word of line.words) {
      cursor += word.advance * fontSize + space;
      if (xFromRight <= cursor) return word;
    }
    return line.words[line.words.length - 1] ?? null;
  };

  // A gap is drawn in a font we ship, so its advance is known: AmiriQuran's
  // space is MUSHAF_SPACE_ADVANCE_EM wide, and `gapMetrics` splits the space
  // this line was solved for into a size for that glyph and a letter spacing
  // that is NEVER NEGATIVE — see the comment on it, and issue #6, which is
  // the missing words that negative spacing cost.
  const gapStyle = { fontFamily: FONTS.arabicQuran, ...gapMetrics(spaceEm, fontSize) };
  // A gap inside a token — the space before a hizb or sajdah symbol — is
  // budgeted by the build script at the nominal width, so draw it there.
  const innerGapStyle = {
    fontFamily: FONTS.arabicQuran,
    ...gapMetrics(WORD_SPACE_EM, fontSize),
  };
  // The marks arrive resolved, one colour per word — see `lineMarks`.
  const wordTints = marks ? marks.split('|') : null;
  const tintAt = (index: number): string | null =>
    wordTints ? wordTints[index] || null : null;

  // Marking a single ayah inside one paragraph needs the paragraph split at
  // the ayah boundary — nested <Text> keeps the text one shaped stream, so
  // the glyphs still interlock across the boundary.
  const nodes: React.ReactNode[] = [];
  lineTokenStream(line).forEach((piece, i) => {
    if (piece.kind === 'gap') {
      // A gap carries the mark when both sides of it do, so the wash
      // behind an ayah reads as one unbroken run. An inner gap always has
      // the same word on both sides.
      const colour = tintAt(piece.index);
      const on =
        colour != null &&
        (piece.inner ||
          (piece.index > 0 && tintAt(piece.index - 1) === colour));
      const base = piece.inner ? innerGapStyle : gapStyle;
      nodes.push(
        <Text key={i} style={on ? [base, { backgroundColor: colour }] : base}>
          {GAP}
        </Text>,
      );
      return;
    }
    const w = piece.word;
    // The recited word, lit on top of whatever its ayah is washed in. The
    // medallion is a "word" to QPC but never to a reciter.
    const lit =
      activeWord >= 0 &&
      !w.isEnd &&
      activeWord === wordCode(w.surah, w.ayah, w.position);
    const colour = lit ? colors.word : tintAt(piece.index);
    nodes.push(
      colour != null ? (
        <Text key={i} style={{ backgroundColor: colour }}>
          {piece.text}
        </Text>
      ) : (
        piece.text
      ),
    );
  });

  return (
    <View style={[styles.line, { width, height: lineHeight }]}>
      <Pressable
        onPress={e => {
          const w = wordAt(runRightEdge - e.nativeEvent.locationX);
          if (w) onPress(w);
        }}
        onLongPress={e => {
          const w = wordAt(runRightEdge - e.nativeEvent.locationX);
          if (w) onLongPress(w);
        }}
        delayLongPress={280}
        style={{ width: boxWidth, height: lineHeight }}
      >
        <Text
          allowFontScaling={false}
          // The line can never wrap — there is no break opportunity in it —
          // but say so anyway: it is the invariant, not an optimisation.
          numberOfLines={1}
          // Clip, never ellipsize. The computed width and what the platform
          // lays out differ by a hair, and with a fixed width that hair would
          // turn every line into "…".
          ellipsizeMode="clip"
          style={[
            styles.word,
            {
              fontFamily: fontFamily ?? undefined,
              fontSize,
              lineHeight,
              color: colors.text,
              width: boxWidth,
            },
          ]}
        >
          {nodes}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: {
    // Centres the run inside its box, which is LINE_BOX_SLACK_EM wider than
    // the run — so the slack is spent evenly on both margins rather than
    // shifting the line off the print's right edge.
    textAlign: 'center',
    // ALWAYS rtl — never I18nManager.isRTL. That flag follows the UI
    // language, and the mushaf is right-to-left in every locale. With an
    // English UI it resolved to 'ltr', which iOS honours: the line laid out
    // left-to-right, putting the first word on the left and reversing the
    // whole line. Android's bidi happened to recover; iOS did not.
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
});
