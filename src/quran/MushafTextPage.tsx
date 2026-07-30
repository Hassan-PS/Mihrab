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
 * ## How a page is sized
 *
 * The layout data gives each page a `measure` — its widest line, in ems of
 * its own font. Setting `fontSize = textWidth / measure` makes that line span
 * the page exactly, so every page comes out the same physical width even
 * though the 604 fonts are drawn at different design sizes. Lines are then
 * laid out as flex rows: a normal line is `space-between` (the ~2% it falls
 * short of the measure disappears into the word gaps, exactly as the print
 * closes its lines), while a line that ends a surah is centred and left at
 * its natural width.
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
  getPageLayout,
  isFramedPage,
  type MushafLine,
  type MushafWord,
} from './mushafLayout';
import { findSurah } from './quran';
import { FONTS } from '../theme/typography';

/**
 * Height of one line as a multiple of the font size. Derived from the print:
 * the text block of a regular page is 2540 × 4157 px, i.e. 1.636 as tall as it
 * is wide, over 15 lines of a ~15.75 em measure.
 */
export const MUSHAF_LINE_HEIGHT_EM = 1.7183;

/**
 * Widest gap allowed between words, in ems. Beyond this a line stops being
 * justified and is centred instead — the difference between a line that fills
 * its measure and a line that has been pulled apart to pretend it does.
 */
/**
 * Word space, in ems. The page fonts carry no space glyph and their advances
 * stop at the ink, so words rendered back to back collide — بِسْمِ runs into
 * ٱللَّهِ. The print sets a space between words and so does every other QPC
 * renderer; the character falls back to the system font at about this width,
 * which is why the build script budgets the same figure per internal space.
 */
export const WORD_SPACE_EM = 0.25;

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
    /** Ayah medallions and surah plate strokes. */
    accent: string;
    /** Background behind the selected ayah. */
    selection: string;
    /** Surah plate / basmalah colour. */
    muted: string;
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
  /** Word currently being recited, for follow-along highlighting. */
  activeWord?: (AyahRef & { position: number }) | null;
  onWordPress?: (ref: AyahRef, word: MushafWord) => void;
  onWordLongPress?: (ref: AyahRef, word: MushafWord) => void;
  style?: StyleProp<ViewStyle>;
};

const BASMALAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

/**
 * Words that QPC draws with more than one glyph must keep the order the font
 * put them in. The glyphs live in the Arabic Presentation Forms block, so the
 * bidi algorithm classifies them as right-to-left and reverses the run —
 * which silently swaps the halves of every multi-glyph word (the basmalah on
 * page 1 was the visible one). The glyphs already sit in visual order, so we
 * override bidi for the token and let the row's `row-reverse` place the words.
 */
const LRO = '‭';
const PDF = '‬';

function orderedToken(text: string): string {
  return text.length > 1 ? `${LRO}${text}${PDF}` : text;
}

function sameAyah(a: AyahRef | null | undefined, w: MushafWord): boolean {
  return a != null && a.surah === w.surah && a.ayah === w.ayah;
}

export default function MushafTextPage({
  page,
  width,
  colors,
  fontFamily,
  lineHeight: lineHeightProp,
  selected,
  playing,
  activeWord,
  onWordPress,
  onWordLongPress,
  style,
}: MushafTextPageProps) {
  const layout = useMemo(() => getPageLayout(page), [page]);

  const fontSize = useMemo(() => {
    if (!layout || layout.measure <= 0) return 0;
    // `measure` is the sum of glyph ADVANCES, but a line is drawn with a word
    // space between every pair of words. Sizing from the advances alone makes
    // every full line render ~10-15% wider than the box it was sized for, so
    // the text runs off both edges. Size from what is actually drawn.
    let widest = layout.measure;
    for (const line of layout.lines) {
      if (line.kind !== 'ayah') continue;
      const drawn =
        line.natural + WORD_SPACE_EM * Math.max(0, line.words.length - 1);
      if (drawn > widest) widest = drawn;
    }
    return width / widest;
  }, [layout, width]);

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

  return (
    <View style={[{ width }, style]}>
      {layout.lines.map((line, index) => (
        <LineView
          key={index}
          line={line}
          measure={layout.measure}
          width={width}
          fontSize={fontSize}
          lineHeight={lineHeight}
          fontFamily={fontFamily}
          colors={colors}
          selected={selected}
          playing={playing}
          activeWord={activeWord}
          onPress={handlePress}
          onLongPress={handleLongPress}
        />
      ))}
    </View>
  );
}

type LineViewProps = {
  line: MushafLine;
  /** The page's widest line, in ems — what the font size was derived from. */
  measure: number;
  width: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string | null;
  colors: MushafTextPageProps['colors'];
  selected?: AyahRef | null;
  playing?: AyahRef | null;
  activeWord?: (AyahRef & { position: number }) | null;
  onPress: (w: MushafWord) => void;
  onLongPress: (w: MushafWord) => void;
};

