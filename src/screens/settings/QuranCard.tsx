import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CompanionTextSheet,
  useCompanionChoice,
} from '../../quran/CompanionTextControls';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { setQuranPrefs, useQuranState } from '../../quran/quranState';
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsToggleRow,
} from './SettingsGroup';

/**
 * Quran preferences — the app-wide companion-text choice (v2.7.40), and
 * whether a surah has one reader or two.
 *
 * ── UNDER EACH VERSE ────────────────────────────────────────────────
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
 *
 * ── READING A SURAH ─────────────────────────────────────────────────
 *
 * The muṣḥaf is the reader. The verse-by-verse list is the other one,
 * and this is the only place it can be asked for — `QuranSurahScreen`
 * reads `settings.quranVerseByVerseEnabled` and the muṣḥaf header shows
 * the switch between them only while it is on.
 */
function QuranCardImpl() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { mode, editionLabel } = useCompanionChoice();
  const quran = useQuranState();
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
      {/* The second reader, and whether there is one. Below the companion
          choice deliberately: what sits under each ayah is a decision
          nearly everybody makes, and this is one most people never will. */}
      <SettingsGroup
        title={t('quran.readerTitle', 'Reading a surah')}
        footer={t('quran.verseByVerseHelp', {
          defaultValue:
            'Off, a surah opens as the mushaf and stays there. On, it can also be read as a list of verses with the translation under each one, and the reader’s header carries a button to move between the two.',
        })}>
        <SettingsToggleRow
          testID="settings-verse-by-verse"
          title={t('quran.verseByVerse', 'Verse-by-verse view')}
          value={settings.quranVerseByVerseEnabled}
          onValueChange={next =>
            updateSettings({ quranVerseByVerseEnabled: next })
          }
        />
      </SettingsGroup>
      {/* THE SAME PREFERENCE Tilāwah's coffee button holds, not a second
          one. Two switches over one lock is a bug waiting to be filed:
          whichever was touched last would appear to win while the other
          went on claiming the opposite. This is the place you look for
          it — the coffee button is the shortcut you reach for with the
          recitation already playing. */}
      <SettingsGroup
        title={t('quran.screenTitle', 'While you read')}
        footer={t('quran.keepAwakeHelp', {
          defaultValue:
            'Holds the screen on while a surah, the mushaf or Tilawah is open, and lets go the moment you leave — so following the verses with the recitation playing does not mean tapping the screen to keep it lit. Your phone’s own screen timeout is left alone.',
        })}>
        <SettingsToggleRow
          testID="settings-keep-awake"
          title={t('quran.keepAwake', 'Keep the screen on')}
          value={quran.prefs.keepAwake}
          onValueChange={next => setQuranPrefs({ keepAwake: next })}
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
