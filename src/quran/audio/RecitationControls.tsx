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
  downloadSurahAudio,
  isSurahDownloaded,
  type AudioDownloadHandle,
} from './audioStore';
import { playRange, setPlaybackRate } from './playback';
import { setQuranPrefs, useQuranState } from '../quranState';
import { Chip, RowAction, SectionHead, Stepper } from '../../components/controls';

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
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState({ done: 0, total: 0 });
  const dlHandle = useRef<AudioDownloadHandle | null>(null);

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

  const [fromText, setFromText] = useState('1');
  const [toText, setToText] = useState(String(meta?.ayahCount ?? 1));

  useEffect(() => {
    let cancelled = false;
    void isSurahDownloaded(prefs.reciterId, surahNumber).then(yes => {
      if (!cancelled) setDownloaded(yes);
    });
    return () => {
      cancelled = true;
      dlHandle.current?.cancel();
    };
  }, [prefs.reciterId, surahNumber]);

  useEffect(() => {
    setToText(String(meta?.ayahCount ?? 1));
    setFromText('1');
  }, [surahNumber, meta?.ayahCount]);

  const startDownload = () => {
    if (downloading) return;
    setDownloading(true);
    const handle = downloadSurahAudio(prefs.reciterId, surahNumber, p =>
      setDlProgress({ done: p.done, total: p.total }),
    );
    dlHandle.current = handle;
    void handle.promise.then(ok => {
      dlHandle.current = null;
      setDownloading(false);
      setDownloaded(ok);
    });
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
            fontSize: 13,
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
            downloaded
              ? t('quran.surahAudioDownloaded', 'Audio downloaded for offline use')
              : downloading
                ? t('quran.downloadingAudio', {
                    defaultValue: 'Downloading… {{done}}/{{total}}',
                    done: dlProgress.done,
                    total: dlProgress.total,
                  })
                : t('quran.downloadSurahAudioSized', {
                    defaultValue: 'Download this surah · {{size}}',
                    size: estimatedSize,
                  })
          }
          onPress={startDownload}
          disabled={downloaded || downloading}
          accessibilityLabel={t('quran.downloadSurahAudio', {
            defaultValue: 'Download audio for {{surah}}',
            surah: surahLabel,
          })}
        />
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
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  reciterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
  },
  reciterName: { fontSize: 15, fontWeight: '600' },
  reciterArabic: { fontSize: 12, marginTop: 1 },
  dlRow: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  rowLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 18, fontWeight: '700' },
  stepValue: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  dlWrap: { marginTop: 8 },
  playRangeWrap: { marginStart: 'auto' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  rangeInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 15,
    minWidth: 56,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  playRangeBtn: {
    marginStart: 'auto',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
});
