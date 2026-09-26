/**
 * The tajwīd colours explained: what each ink on the page asks of the
 * reader, arranged by colour so the page can be read back into rules.
 *
 * Reachable from the Qur'an tab, from Settings → Quran → Tajweed colours,
 * and from the āyah sheet's Tajweed section. It works with the colours
 * off — it is the explanation, and a switch to turn them on is at the
 * top — and every rule carries an example from the muṣḥaf that can be
 * heard here or opened on its page.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { CenteredColumn } from '../../responsive/CenteredColumn';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { findPageForAyah } from '../pages';
import { setQuranPrefs, useQuranState } from '../quranState';
import {
  rulesOfFamily,
  tajweedInk,
  type TajweedFamilyId,
  type TajweedRule,
  familiesFor,
  riwayahHasTajweed,
} from './rules';
import { speakWord } from './TajweedAyahSection';
import { TajweedSwatch } from './TajweedText';

/** The legend's one line per colour: family, and for the reds, the length. */
const LEGEND: ReadonlyArray<{ rule: TajweedRule['id']; family: TajweedFamilyId }> = [
  { rule: 'slnt', family: 'silent' },
  { rule: 'ghunnah', family: 'ghunnah' },
  { rule: 'madda_normal', family: 'madd' },
  { rule: 'madda_permissible', family: 'madd' },
  { rule: 'madda_obligatory_mottasel', family: 'madd' },
  { rule: 'madda_necessary', family: 'madd' },
  { rule: 'qalaqah', family: 'qalqalah' },
  { rule: 'tafkheem', family: 'tafkheem' },
];

