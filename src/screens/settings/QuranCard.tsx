import { memo, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  CompanionTextSheet,
  useCompanionChoice,
} from '../../quran/CompanionTextControls';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import {
  activeKhatmah,
  khatmahDaysLeft,
  khatmahDeadline,
  khatmahUnreadPages,
  setKhatmahDeadline,
  setKhatmahDuration,
  setQuranPrefs,
  useQuranState,
} from '../../quran/quranState';
import {
  formatDeadline,
  KhatmahPacingSheet,
} from '../../quran/KhatmahPacingSheet';
import { RiwayahPicker } from '../../quran/RiwayahPicker';
import { hydrateRiwayahData, useRiwayahAvailability } from '../../quran/riwayahData';
import { NestedPageRows } from './NestedPageRows';
import {
  availableRiwayat,
  resolveRiwayah,
  riwayahById,
} from '../../quran/riwayat';
import { useSwitchRiwayah } from '../../quran/useSwitchRiwayah';
import type { RootStackParamList } from '../../navigation/types';
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
  const { t, i18n } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { mode, editionLabel } = useCompanionChoice();
  const quran = useQuranState();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [riwayahVisible, setRiwayahVisible] = useState(false);
  const [pacingVisible, setPacingVisible] = useState(false);
  /**
   * WHICH MUṢḤAF, ASKED WHERE SETTINGS ARE (issue #53 follow-on).
   *
   * The choice has only ever been reachable from the muṣḥaf's own header,
   * and only once a second tradition was already on the device — so the
   * reader who has not downloaded one has no way to find out from the app
   * that there is anything to choose. Here it is a row like any other,
   * always shown: the picker lists every tradition and sends the ones
   * that are not installed to the downloads screen, which is where they
   * are added and removed.
   *
   * The availability caches are in memory and filled by a hydrate call no
   * settings screen was making, so a riwayah installed on this device
   * would have read as absent here. Subscribed AND hydrated.
   */
  useRiwayahAvailability();
  useEffect(() => {
    void hydrateRiwayahData();
  }, []);
  const riwayah = resolveRiwayah(quran.prefs.riwayah);
  const switchRiwayah = useSwitchRiwayah();
  const onDevice = availableRiwayat().length;

  /**
   * THE KHATMAH'S PACING, ASKED WHERE SETTINGS ARE.
   *
   * The same decision as the ⋯ menu on the Quran page, and deliberately
   * the same sheet: a reader who thinks of "how long my khatmah takes" as
   * a setting looks here, and a reader who is standing in front of their
   * plan looks there. Only for a plan that is actually running — a
   * pacing row with no khatmah under it would be a setting for nothing,
   * so the group says where one comes from instead.
   */
  const plan = activeKhatmah(quran);
  const planDeadline = plan ? khatmahDeadline(plan) : null;
  const planDaysLeft = plan ? khatmahDaysLeft(plan) : 0;

  const modeLabel =
    mode === 'tafsir'
      ? t('quran.tafsir', 'Tafsir')
      : t('quran.viewToggleTranslation', 'Translation');

  return (
    <>
      {/* First, because it is a choice about the TEXT — everything below
          is about what is shown around it. */}
      <SettingsGroup
        title={t('quran.riwayahSettingsTitle', 'Reading tradition')}
        footer={t('quran.riwayahSettingsHelp', {
          defaultValue:
            'Which muṣḥaf the reader draws. Ḥafṣ is built in; Warsh, Qālūn and Shuʿbah are downloaded once and can be removed again. Your place, your bookmarks and your khatmah are kept in verses, so they follow you from one to another.',
        })}>
        <SettingsLinkRow
          testID="settings-riwayah-row"
          title={t('quran.riwayahSettingsTitle', 'Reading tradition')}
          value={t(riwayahById(riwayah).nameKey, riwayahById(riwayah).arabic)}
          onPress={() => setRiwayahVisible(true)}
        />
        <SettingsLinkRow
          testID="settings-riwayah-manage"
          title={t('quran.riwayahManage', 'Add or remove traditions')}
          value={t('quran.riwayahOnDevice', {
            defaultValue: '{{count}} on this device',
            count: onDevice,
          })}
          onPress={() => navigation.navigate('QuranDownloads')}
        />
      </SettingsGroup>
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
      {/* The word reader: its own page, because it is a switch AND a
          reciter, and the reciter list is nine rows nobody needs to
          scroll past on the way to anything else. */}
      <NestedPageRows parent="SettingsQuran" />
      <SettingsGroup
        title={t('quran.khatmahPacingSettingsTitle', 'Khatmah')}
        footer={
          plan
            ? t('quran.khatmahPacingHelp', {
                defaultValue:
                  'A khatmah is paced either by a length — the portions wait for you — or by a date, which re-cuts what is left over the days that remain. You can move between the two at any point; nothing you have read is affected.',
              })
            : t('quran.khatmahPacingNone', {
                defaultValue:
                  'Start a khatmah on the Quran page and how it is paced — a number of days, or a date to finish by — can be changed here.',
              })
        }>
        {plan ? (
          <SettingsLinkRow
            testID="settings-khatmah-pacing"
            title={t('quran.khatmahPacingTitle', 'How it is paced')}
            value={
              planDeadline
                ? t('quran.khatmahByDate', {
                    defaultValue: 'by {{date}}',
                    date: formatDeadline(planDeadline, i18n.language),
                  })
                : t('quran.khatmahDays', {
                    defaultValue: '{{count}} days',
                    count: planDaysLeft,
                  })
            }
            onPress={() => setPacingVisible(true)}
          />
        ) : null}
      </SettingsGroup>
      {/**
       * WHEN A DAY BEGINS, for the khatmah's own counting.
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
      {/* The same picker the muṣḥaf header opens, so the two entry
          points cannot drift apart — including the one-time notice that
          a reflowing muṣḥaf breaks its lines differently
          (`useSwitchRiwayah`). A tradition that is not on the device
          sends the reader to the downloads screen instead of doing
          nothing, which is what `onManage` is for. */}
      <RiwayahPicker
        visible={riwayahVisible}
        current={riwayah}
        onClose={() => setRiwayahVisible(false)}
        onPick={id => {
          setRiwayahVisible(false);
          if (id !== riwayah) switchRiwayah(id);
        }}
        onManage={() => {
          setRiwayahVisible(false);
          navigation.navigate('QuranDownloads');
        }}
      />
      <CompanionTextSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
      {/* MOUNTED ONLY WHILE IT IS OPEN, for the reason the Quran page
          mounts it that way: the sheet seeds itself from the plan in
          `useState`, which runs once when it mounts. Left mounted with
          the card it would hold the pacing the plan had when Settings
          was opened. */}
      {plan && pacingVisible ? (
        <KhatmahPacingSheet
          visible
          mode="change"
          current={planDeadline}
          currentDays={planDaysLeft}
          unreadPages={khatmahUnreadPages(plan, quran.prefs.riwayah)}
          onClose={() => setPacingVisible(false)}
          onChoose={choice => {
            setPacingVisible(false);
            if (choice.kind === 'days') setKhatmahDuration(choice.days);
            else setKhatmahDeadline(choice.deadline);
          }}
        />
      ) : null}
    </>
  );
}

export const QuranCard = memo(QuranCardImpl);
