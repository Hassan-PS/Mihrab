/**
 * Settings → Quran → Tajweed colours.
 *
 * The switch, the way to the guide, and the offline download. The
 * colours are the QPC V4 tajwīd page fonts — a second set of page faces
 * beside the plain ones, cut in two palettes, one for a light page and
 * one for a dark — so the offline download is one row per palette, each
 * with its own count, the one the muṣḥaf is drawn in now listed first.
 * Either set also arrives page by page as it is read.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
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

type TajweedSet = 'tajweed-light' | 'tajweed-dark';
const SETS: readonly TajweedSet[] = ['tajweed-light', 'tajweed-dark'];

export function TajweedSettingsScreen() {
  const { t } = useTranslation();
  const { palette, isDark } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { prefs } = useQuranState();
  const hafs = riwayahById(prefs.riwayah).render !== 'unicode';
  // The set the muṣḥaf draws right now, listed first and marked.
  const inUse = tajweedFontSet(toneIsDark(mushafTone(prefs, isDark)));

  const [pages, setPages] = useState<Record<TajweedSet, number | null>>({
    'tajweed-light': null,
    'tajweed-dark': null,
  });
  const [download, setDownload] = useState(quranDownloadState());
  const refresh = useCallback(() => {
    for (const set of SETS) {
      fontStoreStats(set)
        .then(s => setPages(prev => ({ ...prev, [set]: s.pages })))
        .catch(() => setPages(prev => ({ ...prev, [set]: 0 })));
    }
  }, []);
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

  const ordered = inUse === 'tajweed-dark' ? [...SETS].reverse() : SETS;

  /**
   * One row per palette. The fonts cannot switch palette at draw time, so
   * a light page and a night page are two sets of files — and someone who
   * reads on paper by day and at night in the dark needs both offline.
   */
  const row = (set: TajweedSet) => {
    const job = { kind: 'fonts', set } as const;
    const running = isJobRunning(job);
    const busyElsewhere = download.running != null && !running;
    const have = pages[set];
    const complete = have != null && have >= MUSHAF_TOTAL_PAGES;
    const dark = set === 'tajweed-dark';
    const tone = dark
      ? t('tajweed.darkRowTone', 'Night')
      : t('tajweed.lightRowTone', 'Paper and sepia');
    const status = running
      ? t('quran.downloadProgress', {
          done: download.progress.done,
          total: download.progress.total,
        })
      : busyElsewhere && !complete
        ? t('tajweed.waiting', 'After the download that is running')
        : have == null
          ? tone
          : t('tajweed.rowStatus', {
              defaultValue: '{{tone}} · {{pages}} of {{total}} pages',
              tone,
              pages: have,
              total: MUSHAF_TOTAL_PAGES,
            });
    const title = dark
      ? t('tajweed.darkRow', 'Dark pages')
      : t('tajweed.lightRow', 'Light pages');
    return (
      <SettingsLinkRow
        key={set}
        testID={`settings-tajweed-download-${dark ? 'dark' : 'light'}`}
        title={set === inUse ? `${title} · ${t('tajweed.inUse', 'in use')}` : title}
        value={status}
        accessory={
          complete ? (
            <Text style={[styles.tick, { color: palette.accent }]}>✓</Text>
          ) : running ? (
            <ActivityIndicator color={palette.muted} />
          ) : busyElsewhere ? (
            <Text style={[styles.tick, { color: palette.muted }]}>…</Text>
          ) : (
            <Text style={[styles.tick, { color: palette.accentSolid }]}>↓</Text>
          )
        }
        onPress={() => {
          if (running || complete || busyElsewhere) return;
          startQuranDownload(job);
        }}
      />
    );
  };

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
          title={t('tajweed.offlineTitle', 'For reading offline')}
          footer={t('tajweed.downloadAllHelp', {
            defaultValue:
              'The coloured pages are page fonts of their own, fetched as you read like the plain ones. A font carries one palette, so light pages (paper and sepia) and dark pages (night) are two sets of about 170 MB each: download the ones you read in.',
          })}>
          {ordered.map(row)}
        </SettingsGroup>
      ) : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  tick: { fontSize: TYPE.body.fontSize, fontWeight: '700' },
});
