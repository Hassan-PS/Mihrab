// hover-ok: settings-row pressables — pressed feedback is the right affordance.
import { memo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { CompanionTextControls } from '../../quran/CompanionTextControls';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Quran preferences card — the app-wide companion-text choice (v2.7.40).
 *
 * One control for what renders beneath each ayah everywhere: the mode
 * (translation ⇄ tafsir) and the edition for that mode. Backed by the same
 * persisted stores as the pickers on the Quran page and in the reader
 * (`quranState.prefs.companionMode` / `tafsirEditionId`,
 * `settings.quranTranslationEdition`), so every entry point stays in sync.
 */
function QuranCardImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('quran.companionTitle', 'Under each verse')}
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <Text style={[s.help, { color: palette.muted, marginBottom: 8 }]}>
          {t('quran.companionHelp', {
            defaultValue:
              'Applies everywhere a verse is shown — the reader, the verse of the day, and the daily-ayah notification. Also changeable from the Quran page.',
          })}
        </Text>
        <CompanionTextControls />
      </View>
    </>
  );
}

export const QuranCard = memo(QuranCardImpl);
