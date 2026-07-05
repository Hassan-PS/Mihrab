/**
 * Manage downloads — v2.7.28.
 *
 * One place to see and reclaim the disk the Quran reader uses:
 * the mushaf page store, per-reciter recitation audio, and the tafsir
 * cache. Reachable from Settings (Data & privacy) and the Quran screen.
 * Everything here is re-downloadable, so deletes are safe.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { cardEdgeStyle } from '../theme/chrome';
import {
  clearMushafDownloadFlag,
  deleteMushaf,
  mushafDiskUsage,
} from '../quran/mushafDownload';
import { deleteReciterAudio } from '../quran/audio/audioStore';
import { findReciter } from '../quran/audio/reciters';
import { deleteTafsirCache, tafsirDiskUsage } from '../quran/tafsir';

type ReciterUsage = { reciterId: string; bytes: number };

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function QuranDownloadsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  const [mushafBytes, setMushafBytes] = useState(0);
  const [tafsirBytes, setTafsirBytes] = useState(0);
  const [audio, setAudio] = useState<ReciterUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [mushaf, tafsir] = await Promise.all([
        mushafDiskUsage(),
        tafsirDiskUsage(),
      ]);
      setMushafBytes(mushaf);
      setTafsirBytes(tafsir);
      const base = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/audio`;
      const out: ReciterUsage[] = [];
      if (await ReactNativeBlobUtil.fs.exists(base)) {
        const dirs = await ReactNativeBlobUtil.fs.ls(base);
        for (const dir of dirs) {
          const files = await ReactNativeBlobUtil.fs
            .lstat(`${base}/${dir}`)
            .catch(() => []);
          let sum = 0;
          for (const f of files) sum += Number(f.size) || 0;
          if (sum > 0) out.push({ reciterId: dir, bytes: sum });
        }
      }
      out.sort((a, b) => b.bytes - a.bytes);
      setAudio(out);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirmDelete = (label: string, action: () => Promise<void>) => {
    Alert.alert(
      t('downloads.deleteTitle', 'Delete download?'),
      t('downloads.deleteBody', {
        defaultValue:
          '{{what}} will be removed from this device. You can download it again at any time.',
        what: label,
      }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            void action().then(refresh);
          },
        },
      ],
    );
  };

  const row = (
    key: string,
    title: string,
    sub: string,
    bytes: number,
    onDelete: () => void,
  ) => (
    <View
      key={key}
      style={[
        styles.row,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
      ]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: palette.muted }]}>{sub}</Text>
      </View>
      <Text style={[styles.rowBytes, { color: palette.muted }]}>
        {formatBytes(bytes)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.delete', 'Delete')}
        hitSlop={8}
        onPress={onDelete}
        style={[styles.deleteBtn, { borderColor: palette.border }]}>
        <Text style={{ color: '#d43f3f', fontWeight: '700', fontSize: 12 }}>
          {t('common.delete', 'Delete')}
        </Text>
      </Pressable>
    </View>
  );

  const total =
    mushafBytes + tafsirBytes + audio.reduce((s, a) => s + a.bytes, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic">
      <Text style={[styles.total, { color: palette.muted }]}>
        {loading
          ? t('quran.loading', 'Loading…')
          : t('downloads.total', {
              defaultValue: 'Total on device: {{size}}',
              size: formatBytes(total),
            })}
      </Text>

      {mushafBytes > 0
        ? row(
            'mushaf',
            t('downloads.mushaf', 'Mushaf pages'),
            t('downloads.mushafSub', '604 Madinah pages'),
            mushafBytes,
            () =>
              confirmDelete(t('downloads.mushaf', 'Mushaf pages'), async () => {
                await deleteMushaf();
                await clearMushafDownloadFlag();
              }),
          )
        : null}

      {audio.map(a =>
        row(
          a.reciterId,
          findReciter(a.reciterId).name,
          t('downloads.audioSub', 'Recitation audio'),
          a.bytes,
          () =>
            confirmDelete(findReciter(a.reciterId).name, () =>
              deleteReciterAudio(a.reciterId),
            ),
        ),
      )}

      {tafsirBytes > 0
        ? row(
            'tafsir',
            t('quran.tafsir', 'Tafsir'),
            t('downloads.tafsirSub', 'Cached tafsir texts'),
            tafsirBytes,
            () =>
              confirmDelete(t('quran.tafsir', 'Tafsir'), deleteTafsirCache),
          )
        : null}

      {!loading && total === 0 ? (
        <View
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={{ color: palette.muted, fontSize: 13, flex: 1 }}>
            {t(
              'downloads.empty',
              'Nothing downloaded yet. Mushaf pages, recitation audio and tafsir you download appear here.',
            )}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  total: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowBytes: { fontSize: 13, fontVariant: ['tabular-nums'] },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
