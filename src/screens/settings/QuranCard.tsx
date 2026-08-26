// hover-ok: settings-row pressables — pressed feedback is the right affordance.
import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  CompanionTextSheet,
  useCompanionChoice,
} from '../../quran/CompanionTextControls';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Quran preferences card — the app-wide companion-text choice (v2.7.40).
 *
 * One control for what renders beneath each ayah everywhere: the mode
 * (translation ⇄ tafsir) and the edition for that mode. Backed by the same
 * persisted stores as the pickers on the Quran page and in the reader
 * (`quranState.prefs.companionMode` / `tafsirEditionId`,
 * `settings.quranTranslationEdition`), so every entry point stays in sync.
 *
 * Shown as a one-line summary row that opens the same bottom sheet the
 * Quran page uses (task #97). It used to render the whole picker inline —
 * both mode segments plus every translation AND tafsir edition, grouped by
 * language — which was several screens of scrolling in the middle of
 * Settings for a choice most people make once.
 */
function QuranCardImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { mode, editionLabel } = useCompanionChoice();
  const [sheetVisible, setSheetVisible] = useState(false);

  const modeLabel =
    mode === 'tafsir'
      ? t('quran.tafsir', 'Tafsir')
      : t('quran.viewToggleTranslation', 'Translation');

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('quran.companionTitle', 'Under each verse')}
      </Text>
      <Pressable
        testID="settings-companion-row"
        accessibilityRole="button"
        accessibilityLabel={t('quran.companionTitle', 'Under each verse')}
        accessibilityValue={{ text: `${modeLabel} — ${editionLabel}` }}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={() => setSheetVisible(true)}>
        <View style={s.copyBlock}>
          <Text style={[s.label, { color: palette.muted }]}>{modeLabel}</Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {editionLabel}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('quran.companionHelp', {
              defaultValue:
                'Applies everywhere a verse is shown — the reader, the verse of the day, and the daily-ayah notification. Also changeable from the Quran page.',
            })}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>
          {t('common.change')}
        </Text>
      </Pressable>
      <CompanionTextSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </>
  );
}

export const QuranCard = memo(QuranCardImpl);