export function TajweedGuideScreen() {
  const { t } = useTranslation();
  const { palette, isDark } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const systemBottom = useSystemNavigationReserve();
  const { prefs } = useQuranState();
  // Warsh has colours of its own (issue #58) and rules Ḥafṣ does not.
  const coloured = riwayahHasTajweed(prefs.riwayah);
  const warsh = prefs.riwayah === 'warsh';
  const [busy, setBusy] = useState<string | null>(null);

  const hear = useCallback(async (rule: TajweedRule) => {
    const { surah, ayah, word } = rule.example;
    setBusy(rule.id);
    try {
      speakWord(surah, ayah, word);
    } finally {
      setBusy(null);
    }
  }, []);

  const show = useCallback(
    (rule: TajweedRule) => {
      const { surah, ayah } = rule.example;
      navigation.navigate('QuranSurah', {
        surahNumber: surah,
        initialPage: findPageForAyah(surah, ayah, prefs.riwayah),
        scrollToAyah: ayah,
      });
    },
    [navigation, prefs.riwayah],
  );

  const card = { backgroundColor: palette.card, ...cardEdgeStyle(palette) };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={[styles.list, { paddingBottom: SPACING.xl + systemBottom }]}
      contentInsetAdjustmentBehavior="automatic">
      <CenteredColumn innerStyle={styles.stack} style={styles.stack}>
        <Text style={[styles.intro, { color: palette.text }]}>
          {t('tajweed.guideIntro')}
        </Text>

        {coloured ? (
          <View style={[styles.card, styles.toggleRow, card]}>
            <Text style={[styles.toggleLabel, { color: palette.text }]}>
              {t('tajweed.toggle', 'Colour the mushaf by tajweed rule')}
            </Text>
            <Switch
              testID="tajweed-guide-toggle"
              value={prefs.tajweedColours}
              onValueChange={next => setQuranPrefs({ tajweedColours: next })}
              accessibilityLabel={t('tajweed.toggle', 'Colour the mushaf by tajweed rule')}
            />
          </View>
        ) : (
          <Text style={[styles.note, { color: palette.muted }]}>
            {t('tajweed.warshNote')}
          </Text>
        )}

        {/* The legend */}
        <View style={[styles.card, card]}>
          <Text style={[styles.cardTitle, { color: palette.muted }]}>
            {t('tajweed.legend', 'The colours')}
          </Text>
          {LEGEND.map(({ rule: id, family }) => {
            const rule = rulesOfFamily(family).find(r => r.id === id)!;
            return (
              <View key={id} style={styles.legendRow}>
                <TajweedSwatch rule={rule} size={14} />
                <Text style={[styles.legendName, { color: palette.text }]}>
                  {t(`tajweed.family.${family}.name`)}
                  {rule.counts ? (
                    <Text style={{ color: palette.muted, fontWeight: '400' }}>
                      {`  ·  ${t('tajweed.counts', { counts: rule.counts })}`}
                    </Text>
                  ) : null}
                </Text>
                <Text
                  style={[
                    styles.legendSample,
                    { color: tajweedInk(rule, isDark) },
                  ]}>
                  {rule.example.text}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={[styles.note, { color: palette.muted }]}>
          {t('tajweed.guidePractice')}
        </Text>

        {familiesFor(prefs.riwayah).map(family => {
          const rules = rulesOfFamily(family, prefs.riwayah);
          const lead = rules[0];
          return (
            <View key={family} style={[styles.card, card]}>
              <View style={styles.familyHead}>
                <TajweedSwatch rule={lead} size={16} />
                <Text style={[styles.familyName, { color: palette.text }]}>
                  {t(`tajweed.family.${family}.name`)}
                </Text>
              </View>
              <Text style={[styles.familySummary, { color: palette.muted }]}>
                {t(`tajweed.family.${family}.summary`)}
              </Text>
              {rules.map((rule, i) => (
                <View
                  key={rule.id}
                  style={[
                    styles.rule,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
                  ]}>
                  <View style={styles.ruleHead}>
                    {rules.length > 1 ? <TajweedSwatch rule={rule} /> : null}
                    <Text style={[styles.ruleName, { color: palette.text }]}>
                      {t(`tajweed.rule.${rule.id}.name`)}
                      {rule.counts ? (
                        <Text style={{ color: palette.muted, fontWeight: '400' }}>
                          {`  ·  ${t('tajweed.counts', { counts: rule.counts })}`}
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                  <Text style={[styles.ruleHelp, { color: palette.text }]}>
                    {t(`tajweed.rule.${rule.id}.help`)}
                  </Text>
                  <View style={styles.exampleRow}>
                    <Text style={[styles.exampleLabel, { color: palette.muted }]}>
                      {t('tajweed.example', 'Example')}
                    </Text>
                    <Text style={[styles.exampleWord, { color: tajweedInk(rule, isDark) }]}>
                      {rule.example.text}
                    </Text>
                    <Text style={[styles.exampleRef, { color: palette.muted }]}>
                      {`${rule.example.surah}:${rule.example.ayah}`}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    {rule.id !== 'tafkheem' && !warsh ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy === rule.id}
                        onPress={() => void hear(rule)}
                        style={({ pressed }) => [
                          styles.action,
                          { borderColor: palette.border },
                          pressed && styles.pressed,
                        ]}>
                        <Text style={[styles.actionLabel, { color: palette.accentSolid }]}>
                          {`▶ ${t('tajweed.hearWord', 'Hear it')}`}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => show(rule)}
                      style={({ pressed }) => [
                        styles.action,
                        { borderColor: palette.border },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.actionLabel, { color: palette.accentSolid }]}>
                        {`${t('tajweed.showInMushaf', 'Show in mushaf')} ›`}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        <Text style={[styles.note, { color: palette.muted }]}>
          {t('tajweed.attribution')}
        </Text>
      </CenteredColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: SPACING.lg },
  stack: { gap: SPACING.md },
  intro: { fontSize: TYPE.body.fontSize, lineHeight: 24 },
  note: { fontSize: TYPE.footnote.fontSize, lineHeight: 19, paddingHorizontal: SPACING.xs },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, gap: SPACING.sm },
  cardTitle: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  toggleLabel: { flex: 1, fontSize: TYPE.body.fontSize, fontWeight: '500' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  legendName: { flex: 1, fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  legendSample: {
    ...arabicTextStyle('quran'),
    fontSize: TYPE.title3.fontSize,
    lineHeight: 40,
    writingDirection: 'rtl',
  },
  familyHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  familyName: { fontSize: TYPE.title3.fontSize, fontWeight: '700' },
  familySummary: { fontSize: TYPE.callout.fontSize, lineHeight: 21 },
  rule: { paddingTop: SPACING.md, marginTop: SPACING.xs, gap: 4 },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ruleName: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  ruleHelp: { fontSize: TYPE.callout.fontSize, lineHeight: 21 },
  exampleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 2 },
  exampleLabel: { fontSize: TYPE.footnote.fontSize },
  exampleWord: {
    ...arabicTextStyle('quran'),
    fontSize: TYPE.title2.fontSize,
    lineHeight: 44,
    writingDirection: 'rtl',
  },
  exampleRef: { fontSize: TYPE.footnote.fontSize, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  action: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  actionLabel: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
