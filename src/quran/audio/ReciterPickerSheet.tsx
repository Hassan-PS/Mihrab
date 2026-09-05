/**
 * Reciter picker — v2.7.27.
 *
 * With 42 reciters the old inline radio list stopped scaling, so
 * switching now lives in its own searchable bottom sheet: type-ahead
 * filter (Latin or Arabic), the active reciter pinned visually via
 * check + accent, and a small "word highlight" badge on reciters with
 * quran-align timing data. Opened from the playback settings sheet and
 * directly from the mini player, so switching is one tap from anywhere
 * recitation is visible.
 *
 * ── AND IT IS WHERE THE DOWNLOADS LIVE ────────────────────────────────
 *
 * Tilāwah used to carry a card under the transport — "Keep Abu Bakr
 * Ash-Shatri on this device", a size, a button — which described ONE
 * reciter: the selected one. So the answer to "which voices do I have
 * offline?" was to select each of forty-two in turn and read the card,
 * and a card that big for a question that narrow sat between the player
 * and the surah list on every visit, downloaded or not.
 *
 * The question belongs on the list of reciters, where it can be answered
 * for all of them at once. A row that has audio says how much and offers
 * to delete it; a row that does not offers to fetch it. The card is gone.
 *
 * Deleting is TWO TAPS, in place — a gigabyte is too much to lose to a
 * mis-tap, and a confirmation dialog inside a modal sheet is a stack of
 * two modals, which Android does not reliably draw.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { setQuranPrefs, useQuranState } from '../quranState';
import { searchReciters, type Reciter } from './reciters';
import { MODAL_ORIENTATIONS } from '../../components/modalOrientations';
import {
  deleteReciterAudio,
  downloadedReciters,
  estimatedReciterBytes,
  totalAyahCount,
  type ReciterAudioStats,
} from './audioStore';
import {
  cancelQuranDownload,
  isJobRunning,
  quranDownloadState,
  startQuranDownload,
  subscribeQuranDownload,
  type QuranDownloadState,
} from '../quranDownloadManager';

/** "1.2 GB", "812 MB" — the same shape the downloads screen prints. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/**
 * A trash can, drawn.
 *
 * The wastebasket emoji is a colour glyph on Android: it ignores the
 * colour it is given and lands beside a green ↓ and a grey ✕ as the only
 * blue thing on the sheet, which reads as a sticker rather than as a
 * control. Three borders and a bar cost nothing and take the danger
 * colour like every other destructive control in the app.
 */
