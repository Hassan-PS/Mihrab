import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CompanionTextSheet,
  useCompanionChoice,
} from '../../quran/CompanionTextControls';
import { SettingsGroup, SettingsLinkRow } from './SettingsGroup';

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
  const { mode, editionLabel } = useCompanionChoice();
  const [sheetVisible, setSheetVisible] = useState(false);

  const modeLabel =
    mode === 'tafsir'
      ? t('quran.tafsir', 'Tafsir')
      : t('quran.viewToggleTranslation', 'Translation');

  return (
    <>
      <SettingsGroup
        title={t('quran.companionTitle', 'Under each verse')}
        footer={t('quran.companionHelp', {
          defaultValue:
            'Applies everywhere a verse is shown — the reader, the verse of the day, and the daily-ayah notification. Also changeable from the Quran page.',
        })}>
        <SettingsLinkRow
          testID="settings-companion-row"
          title={modeLabel}
          value={editionLabel}
          onPress={() => setSheetVisible(true)}
        />
      </SettingsGroup>
      <CompanionTextSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </>
  );
}

export const QuranCard = memo(QuranCardImpl);
