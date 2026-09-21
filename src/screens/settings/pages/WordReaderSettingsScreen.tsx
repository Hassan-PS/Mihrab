/**
 * Settings → Quran → Word reader.
 *
 * The switch, and who reads the word. Only reciters with word timings are
 * offered: reading one word means knowing where it starts and stops in the
 * recording, and that is what the timings are. The recitation's own
 * reciter is not touched — someone can listen to a voice without timings
 * and still hold a word to hear it from one that has them.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { setQuranPrefs, useQuranState } from '../../../quran/quranState';
import { timedReciters, wordReaderReciterId } from '../../../quran/audio/wordReader';
import { SettingsGroup, SettingsToggleRow } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';
import { TYPE, arabicTextStyle } from '../../../theme/typography';
import { SPACING } from '../../../theme/tokens';

export function WordReaderSettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { prefs } = useQuranState();
  const chosen = wordReaderReciterId(prefs);

  return (
    <SettingsPage>
      <SettingsGroup
        footer={t('quran.wordReaderHelp', {
          defaultValue:
            'In the mushaf, hold a finger on a word and nothing happens until you lift it: then that one word is read out. While holding, slide to another word to pick it instead. A long press no longer opens the verse — a tap still does.',
        })}>
        <SettingsToggleRow
          testID="settings-word-reader"
          title={t('quran.wordReader', 'Read a word on long press')}
          value={prefs.wordReader}
          onValueChange={next => setQuranPrefs({ wordReader: next })}
        />
      </SettingsGroup>
      {prefs.wordReader ? (
        <SettingsGroup
          title={t('quran.wordReaderReciter', 'Who reads the word')}
          footer={t('quran.wordReaderReciterHelp', {
            defaultValue:
              'Only reciters with word timings can read a single word, so only they are listed. Your recitation reciter is separate and can be anyone.',
          })}>
          <View accessibilityRole="radiogroup">
            {timedReciters().map((r, i) => {
              const selected = r.id === chosen;
              return (
                <Pressable
                  key={r.id}
                  testID={`settings-word-reader-reciter-${r.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={r.name}
                  onPress={() => setQuranPrefs({ wordReaderReciterId: r.id })}
                  style={[
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
                    selected && { backgroundColor: palette.bg },
                  ]}>
                  <View style={styles.names}>
                    <Text style={[styles.name, { color: palette.text }]}>{r.name}</Text>
                    <Text style={[styles.arabic, { color: palette.muted }]}>{r.arabicName}</Text>
                  </View>
                  {selected ? (
                    <Text style={[styles.tick, { color: palette.accent }]}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </SettingsGroup>
      ) : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  names: { flex: 1, gap: 2 },
  name: { fontSize: TYPE.body.fontSize, fontWeight: '600' },
  arabic: { ...arabicTextStyle('body'), fontSize: TYPE.callout.fontSize },
  tick: { fontSize: TYPE.body.fontSize, fontWeight: '700' },
});
