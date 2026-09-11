/**
 * Recitation controls — extracted from the old PlaybackSettingsSheet
 * (v2.7.28) so ALL recitation settings live inside the unified ayah
 * action sheet: reciter choice (searchable picker), per-surah offline
 * download, speed, memorization repeats, hide/reveal masking, and the
 * explicit range player.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { findSurah } from '../quran';
import { surahName } from '../surahName';
import { findReciter } from './reciters';
import { ReciterPickerSheet } from './ReciterPickerSheet';
import {
  deleteSurahAudio,
  surahAudioStatus,
  type SurahAudioStatus,
} from './audioStore';
import {
  cancelQuranDownload,
  isJobRunning,
  quranDownloadState,
  startQuranDownload,
  subscribeQuranDownload,
  type QuranDownloadState,
} from '../quranDownloadManager';
import { playRange, setPlaybackRate } from './playback';
import { setQuranPrefs, useQuranState } from '../quranState';
import { Chip, RowAction, SectionHead, Stepper } from '../../components/controls';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

type Props = {
  /** Surah context for the range player + offline download. */
  surahNumber: number;
  /** Called right before playback starts (to dismiss the host sheet). */
  onStartPlayback?: () => void;
};

const RATES = [0.75, 1, 1.25, 1.5, 2];
const PAUSE_FACTORS = [0, 0.5, 1, 2];

