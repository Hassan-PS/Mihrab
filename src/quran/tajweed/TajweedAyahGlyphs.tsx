/**
 * An āyah drawn with the tajwīd page fonts, outside the page.
 *
 * The āyah sheet's Tajweed section shows the āyah with its letters tinted.
 * It first drew the API's text in the app's Qur'an face with a coloured
 * `<Text>` nested for every span — and on Android every nested fragment
 * carries its own font span, so the layout shapes each one on its own
 * and the letters either side of a tint come apart (لَمِينَ drawn as
 * four islands). The page fonts need no shaping at all — one glyph per
 * word, coloured by the font itself — so the section draws the āyah's
 * words with them, in the native line view, exactly as the page does.
 *
 * The words come from the layout in the tajwīd set's own geometry
 * (`getPageLayoutIn`), never by switching the reader's live set: the
 * reader under the sheet may well be in plain ink. An āyah that runs
 * over a page turn has words in two fonts, so a line never mixes pages.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { tajweedFontSet } from '../mushafFontStore';
import {
  MUSHAF_FONT_ASCENT_EM,
  MUSHAF_FONT_DESCENT_EM,
  getPageLayoutIn,
  lineInkPadding,
  lineInkSidePadding,
  type MushafWord,
} from '../mushafLayout';
import { MUSHAF_LINE_HEIGHT_EM } from '../MushafTextPage';
import { MushafLineNative, nativeMushafLineAvailable, type MushafLineRun } from '../native/MushafLineView';
import { findPageForAyah } from '../pages';
import { useMushafPageFont } from '../useMushafPageFont';
import { MUSHAF_TOTAL_PAGES } from '../mushafImages';

/** A word of the āyah and the page whose font draws it. */
export type GlyphWord = MushafWord & { page: number };

/** Between words, in ems: the print sets nothing, a sheet reads better with a little. */
const WORD_GAP_EM = 0.12;

/**
 * The āyah's words in page order, with the page each is cut for. Two
 * pages at most: an āyah can run over a turn, never over two.
 */
/**
 * Which faces draw the āyah: the plain page fonts the reader uses, or the
 * tajwīd ones. Named here so the sheet can show the āyah in whatever the
 * muṣḥaf is drawn in.
 */
export type AyahGlyphSet = 'v2' | 'tajweed';

export function ayahGlyphWords(
  surah: number,
  ayah: number,
  set: AyahGlyphSet = 'tajweed',
): GlyphWord[] {
  const first = findPageForAyah(surah, ayah);
  const out: GlyphWord[] = [];
  for (const page of [first, first + 1]) {
    if (page < 1 || page > MUSHAF_TOTAL_PAGES) continue;
    const layout = getPageLayoutIn(page, set);
    if (!layout) continue;
    let found = false;
    for (const line of layout.lines) {
      if (line.kind !== 'ayah') continue;
      for (const w of line.words) {
        if (w.surah === surah && w.ayah === ayah) {
          out.push({ ...w, page });
          found = true;
        }
      }
    }
    // The medallion closes the āyah; past it, nothing on the next page is ours.
    if (!found || out.some(w => w.isEnd)) break;
  }
  return out;
}

type Line = { page: number; words: GlyphWord[]; widthEm: number };

/** Wrap the words into lines of `widthEm`, right to left, never across a page. */
export function wrapGlyphWords(words: GlyphWord[], widthEm: number): Line[] {
  const lines: Line[] = [];
  let line: Line | null = null;
  for (const w of words) {
    const gap = line && line.words.length > 0 ? WORD_GAP_EM : 0;
    if (!line || line.page !== w.page || line.widthEm + gap + w.advance > widthEm) {
      line = { page: w.page, words: [], widthEm: 0 };
      lines.push(line);
    }
    line.widthEm += (line.words.length > 0 ? WORD_GAP_EM : 0) + w.advance;
    line.words.push(w);
  }
  return lines;
}

export function TajweedAyahGlyphs({
  surah,
  ayah,
  fontSize,
  color,
  onWordPress,
  align = 'right',
  glyphs = 'tajweed',
}: {
  surah: number;
  ayah: number;
  fontSize: number;
  color: string;
  onWordPress?: (word: GlyphWord) => void;
  /** Where the lines sit in the width: the page's right, or centred for a single word. */
  align?: 'right' | 'center';
  /**
   * The plain page fonts (`v2`) or the tajwīd ones. The sheet's āyah at
   * the top follows the muṣḥaf: plain ink unless the colours are on.
   */
  glyphs?: AyahGlyphSet;
}) {
  const { isDark } = useAppPalette();
  const set = glyphs === 'v2' ? 'v2' : tajweedFontSet(isDark);
  const [width, setWidth] = useState(0);
  const words = useMemo(() => ayahGlyphWords(surah, ayah, glyphs), [surah, ayah, glyphs]);
  const firstPage = words[0]?.page ?? findPageForAyah(surah, ayah);
  const lastPage = words[words.length - 1]?.page ?? firstPage;
  // Two hooks whatever the āyah, so their count never changes across renders.
  const fontA = useMushafPageFont(firstPage, true, 0, set);
  const fontB = useMushafPageFont(lastPage, lastPage !== firstPage, 0, set);
  const familyOf = (page: number) =>
    page === firstPage ? fontA.family : page === lastPage ? fontB.family : null;

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width),
    [],
  );

  const lineHeight = MUSHAF_LINE_HEIGHT_EM * fontSize;
  const lines = width > 0 ? wrapGlyphWords(words, width / fontSize) : [];

  return (
    <View onLayout={onLayout} style={styles.block}>
      {lines.map((line, i) => (
        <GlyphLine
          key={i}
          line={line}
          width={width}
          fontSize={fontSize}
          lineHeight={lineHeight}
          fontFamily={familyOf(line.page)}
          color={color}
          align={align}
          onWordPress={onWordPress}
        />
      ))}
    </View>
  );
}

