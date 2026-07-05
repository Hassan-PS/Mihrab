/**
 * Playback & memorization settings sheet — QR-16/18/19/20
 * (docs/quran-reader-plan.md).
 *
 * One bottom sheet for everything recitation: reciter choice (with
 * per-surah offline download), speed, memorization repeats (each-ayah ×,
 * range ×, pause between), hide/reveal masking mode, and an explicit
 * range player for hifz drills.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { findSurah } from '../quran';
import { findReciter } from './reciters';
import { ReciterPickerSheet } from './ReciterPickerSheet';
import {
  downloadSurahAudio,
  isSurahDownloaded,
  type AudioDownloadHandle,
} from './audioStore';
import { playRange } from './playback';
import { setPlaybackRate } from './playback';
import { setQuranPrefs, useQuranState } from '../quranState';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Surah context for the range player + offline download. */
  surahNumber: number;
};

const RATES = [0.75, 1, 1.25, 1.5, 2];
const PAUSE_FACTORS = [0, 0.5, 1, 2];

export function PlaybackSettingsSheet({ visible, onClose, surahNumber }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { prefs } = useQuranState();
  const meta = findSurah(surahNumber);

  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reciterPickerVisible, setReciterPickerVisible] = useState(false);
  const [dlProgress, setDlProgress] = useState({ done: 0, total: 0 });
  const dlHandle = useRef<AudioDownloadHandle | null>(null);

  const [fromText, setFromText] = useState('1');
  const [toText, setToText] = useState(String(meta?.ayahCount ?? 1));

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void isSurahDownloaded(prefs.reciterId, surahNumber).then(yes => {
      if (!cancelled) setDownloaded(yes);
    });
    return () => {
      cancelled = true;
      dlHandle.current?.cancel();
    };
  }, [visible, prefs.reciterId, surahNumber]);

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
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
          hitSlop={8}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={[styles.stepBtn, { borderColor: palette.border }]}>
          <Text style={[styles.stepGlyph, { color: palette.accentSolid }]}>−</Text>
        </Pressable>
        <Text
          style={[
            styles.stepValue,
            { color: palette.text },
          ]}>{`${value}×`}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          hitSlop={8}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={[styles.stepBtn, { borderColor: palette.border }]}>
          <Text style={[styles.stepGlyph, { color: palette.accentSolid }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );

  const chipRow = <T extends number | string>(
    values: T[],
    selected: T,
    onSelect: (v: T) => void,
    format: (v: T) => string,
  ) => (
    <View style={styles.chips}>
      {values.map(v => {
        const isSel = v === selected;
        return (
          <Pressable
            key={String(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSel }}
            onPress={() => onSelect(v)}
            style={[
              styles.chip,
              {
                backgroundColor: isSel ? palette.accentBg : 'transparent',
                borderColor: isSel ? palette.accentSolid : palette.border,
              },
            ]}>
            <Text
              style={{
                color: isSel ? palette.accentSolid : palette.muted,
                fontWeight: '600',
                fontSize: 13,
                fontVariant: ['tabular-nums'],
              }}>
              {format(v)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        accessibilityLabel={t('common.close', 'Close')}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: palette.card }]}>
        <ScrollView bounces={false}>
          <Text style={[styles.title, { color: palette.text }]}>
            {t('quran.playbackSettings', 'Recitation')}
          </Text>

          {/* Reciter — compact row; tap opens the searchable picker. */}
          <Text style={[styles.section, { color: palette.muted }]}>
            {t('quran.reciter', 'Reciter')}
          </Text>
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
            <Text style={{ color: palette.accentSolid, fontSize: 13, fontWeight: '700' }}>
              {t('quran.changeReciter', 'Change')}
            </Text>
          </Pressable>

          {/* Offline download for this surah */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.downloadSurahAudio', {
              defaultValue: 'Download audio for {{surah}}',
              surah: meta?.romanized ?? '',
            })}
            disabled={downloaded || downloading}
            onPress={startDownload}
            style={[styles.dlRow, { borderColor: palette.border }]}>
            <Text style={{ color: downloaded ? palette.muted : palette.accentSolid, fontWeight: '600', fontSize: 13 }}>
              {downloaded
                ? t('quran.surahAudioDownloaded', 'Audio downloaded for offline use')
                : downloading
                  ? t('quran.downloadingAudio', {
                      defaultValue: 'Downloading… {{done}}/{{total}}',
                      done: dlProgress.done,
                      total: dlProgress.total,
                    })
                  : t('quran.downloadSurahAudioShort', 'Download this surah for offline listening')}
            </Text>
          </Pressable>

          {/* Speed */}
          <Text style={[styles.section, { color: palette.muted }]}>
            {t('quran.speed', 'Speed')}
          </Text>
          {chipRow(RATES, prefs.playbackRate, v => {
            setQuranPrefs({ playbackRate: v });
            void setPlaybackRate(v);
          }, v => `${v}×`)}

          {/* Memorization */}
          <Text style={[styles.section, { color: palette.muted }]}>
            {t('quran.memorization', 'Memorization')}
          </Text>
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
          <Text style={[styles.section, { color: palette.muted }]}>
            {t('quran.playRangeTitle', {
              defaultValue: 'Play a range of {{surah}}',
              surah: meta?.romanized ?? '',
            })}
          </Text>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.playRange', 'Play range')}
              onPress={() => {
                const max = meta?.ayahCount ?? 1;
                const from = Math.max(1, Math.min(max, Number(fromText) || 1));
                const to = Math.max(from, Math.min(max, Number(toText) || max));
                onClose();
                void playRange(
                  { surah: surahNumber, ayah: from },
                  { surah: surahNumber, ayah: to },
                );
              }}
              style={[styles.playRangeBtn, { backgroundColor: palette.accentSolid }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {t('quran.playRange', 'Play range')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
      <ReciterPickerSheet
        visible={reciterPickerVisible}
        onClose={() => setReciterPickerVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '85%',
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
  },
  title: { fontSize: 17, fontWeight: '700' },
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
  stepValue: { fontSize: 15, fontWeight: '700', minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
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