function TrashGlyph({ color }: { color: string }) {
  return (
    <View style={styles.trash} accessible={false}>
      <View style={[styles.trashHandle, { borderColor: color }]} />
      <View style={[styles.trashLid, { backgroundColor: color }]} />
      <View style={[styles.trashBody, { borderColor: color }]} />
    </View>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ReciterPickerSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { prefs } = useQuranState();
  const [query, setQuery] = useState('');
  const [onDisk, setOnDisk] = useState<Record<string, ReciterAudioStats>>({});
  const [download, setDownload] = useState<QuranDownloadState>(
    quranDownloadState,
  );
  /** The row whose delete has been asked for but not yet confirmed. */
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => subscribeQuranDownload(setDownload), []);

  const refresh = useCallback(() => {
    let alive = true;
    void downloadedReciters().then(map => {
      if (alive) setOnDisk(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  // On open, and again whenever a download stops running — the moment it
  // ends is the moment the sizes on screen are wrong.
  useEffect(() => {
    if (!visible) {
      setConfirming(null);
      return undefined;
    }
    return refresh();
  }, [visible, refresh, download.running]);

  // Transliteration-tolerant (v2.8.4): "alajami", "Al-Ajmi" and "ajmy" all
  // reach أحمد العجمي. The old exact-substring filter returned nothing for
  // any spelling but the one stored, which reads as "that reciter isn't in
  // the app" — see `searchReciters`.
  const data = useMemo(() => searchReciters(query), [query]);

  const renderRow = ({ item }: { item: Reciter }) => {
    const selected = item.id === prefs.reciterId;
    const job = { kind: 'audio' as const, reciterId: item.id };
    const running = isJobRunning(job);
    const busyElsewhere = download.running != null && !running;
    const stats = onDisk[item.id];
    const asking = confirming === item.id;

    /** What this row says about its own audio, under the Arabic name. */
    const offline = running
      ? t('quran.listenDownloadRunning', {
          defaultValue: 'Downloading · {{done}} of {{total}}',
          done: download.progress.done,
          total: download.progress.total,
        })
      : stats?.complete
        ? t('quran.listenDownloadComplete', {
            defaultValue: 'Complete · {{size}}',
            size: formatBytes(stats.bytes),
          })
        : stats
          ? t('quran.listenDownloadPartial', {
              defaultValue: '{{done}} of {{total}} ayahs here · {{size}}',
              done: stats.files,
              total: totalAyahCount(),
              size: formatBytes(stats.bytes),
            })
          : null;

    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => {
          setQuranPrefs({ reciterId: item.id });
          onClose();
        }}
        style={[
          styles.row,
          { backgroundColor: selected ? palette.accentBg : 'transparent' },
        ]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: palette.text }]}>
            {item.name}
          </Text>
          <View style={styles.subRow}>
            <Text style={[styles.arabic, { color: palette.muted }]}>
              {item.arabicName}
            </Text>
            {item.hasTimings ? (
              <View style={[styles.badge, { borderColor: palette.border }]}>
                <Text style={[styles.badgeText, { color: palette.muted }]}>
                  {t('quran.wordHighlightBadge', 'word highlight')}
                </Text>
              </View>
            ) : null}
          </View>
          {offline ? (
            <Text style={[styles.offline, { color: palette.muted }]}>
              {offline}
            </Text>
          ) : null}
        </View>
        {selected ? (
          <Text style={{ color: palette.accentSolid, fontSize: 17 }}>✓</Text>
        ) : null}
        {/* The audio control. One row, one verb: fetch it, stop fetching
            it, or delete it — never two of the three at once. */}
        {running ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            hitSlop={8}
            onPress={() => cancelQuranDownload()}
            style={[styles.iconBtn, { borderColor: palette.border }]}>
            <Text style={[styles.icon, { color: palette.text }]}>✕</Text>
          </Pressable>
        ) : stats ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              asking
                ? t('common.confirmDelete', 'Tap again to delete')
                : t('quran.listenDeleteAudio', {
                    defaultValue: 'Delete {{name}} from this device',
                    name: item.name,
                  })
            }
            hitSlop={8}
            onPress={() => {
              if (!asking) {
                setConfirming(item.id);
                return;
              }
              setConfirming(null);
              void deleteReciterAudio(item.id).then(refresh);
            }}
            style={[
              styles.iconBtn,
              {
                borderColor: asking ? palette.danger : palette.border,
                backgroundColor: asking ? palette.danger : 'transparent',
              },
            ]}>
            {asking ? (
              <Text style={[styles.confirmText, styles.confirmOnDanger]}>
                {t('common.delete', { defaultValue: 'Delete' })}
              </Text>
            ) : (
              <TrashGlyph color={String(palette.danger)} />
            )}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.listenDownloadReciter', {
              defaultValue: 'Download {{name}}, about {{size}}',
              name: item.name,
              size: formatBytes(estimatedReciterBytes(item.id)),
            })}
            disabled={busyElsewhere}
            hitSlop={8}
            onPress={() => startQuranDownload(job)}
            style={[
              styles.iconBtn,
              { borderColor: busyElsewhere ? 'transparent' : palette.border },
            ]}>
            <Text
              style={[
                styles.icon,
                { color: busyElsewhere ? palette.muted : palette.accentSolid },
              ]}>
              ↓
            </Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      // Landscape too, or the muṣḥaf on its side cannot open this
      // at all — see MODAL_ORIENTATIONS.
      supportedOrientations={MODAL_ORIENTATIONS}
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        accessibilityLabel={t('common.close', 'Close')}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: palette.card }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('quran.chooseReciter', 'Choose reciter')}
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('quran.searchReciters', 'Search reciters…')}
          placeholderTextColor={String(palette.muted)}
          accessibilityLabel={t('quran.searchReciters', 'Search reciters…')}
          clearButtonMode="while-editing"
          style={[
            styles.search,
            {
              color: palette.text,
              backgroundColor: palette.bg,
              borderColor: palette.border,
            },
          ]}
        />
        <FlatList
          data={data}
          keyExtractor={r => r.id}
          renderItem={renderRow}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
        />
      </View>
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
    height: '75%',
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  search: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    marginBottom: 8,
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
    marginVertical: 1,
  },
  name: { fontSize: 15, fontWeight: '600' },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  arabic: { fontSize: 12 },
  offline: { fontSize: 11, marginTop: 3 },
  iconBtn: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 15, fontWeight: '700' },
  confirmText: { fontSize: 12, fontWeight: '700' },
  confirmOnDanger: { color: '#fff' },
  // The trash: a handle, a lid, and a tapered body. 16×16 all told, which
  // is the optical weight of the ↓ and the ✕ it stands beside.
  trash: { width: 16, alignItems: 'center' },
  trashHandle: {
    width: 7,
    height: 3,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopStartRadius: 1.5,
    borderTopEndRadius: 1.5,
  },
  trashLid: { width: 15, height: 1.6, borderRadius: 1, marginTop: 1 },
  trashBody: {
    width: 11,
    height: 10,
    marginTop: 1.5,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomStartRadius: 2.5,
    borderBottomEndRadius: 2.5,
  },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
