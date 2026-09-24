/**
 * The āyah sheet's "Tajweed" section: the āyah with its letters tinted,
 * then one row per rule it contains — the colour, the name, what to do,
 * and the words it happens in. Tapping a word reads it out (the word
 * reader's own voice), which is the point: see the colour, hear the rule.
 *
 * Collapsed by default like the tafsir, and the last choice is kept for
 * the session — someone working through a page rule by rule should not
 * have to reopen it on every āyah.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { SPACING } from '../../theme/tokens';
import { hold, release } from '../audio/wordReader';
import { setQuranPrefs, useQuranState } from '../quranState';
import { riwayahById } from '../riwayat';
import { loadTajweedAyah, type TajweedAyah } from './tajweedData';
import { TajweedSwatch } from './TajweedText';
import { ayahGlyphWords, TajweedAyahGlyphs, TajweedWordGlyph } from './TajweedAyahGlyphs';

let rememberedOpen = false;

/** The page font's size in the sheet and its chips, dp. */
const AYAH_FONT_SIZE = 30;
const CHIP_FONT_SIZE = 24;

/** Read one word aloud, as a held-and-released word in the muṣḥaf is. */
export function speakWord(surah: number, ayah: number, position: number): void {
  hold({ text: '', surah, ayah, position, isEnd: false, advance: 0 });
  void release();
}

export function TajweedAyahSection({
  surah,
  ayah,
  onClose,
  toggleStyle,
  toggleLabelStyle,
}: {
  surah: number;
  ayah: number;
  /** Closes the sheet — before leaving for the guide. */
  onClose: () => void;
  toggleStyle: object;
  toggleLabelStyle: object;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { prefs } = useQuranState();
  const [open, setOpen] = useState(rememberedOpen);
  const [data, setData] = useState<TajweedAyah | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(undefined);
    void loadTajweedAyah(surah, ayah).then(res => {
      if (alive) setData(res);
    });
    return () => {
      alive = false;
    };
  }, [open, surah, ayah]);

  const toggle = () => {
    rememberedOpen = !open;
    setOpen(!open);
  };
  const coloursOn = prefs.tajweedColours;
  const hafs = riwayahById(prefs.riwayah).render !== 'unicode';
  // The page's own words, for the chips — by position, as the rules count.
  const glyphs = useMemo(() => (open ? ayahGlyphWords(surah, ayah) : []), [open, surah, ayah]);
  const glyphAt = (position: number) => glyphs.find(g => g.position === position && !g.isEnd);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('tajweed.sheetSection', 'Tajweed')}
        onPress={toggle}
        style={[toggleStyle, { borderColor: palette.border }]}>
        <Text style={[toggleLabelStyle, { color: palette.accentSolid }]}>
          {`${open ? '▾' : '▸'} ${t('tajweed.sheetSection', 'Tajweed')}`}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.block}>
          {data === undefined ? (
            <Text style={[styles.meta, { color: palette.muted }]}>
              {t('quran.loading', 'Loading…')}
            </Text>
          ) : data === null ? (
            <Text style={[styles.meta, { color: palette.muted }]}>
              {t('tajweed.sheetUnavailable', 'The rules for this ayah are not available.')}
            </Text>
          ) : (
            <>
              <TajweedAyahGlyphs
                surah={surah}
                ayah={ayah}
                fontSize={AYAH_FONT_SIZE}
                color={String(palette.text)}
                onWordPress={w => {
                  if (!w.isEnd) speakWord(surah, ayah, w.position);
                }}
              />
              {data.rules.length === 0 ? (
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {t('tajweed.sheetNone', 'Nothing in this ayah is tinted — no rule applies.')}
                </Text>
              ) : (
                data.rules.map(rule => {
                  const words = data.words.filter(w => w.spans.some(s => s.rule.id === rule.id));
                  return (
                    <View key={rule.id} style={styles.rule}>
                      <View style={styles.ruleHead}>
                        <TajweedSwatch rule={rule} />
                        <Text style={[styles.ruleName, { color: palette.text }]}>
                          {t(`tajweed.rule.${rule.id}.name`)}
                          {rule.counts ? (
                            <Text style={{ color: palette.muted, fontWeight: '400' }}>
                              {`  ·  ${t('tajweed.counts', { counts: rule.counts })}`}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                      <Text style={[styles.ruleHelp, { color: palette.muted }]}>
                        {t(`tajweed.rule.${rule.id}.help`)}
                      </Text>
                      <View style={styles.chips}>
                        {words.map(w => {
                          const glyph = glyphAt(w.position);
                          return (
                            <Pressable
                              key={w.position}
                              accessibilityRole="button"
                              accessibilityLabel={`${w.text} — ${t('tajweed.hearWord', 'Hear it')}`}
                              onPress={() => speakWord(surah, ayah, w.position)}
                              style={({ pressed }) => [
                                styles.chip,
                                { borderColor: palette.border, backgroundColor: palette.card },
                                pressed && styles.pressed,
                              ]}>
                              {glyph ? (
                                <TajweedWordGlyph
                                  word={glyph}
                                  fontSize={CHIP_FONT_SIZE}
                                  color={String(palette.text)}
                                />
                              ) : (
                                <Text style={[styles.chipText, { color: palette.text }]}>{w.text}</Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
              <View style={styles.links}>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={() => {
                    onClose();
                    navigation.navigate('QuranTajweed');
                  }}>
                  <Text style={[styles.link, { color: palette.accentSolid }]}>
                    {t('tajweed.sheetMore', 'All the colours explained')} ›
                  </Text>
                </Pressable>
                {!coloursOn && hafs ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setQuranPrefs({ tajweedColours: true })}>
                    <Text style={[styles.link, { color: palette.accentSolid }]}>
                      {t('tajweed.turnOn', 'Show the colours in the mushaf')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: SPACING.sm, gap: SPACING.sm },
  meta: { fontSize: TYPE.footnote.fontSize },
  rule: { marginTop: SPACING.xs, gap: 4 },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ruleName: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  ruleHelp: { fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  chipText: { ...arabicTextStyle('quran'), fontSize: TYPE.title3.fontSize, lineHeight: 40 },
  pressed: { opacity: 0.6 },
  links: { marginTop: SPACING.sm, gap: SPACING.sm },
  link: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
});
