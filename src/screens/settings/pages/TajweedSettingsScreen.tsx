/**
 * Settings → Quran → Tajweed colours.
 *
 * The switch, the way to the guide, and the offline download. The
 * colours are the QPC V4 tajwīd page fonts — a second set of page faces
 * beside the plain ones, cut in two palettes, one for a light page and
 * one for a dark — so "download all" fetches the palette the muṣḥaf is
 * currently drawn in and says so; the other arrives as it is read, or on
 * a second press after the tone is changed.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native';
import { TYPE } from '../../../theme/typography';
import { useAppPalette } from '../../../hooks/useAppPalette';
import type { RootStackParamList } from '../../../navigation/types';
import { MUSHAF_TOTAL_PAGES } from '../../../quran/mushafImages';
import { fontStoreStats, tajweedFontSet } from '../../../quran/mushafFontStore';
import { mushafTone, toneIsDark } from '../../../quran/mushafTone';
import {
  isJobRunning,
  quranDownloadState,
  startQuranDownload,
  subscribeQuranDownload,
} from '../../../quran/quranDownloadManager';
import { setQuranPrefs, useQuranState } from '../../../quran/quranState';
import { riwayahById } from '../../../quran/riwayat';
import { SettingsGroup, SettingsLinkRow, SettingsToggleRow } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';

export function TajweedSettingsScreen() {
  const { t } = useTranslation();
  const { palette, isDark } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { prefs } = useQuranState();
  const hafs = riwayahById(prefs.riwayah).render !== 'unicode';
  const nightMode = toneIsDark(mushafTone(prefs, isDark));
  const set = tajweedFontSet(nightMode);

  const [pages, setPages] = useState<number | null>(null);
  const [download, setDownload] = useState(quranDownloadState());
  const refresh = useCallback(() => {
    fontStoreStats(set)
      .then(s => setPages(s.pages))
      .catch(() => setPages(0));
  }, [set]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(
    () =>
      subscribeQuranDownload(s => {
        setDownload(s);
        // A run that just ended changed the count; a running one is read
        // off its own progress below.
        if (!s.running) refresh();
      }),
    [refresh],
  );

  const job = { kind: 'fonts', set } as const;
  const running = isJobRunning(job);
  const otherFontsRunning =
    download.running != null && !running;
  const complete = pages != null && pages >= MUSHAF_TOTAL_PAGES;
  const status = running
    ? t('quran.downloadProgress', {
        done: download.progress.done,
        total: download.progress.total,
      })
    : pages == null
      ? undefined
      : t('tajweed.downloadsRowSub', {
          defaultValue: '{{pages}} of {{total}} coloured pages',
          pages,
          total: MUSHAF_TOTAL_PAGES,
        });
  const toneName = nightMode
    ? t('tajweed.darkPages', 'dark pages')
    : t('tajweed.lightPages', 'light pages');

  return (
    <SettingsPage>
      <SettingsGroup
        footer={
          hafs
            ? t('tajweed.toggleHelp', {
                defaultValue:
                  "Letters are tinted in the King Fahd Complex's colours: grey is not sounded, green hums, red stretches, light blue bounces. Turn it on while learning; plain ink is a tap away.",
              })
            : t(
                'tajweed.warshNote',
                'The colours are drawn on the Hafs mushaf. Switch back to Hafs to see them.',
              )
        }>
        <SettingsToggleRow
          testID="settings-tajweed-colours"
          title={t('tajweed.toggle', 'Colour the mushaf by tajweed rule')}
          value={prefs.tajweedColours}
          disabled={!hafs}
          onValueChange={next => setQuranPrefs({ tajweedColours: next })}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsLinkRow
          testID="settings-tajweed-guide"
          title={t('tajweed.guideLink', 'How to read the colours')}
          onPress={() => navigation.navigate('QuranTajweed')}
        />
      </SettingsGroup>

      {hafs ? (
        <SettingsGroup
          footer={t('tajweed.downloadAllHelp', {
            defaultValue:
              'The coloured pages are their own set of page fonts, fetched as you read like the plain ones. Download them all once to read offline — the set for the tone the mushaf is in now; change the tone and download again for the other.',
          })}>
          <SettingsLinkRow
            testID="settings-tajweed-download"
            title={`${t('tajweed.downloadAll', 'Download all coloured pages')} · ${toneName}`}
            value={status}
            accessory={
              complete ? (
                <Text style={{ color: palette.accent, fontSize: TYPE.body.fontSize, fontWeight: '700' }}>
                  ✓
                </Text>
              ) : running || otherFontsRunning ? (
                <ActivityIndicator color={palette.muted} />
              ) : undefined
            }
            onPress={() => {
              if (running || complete || otherFontsRunning) return;
              startQuranDownload(job);
            }}
          />
        </SettingsGroup>
      ) : null}
    </SettingsPage>
  );
}
