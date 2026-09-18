import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CompanionTextSheet,
  useCompanionChoice,
} from '../../quran/CompanionTextControls';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { setQuranPrefs, useQuranState } from '../../quran/quranState';
import { SegmentedControl } from '../../components/ui';
import {
  SettingsBlock,
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
      {/**
       * WHEN A DAY BEGINS, for the khatmah's own counting — issue #58.
       *
       * The Islamic day begins at sunset: tarawih belongs to the day that
       * has just started, and a sitting that runs past midnight is one
       * night's reading rather than two days'. Opt-in, because it moves a
       * boundary people have a habit around — and the first evening after
       * switching it on shows today's reading starting over, since the
       * stored snapshot was taken under the other rule.
       *
       * Here rather than with the prayer times because what it changes is
       * what gets COUNTED in a day. The prayer table is deliberately not
       * affected: it turns after the last time of the day, as it always
       * has. See `hijri/islamicDay`.
       */}
      <SettingsGroup
        title={t('quran.dayStartTitle', 'Counting a day')}
        footer={t('quran.dayStartHelp', {
          defaultValue:
            'The Islamic day begins at sunset, so an evening of reading counts towards the day that has just begun and a session that runs past midnight stays one day. Off, days are counted from midnight. This changes the khatmah’s daily portion only — the prayer table still turns after the last time of the day.',
        })}>
        <SettingsToggleRow
          testID="settings-islamic-day"
          title={t('quran.dayStartFromMaghrib', 'Start the day at sunset')}
          value={settings.islamicDayFromMaghrib}
          onValueChange={next =>
            updateSettings({ islamicDayFromMaghrib: next })
          }
        />
      </SettingsGroup>
      {/**
       * WHAT A NEW BOOKMARK DOES.
       *
       * A star already says "this ayah matters to me", so a bookmark is a
       * PLACE — and a place that keeps itself is what a place is for,
       * which is why following is the default for a new install. This
       * decides only how a new one STARTS: the switch on each bookmark's
       * own row still overrides it, for that bookmark, forever.
       *
       * "Ask each time" is offered and not imposed. It does not open a
       * dialog on the way to a bookmark — the ayah sheet shows the choice
       * as a line under the colours, emphasised, and answering it is the
       * tap it was already going to take.
       */}
      <SettingsGroup
        title={t('quran.newBookmarksTitle', 'New bookmarks')}
        footer={t('quran.newBookmarksHelp', {
          defaultValue:
            'A bookmark that follows moves along as you read, so it is where you stopped; a fixed one stays on the ayah you put it on. This sets what a new bookmark starts as — each bookmark keeps its own switch in the Bookmarks list.',
        })}>
        <SettingsBlock>
          <SegmentedControl
            accessibilityLabel={t('quran.newBookmarksTitle', 'New bookmarks')}
            segments={[
              {
                key: 'follow',
                label: t('quran.newBookmarksFollow', 'Follow'),
              },
              { key: 'fixed', label: t('quran.newBookmarksFixed', 'Stay put') },
              { key: 'ask', label: t('quran.newBookmarksAsk', 'Ask') },
            ]}
            value={quran.prefs.bookmarkFollowDefault}
            onChange={bookmarkFollowDefault =>
              setQuranPrefs({ bookmarkFollowDefault })
            }
          />
        </SettingsBlock>
      </SettingsGroup>
      {/* READING's own preference, not Tilāwah's coffee cup (#52). They
          shared one flag, which is a bug in the other direction: a cup
          switched off for an evening of listening left the muṣḥaf going
          dark days later, and nothing on the reader's side had said so.
          They hold the same counted lock; what differs is who asked. */}
      <SettingsGroup
        title={t('quran.screenTitle', 'While you read')}
        footer={t('quran.keepAwakeHelp', {
          defaultValue:
            'Holds the screen on while a surah or the mushaf is open, and lets go the moment you leave — so reading does not mean tapping the screen to keep it lit. Tilawah has its own coffee button for listening, and your phone’s own screen timeout is left alone.',
        })}>
        <SettingsToggleRow
          testID="settings-keep-awake"
          title={t('quran.keepAwake', 'Keep the screen on')}
          value={quran.prefs.readerKeepAwake}
          onValueChange={next => setQuranPrefs({ readerKeepAwake: next })}
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