export function RecitationControls({ surahNumber, onStartPlayback }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const { prefs } = useQuranState();
  const meta = findSurah(surahNumber);
  const surahLabel = meta ? surahName(meta, i18n.language) : '';

  const [reciterPickerVisible, setReciterPickerVisible] = useState(false);
  /**
   * How much of this surah is on disk — issue #30.
   *
   * A count rather than a boolean, because "partly downloaded" was the
   * state this row could not say and the state that made a downloaded
   * surah stop halfway through in aeroplane mode. Null while it is being
   * read, which is not the same as none.
   */
  const [status, setStatus] = useState<SurahAudioStatus | null>(null);
  /**
   * The download belongs to the app, not to this sheet.
   *
   * It used to live here: the handle was a ref and the cleanup cancelled
   * it, so closing the ayah sheet — or turning the phone, or tapping an
   * ayah — threw away however much of the surah had arrived, silently.
   * Nothing was in the shade either, so a download you could not see was
   * also a download you could not get back to.
   *
   * The manager runs it now (same place as the mushaf and the whole-
   * reciter download), which is what gives it the notification with the
   * progress bar and the strip across the top of the reader. This screen
   * only asks what is happening.
   */
  const [download, setDownload] = useState<QuranDownloadState>(
    quranDownloadState,
  );
  useEffect(() => subscribeQuranDownload(setDownload), []);
  const job = {
    kind: 'surah' as const,
    reciterId: prefs.reciterId,
    surah: surahNumber,
  };
  const downloading = isJobRunning(job);
  /** Something else has the pipe — one at a time, so neither is halved. */
  const busyElsewhere = download.running != null && !downloading;
  const dlProgress = download.progress;

  /**
   * Rough download size for this surah, stated before the tap.
   *
   * EveryAyah files are per-ayah MP3s at the reciter's bitrate; ~9 seconds
   * is a fair average ayah. This is deliberately an estimate — what matters
   * is whether the answer is "2 MB" or "40 MB" on a cellular connection,
   * and the row previously withheld even that.
   */
  const estimatedSize = useMemo(() => {
    const kbps = Number(/(\d+)kbps/.exec(findReciter(prefs.reciterId).folder)?.[1] ?? 128);
    const mb = ((meta?.ayahCount ?? 0) * 9 * kbps) / 8 / 1024;
    return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  }, [meta?.ayahCount, prefs.reciterId]);

  const complete = status != null && status.missing.length === 0 && status.total > 0;
  const partial = status != null && status.have > 0 && status.missing.length > 0;

  const [fromText, setFromText] = useState('1');
  const [toText, setToText] = useState(String(meta?.ayahCount ?? 1));

  const refreshStatus = useRef<() => void>(() => undefined);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void surahAudioStatus(prefs.reciterId, surahNumber).then(next => {
        if (!cancelled) setStatus(next);
      });
    };
    refreshStatus.current = read;
    read();
    return () => {
      cancelled = true;
      // Nothing is cancelled here any more. Leaving the sheet used to end
      // the download; the manager keeps it running, and this screen is
      // only one of the places it can be watched from.
    };
  }, [prefs.reciterId, surahNumber]);

  /**
   * Re-read the folder when a run ends, whichever screen it ended on.
   *
   * `download.running` going null is the moment the counts on this row
   * are wrong: a run that failed four ayahs should leave the row saying
   * four are missing, not claiming success.
   */
  useEffect(() => {
    if (download.running == null) refreshStatus.current();
  }, [download.running]);

  useEffect(() => {
    setToText(String(meta?.ayahCount ?? 1));
    setFromText('1');
  }, [surahNumber, meta?.ayahCount]);

  /**
   * Download what is missing — which on a fresh surah is all of it, and
   * on a half-listened one is the gap.
   *
   * The queue is the missing ayahs rather than the whole surah, so the
   * number on screen is the work left rather than a count to 286 that
   * skips 282 of them instantly. Whatever it ends at, the folder is
   * re-read: a run that failed four ayahs should leave the row saying
   * four are missing, not claiming success or claiming nothing happened.
   */
  const startDownload = () => {
    if (downloading || busyElsewhere) return;
    if (!status || status.missing.length === 0) return;
    const refs = status.missing.map(ayah => ({ surah: surahNumber, ayah }));
    // The manager owns it from here: it posts the progress notification,
    // carries the strip at the top of the reader, and keeps going when
    // this sheet closes.
    startQuranDownload({ ...job, refs });
  };

  const removeDownload = () => {
    if (downloading) return;
    void deleteSurahAudio(prefs.reciterId, surahNumber).then(() =>
      refreshStatus.current(),
    );
  };

  const stepper = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min = 1,
    max = 10,
  ) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: palette.text }]}>{label}</Text>
      <Stepper
        value={`${value}×`}
        onDecrement={() => onChange(Math.max(min, value - 1))}
        onIncrement={() => onChange(Math.min(max, value + 1))}
        decrementLabel={`${label} −`}
        incrementLabel={`${label} +`}
        atMin={value <= min}
        atMax={value >= max}
      />
    </View>
  );

  const chipRow = <T extends number | string>(
    values: T[],
    selected: T,
    onSelect: (v: T) => void,
    format: (v: T) => string,
  ) => (
    <View style={styles.chips}>
      {values.map(v => (
        <Chip
          key={String(v)}
          label={format(v)}
          selected={v === selected}
          onPress={() => onSelect(v)}
        />
      ))}
    </View>
  );

  return (
    <View>
      {/* Reciter — compact row; tap opens the searchable picker. */}
      <SectionHead label={t('quran.reciter', 'Reciter')} first />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('quran.chooseReciter', 'Choose reciter')}
        onPress={() => setReciterPickerVisible(true)}
        style={[styles.reciterRow, { backgroundColor: palette.accentBg }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.reciterName, { color: palette.text }]}>
            {findReciter(prefs.reciterId).name}
          </Text>
          <Text style={[styles.reciterArabic, { color: palette.muted }]}>
            {findReciter(prefs.reciterId).arabicName}
          </Text>
        </View>
        <Text
          style={{
            color: palette.accentSolid,
            fontSize: TYPE.footnote.fontSize,
            fontWeight: '700',
          }}>
          {t('quran.changeReciter', 'Change')}
        </Text>
      </Pressable>

      {/* Offline download for this surah. The size is stated up front: the
          decision to spend 12 MB of cellular data depends on the number the
          row used to withhold. */}
      <View style={styles.dlWrap}>
        <RowAction
          label={
            downloading
              ? t('quran.downloadingAudio', {
                  defaultValue: 'Downloading… {{done}}/{{total}}',
                  done: dlProgress.done,
                  total: dlProgress.total,
                })
              : busyElsewhere
                ? // One pipe, one disk, one foreground service — see
                  // quranDownloadManager. Said rather than silently
                  // ignored, because a dead button is the worse answer.
                  t(
                    'quran.listenDownloadBusy',
                    'Something else is downloading. One at a time, so neither is halved.',
                  )
                : complete
                  ? t('quran.surahAudioDownloaded', 'Audio downloaded for offline use')
                  : partial
                    ? // The state this row could not say. #30.
                      t('quran.surahAudioPartial', {
                        defaultValue:
                          '{{have}} of {{total}} ayahs · tap to download the rest',
                        have: status?.have ?? 0,
                        total: status?.total ?? 0,
                      })
                    : t('quran.downloadSurahAudioSized', {
                        defaultValue: 'Download this surah · {{size}}',
                        size: estimatedSize,
                      })
          }
          onPress={startDownload}
          disabled={complete || downloading || busyElsewhere || status == null}
          accessibilityLabel={t('quran.downloadSurahAudio', {
            defaultValue: 'Download audio for {{surah}}',
            surah: surahLabel,
          })}
        />
        {/* Stopping it is a thing a person does, and until the manager
            owned this download there was nowhere to do it: closing the
            sheet was the cancel, and it was not announced as one. */}
        {downloading ? (
          <RowAction
            label={t('common.cancel', 'Cancel')}
            onPress={() => cancelQuranDownload()}
            accessibilityLabel={t('common.cancel', 'Cancel')}
          />
        ) : null}
        {/* Clearable per surah, not only per reciter — #30 asked for it,
            and a reader who has finished with al-Baqarah should not have
            to delete a whole reciter to get 40 MB back. */}
        {!downloading && (status?.have ?? 0) > 0 ? (
          <RowAction
            label={t('quran.deleteSurahAudio', 'Delete this surah’s audio')}
            onPress={removeDownload}
            accessibilityLabel={t('quran.deleteSurahAudioFor', {
              defaultValue: 'Delete downloaded audio for {{surah}}',
              surah: surahLabel,
            })}
          />
        ) : null}
      </View>

      {/* Speed */}
      <SectionHead label={t('quran.speed', 'Speed')} />
      {chipRow(RATES, prefs.playbackRate, v => {
        setQuranPrefs({ playbackRate: v });
        void setPlaybackRate(v);
      }, v => `${v}×`)}

      {/* Memorization */}
      <SectionHead label={t('quran.memorization', 'Memorization')} />
      {stepper(
        t('quran.repeatEachAyah', 'Repeat each ayah'),
        prefs.repeat.eachAyah,
        v => setQuranPrefs({ repeat: { ...prefs.repeat, eachAyah: v } }),
      )}
      {stepper(
        t('quran.repeatRange', 'Repeat the range'),
        prefs.repeat.range,
        v => setQuranPrefs({ repeat: { ...prefs.repeat, range: v } }),
      )}
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: palette.text }]}>
          {t('quran.pauseBetween', 'Pause between repeats')}
        </Text>
      </View>
      {chipRow(PAUSE_FACTORS, prefs.repeat.pauseFactor, v =>
        setQuranPrefs({ repeat: { ...prefs.repeat, pauseFactor: v } }),
        v => (v === 0 ? t('quran.none', 'None') : `${v}×`),
      )}

      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: palette.text }]}>
          {t('quran.hideForReview', 'Hide while reviewing')}
        </Text>
      </View>
      {chipRow(
        ['none', 'arabic', 'translation'] as const,
        prefs.hideMode,
        v => setQuranPrefs({ hideMode: v }),
        v =>
          v === 'none'
            ? t('quran.none', 'None')
            : v === 'arabic'
              ? t('quran.hideArabic', 'Arabic')
              : t('quran.hideTranslation', 'Translation'),
      )}

      {/* Range player */}
      <SectionHead
        label={t('quran.playRangeTitle', {
          defaultValue: 'Play a range of {{surah}}',
          surah: surahLabel,
        })}
      />
      <View style={styles.rangeRow}>
        <TextInput
          value={fromText}
          onChangeText={setFromText}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel={t('quran.fromAyah', 'From ayah')}
          style={[styles.rangeInput, { color: palette.text, borderColor: palette.border }]}
        />
        <Text style={{ color: palette.muted }}>–</Text>
        <TextInput
          value={toText}
          onChangeText={setToText}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel={t('quran.toAyah', 'To ayah')}
          style={[styles.rangeInput, { color: palette.text, borderColor: palette.border }]}
        />
        <View style={styles.playRangeWrap}>
          <RowAction
            label={t('quran.playRange', 'Play range')}
            emphasized
            glyph="▶"
            onPress={() => {
              const max = meta?.ayahCount ?? 1;
              const from = Math.max(1, Math.min(max, Number(fromText) || 1));
              const to = Math.max(from, Math.min(max, Number(toText) || max));
              onStartPlayback?.();
              void playRange(
                { surah: surahNumber, ayah: from },
                { surah: surahNumber, ayah: to },
              );
            }}
          />
        </View>
      </View>

      <ReciterPickerSheet
        visible={reciterPickerVisible}
        onClose={() => setReciterPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  reciterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  reciterName: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  reciterArabic: { fontSize: TYPE.label.fontSize, marginTop: 1 },
  dlRow: {
    marginTop: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  rowLabel: { fontSize: TYPE.callout.fontSize, fontWeight: '600', flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: TYPE.title3.fontSize, fontWeight: '700' },
  stepValue: {
    fontSize: TYPE.callout.fontSize,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  dlWrap: { marginTop: SPACING.sm },
  playRangeWrap: { marginStart: 'auto' },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  rangeInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPE.callout.fontSize,
    minWidth: 56,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  playRangeBtn: {
    marginStart: 'auto',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
});