/** One word on its own, at its own width — the rule rows' chips. */
export function TajweedWordGlyph({
  word,
  fontSize,
  color,
  onPress,
}: {
  word: GlyphWord;
  fontSize: number;
  color: string;
  onPress?: () => void;
}) {
  const { isDark } = useAppPalette();
  const { family } = useMushafPageFont(word.page, true, 0, tajweedFontSet(isDark));
  const line: Line = { page: word.page, words: [word], widthEm: word.advance };
  return (
    <GlyphLine
      line={line}
      width={Math.ceil(word.advance * fontSize)}
      fontSize={fontSize}
      lineHeight={MUSHAF_LINE_HEIGHT_EM * fontSize}
      fontFamily={family}
      color={color}
      align="right"
      onWordPress={onPress ? () => onPress() : undefined}
    />
  );
}

function GlyphLine({
  line,
  width,
  fontSize,
  lineHeight,
  fontFamily,
  color,
  align,
  onWordPress,
}: {
  line: Line;
  width: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string | null;
  color: string;
  align: 'right' | 'center';
  onWordPress?: (word: GlyphWord) => void;
}) {
  const lineWidth = line.widthEm * fontSize;
  // The right edge of the first word, from the view's left.
  const right = align === 'center' ? (width + lineWidth) / 2 : width;
  const gap = WORD_GAP_EM * fontSize;

  const wordAt = (fromRight: number): GlyphWord | null => {
    let x = 0;
    for (const w of line.words) {
      const end = x + w.advance * fontSize;
      if (fromRight >= x && fromRight < end) return w;
      x = end + gap;
    }
    return null;
  };

  if (!fontFamily) {
    // The font is on its way: hold the line's height so nothing jumps.
    return <View style={{ width, height: lineHeight }} />;
  }

  if (!nativeMushafLineAvailable()) {
    // The `<Text>` path: both platforms draw a colour font in a text
    // view, and a page font needs no shaping across the gaps.
    return (
      <Text
        style={[
          styles.fallback,
          { fontFamily, fontSize, lineHeight, color, textAlign: align },
        ]}
        onPress={
          onWordPress
            ? e => {
                const w = wordAt(right - e.nativeEvent.locationX);
                if (w) onWordPress(w);
              }
            : undefined
        }>
        {line.words.map(w => w.text).join(' ')}
      </Text>
    );
  }

  const Native = MushafLineNative();
  const ink = lineInkPadding(fontSize, lineHeight);
  const side = lineInkSidePadding(fontSize);
  const leading = lineHeight - (MUSHAF_FONT_ASCENT_EM + MUSHAF_FONT_DESCENT_EM) * fontSize;
  const baseline = ink.top + leading / 2 + MUSHAF_FONT_ASCENT_EM * fontSize;
  const runs: MushafLineRun[] = [];
  line.words.forEach((w, i) => {
    if (i > 0) runs.push({ g: gap });
    runs.push({ t: w.text });
  });
  return (
    <Pressable
      disabled={!onWordPress}
      onPress={e => {
        const w = wordAt(right - e.nativeEvent.locationX);
        if (w && onWordPress) onWordPress(w);
      }}
      style={{ width, height: lineHeight }}>
      <Native
        accessible={false}
        importantForAccessibility="no"
        fontFamily={fontFamily}
        fontSize={fontSize}
        color={color}
        runs={runs}
        penRight={side.left + right}
        penBaseline={baseline}
        boxTop={ink.top}
        boxHeight={lineHeight}
        style={{
          width: width + side.left + side.right,
          height: lineHeight + ink.top + ink.bottom,
          marginTop: -ink.top,
          marginBottom: -ink.bottom,
          // Room for ink past the line's physical ends — the line is RTL in every locale.
          // rtl-safe: physical ends of an always-RTL line
          marginLeft: -side.left,
          marginRight: -side.right, // rtl-safe: see above
        }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch' },
  fallback: { writingDirection: 'rtl' },
});
