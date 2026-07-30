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
  I18nManager,
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
    return width / layout.measure;
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

  // Ayah line. `row-reverse` places the first word on the right without
  // depending on the app's RTL flag, which follows the UI language, not the
  // script — the mushaf is right-to-left in every locale.
  const stretched = !line.centered;
  return (
    <View
      style={[
        styles.line,
        {
          width,
          height: lineHeight,
          justifyContent: stretched ? 'space-between' : 'center',
        },
      ]}
    >
      {line.words.map((word, i) => {
        const isSelected = sameAyah(selected, word) || sameAyah(playing, word);
        const isActive =
          activeWord != null &&
          activeWord.surah === word.surah &&
          activeWord.ayah === word.ayah &&
          activeWord.position === word.position;
        return (
          <Pressable
            key={`${word.surah}:${word.ayah}:${word.position}:${i}`}
            onPress={() => onPress(word)}
            onLongPress={() => onLongPress(word)}
            delayLongPress={280}
            // The glyphs already carry the printed side bearings; extra hit
            // padding would overlap neighbours and mis-target taps.
            hitSlop={{ top: lineHeight * 0.12, bottom: lineHeight * 0.12 }}
            style={[
              isSelected && { backgroundColor: colors.selection },
              !line.centered && styles.wordFlexible,
              isActive && { backgroundColor: colors.selection },
            ]}
          >
            <Text
              allowFontScaling={false}
              // Keep bidi out of it: each token is a single standalone glyph.
              style={[
                styles.word,
                {
                  fontFamily: fontFamily ?? undefined,
                  fontSize,
                  lineHeight,
                  color: word.isEnd ? colors.accent : colors.text,
                },
              ]}
            >
              {orderedToken(word.text)}
            </Text>
          </Pressable>
        );
      })}
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  wordFlexible: {
    // Words keep their natural width; only the gaps between them stretch.
    flexShrink: 0,
  },
  word: {
    textAlign: 'center',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    includeFontPadding: false,
  },
  plate: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