const LineView = React.memo(function LineView({
  line,
  measure,
  width,
  fontSize,
  lineHeight,
  fontFamily,
  colors,
  selected,
  playing,
  activeWord,
  onPress,
  onLongPress,
}: LineViewProps) {
  if (line.kind === 'surah') {
    const surah = findSurah(line.surah);
    return (
      <View style={[styles.row, { height: lineHeight }]}>
        <View
          style={[
            styles.plate,
            {
              borderColor: colors.accent,
              paddingHorizontal: fontSize * 0.6,
              height: lineHeight * 0.86,
              borderRadius: lineHeight * 0.2,
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: FONTS.arabicQuran,
              fontSize: fontSize * 0.72,
              color: colors.accent,
              // Amiri's tall ascenders need the room or the name clips.
              lineHeight: lineHeight * 0.8,
            }}
          >
            {`سورة ${surah?.arabic ?? ''}`}
          </Text>
        </View>
      </View>
    );
  }

  if (line.kind === 'basmalah') {
    return (
      <View style={[styles.row, { height: lineHeight }]}>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: FONTS.arabicQuran,
            fontSize: fontSize * 0.66,
            color: colors.muted,
            lineHeight: lineHeight * 0.9,
          }}
        >
          {BASMALAH}
        </Text>
      </View>
    );
  }

  // Ayah line — ONE text run, not a view per word.
  //
  // Several QPC glyphs draw ink far wider than their advance so they
  // interlock with their neighbours: page 1's ٱلرَّحْمَٰنِ advances 1.29 em and
  // inks 2.86 em. Laying such a word out in its own box, at its own advance,
  // puts that ink on top of the word beside it — and no amount of gap fixes
  // it, because the gap moves the neighbour out of the interlock the font was
  // drawn for. Handing the whole line to the font as a single run is the only
  // way it lands right, so word taps are resolved from the advances instead.
  const space = WORD_SPACE_EM * fontSize;
  const lineWidth =
    line.natural * fontSize + space * Math.max(0, line.words.length - 1);

  const wordAt = (xFromRight: number): MushafWord | null => {
    let cursor = 0;
    for (const word of line.words) {
      cursor += word.advance * fontSize + space;
      if (xFromRight <= cursor) return word;
    }
    return line.words[line.words.length - 1] ?? null;
  };

  // Highlighting a single ayah inside one run needs the run split at the ayah
  // boundary — nested <Text> keeps it a single shaped run, so the glyphs still
  // interlock across the boundary.
  const highlight = selected ?? playing ?? null;
  const parts: Array<{ text: string; on: boolean }> = [];
  for (const word of line.words) {
    const on = sameAyah(highlight, word);
    const last = parts[parts.length - 1];
    const token = orderedToken(word.text);
    if (last && last.on === on) last.text += ` ${token}`;
    else parts.push({ text: parts.length ? ` ${token}` : token, on });
  }

  return (
    <View style={[styles.line, { width, height: lineHeight }]}>
      <Pressable
        onPress={e => {
          const w = wordAt(lineWidth - e.nativeEvent.locationX);
          if (w) onPress(w);
        }}
        onLongPress={e => {
          const w = wordAt(lineWidth - e.nativeEvent.locationX);
          if (w) onLongPress(w);
        }}
        delayLongPress={280}
        style={{ width: lineWidth, height: lineHeight }}
      >
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          // Clip, never ellipsize. The measured advance total and what the
          // platform actually lays out differ by a hair, and with a fixed
          // width that hair turns every line into "…".
          ellipsizeMode="clip"
          style={[
            styles.word,
            {
              fontFamily: fontFamily ?? undefined,
              fontSize,
              lineHeight,
              color: colors.text,
              // Slack over the measured width so a hair of rounding cannot
              // trigger a clip — but ABSOLUTE, not a percentage. 6% of a
              // full-measure line is wide enough to push the ink past the
              // page block and across the frame rule.
              width: lineWidth + fontSize * 0.08,
            },
          ]}
        >
          {parts.map((part, i) =>
            part.on ? (
              <Text key={i} style={{ backgroundColor: colors.selection }}>
                {part.text}
              </Text>
            ) : (
              part.text
            ),
          )}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: {
    textAlign: 'center',
    // ALWAYS rtl — never I18nManager.isRTL. That flag follows the UI
    // language, and the mushaf is right-to-left in every locale. With an
    // English UI it resolved to 'ltr', which iOS honours: the line laid out
    // left-to-right, putting the first word on the left and reversing the
    // whole line. Android's bidi happened to recover; iOS did not.
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  plate: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
