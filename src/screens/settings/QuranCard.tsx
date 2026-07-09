// hover-ok: settings-row pressables — pressed feedback is the right affordance.
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  useQuranState,
  setQuranPrefs,
} from '../../quran/quranState';
import {
  tafsirEditionsForLocale,
  resolveTafsirEdition,
} from '../../quran/tafsir';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Quran preferences card (v2.8) — currently the tafsir edition selector.
 *
 * Reads and writes the SAME persisted `quranState` pref (`tafsirEditionId`)
 * that the Quran page's ayah sheet uses, so the two stay in sync: change it
 * here and the reader reflects it, change it in the reader and this row
 * updates. The previous behaviour kept the choice in ephemeral component
 * state, so it reverted to the default on every reopen.
 */
function QuranCardImpl() {
  const { t } = useTranslation();
  const { slice: settings } = useAppearanceSettings();
  const { palette } = useAppPalette();
  const state = useQuranState();

  const editions = tafsirEditionsForLocale(settings.language);
  const active = resolveTafsirEdition(state.prefs.tafsirEditionId, settings.language);

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('quran.tafsir')}
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <Text style={[s.help, { color: palette.muted, marginBottom: 6 }]}>
          {t('quran.tafsirEditionHelp', {
            defaultValue:
              'The commentary shown under each verse. Also changeable from any verse on the Quran page.',
          })}
        </Text>
        {editions.map((ed, i) => {
          const selected = ed.id === active.id;
          return (
            <Pressable
              key={ed.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={ed.label}
              onPress={() => setQuranPrefs({ tafsirEditionId: ed.id })}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
              ]}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: palette.text },
                  ed.rtl && styles.rtl,
                  selected && { fontWeight: '700' },
                ]}>
                {ed.label}
              </Text>
              {selected ? (
                <Text style={[styles.check, { color: palette.accent }]}>✓</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

export const QuranCard = memo(QuranCardImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 16, flex: 1, paddingEnd: 12 },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  check: { fontSize: 18, fontWeight: '700' },
});
