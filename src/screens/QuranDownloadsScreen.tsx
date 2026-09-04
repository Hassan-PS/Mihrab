/**
 * Manage downloads — v2.7.28.
 *
 * One place to see and reclaim the disk the Quran reader uses:
 * the mushaf page store, per-reciter recitation audio, and the tafsir
 * cache. Reachable from Settings (Data & privacy) and the Quran screen.
 * Everything here is re-downloadable, so deletes are safe.
 *
 * ── IT USED TO REPORT AN EMPTY DEVICE ─────────────────────────────────
 *
 * The mushaf row read `mushafDiskUsage`, which sums the manifest of the
 * page-IMAGE store at quran/mushaf. Version 2.8.0 replaced that reader
 * with the font-rendered one, which stores 604 typefaces at quran/fonts
 * — and nothing here was ever pointed at the new directory. So a device
 * with the whole mushaf downloaded, a hundred and eighty megabytes of it,
 * opened this screen and was told "Nothing downloaded yet". Confirmed on
 * an emulator holding all 604 fonts.
 *
 * Both stores are listed now. The old one is a separate row rather than
 * folded into the new: it is dead weight from an upgrade, several hundred
 * megabytes that nothing will ever read again, and someone deleting it
 * should be able to see that is what they are deleting. Its size is
 * walked rather than read from the manifest, so a store whose manifest
 * went missing still shows up as the space it is really taking.
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
import { CenteredColumn } from '../responsive/CenteredColumn';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { cardEdgeStyle } from '../theme/chrome';
import {
  deleteLegacyImageStore,
  legacyImageStoreBytes,
} from '../quran/mushafDownload';
import {
  deletePageFonts,
  fontStoreStats,
} from '../quran/mushafFontStore';
import { MUSHAF_TOTAL_PAGES } from '../quran/mushafImages';
import { deleteReciterAudio } from '../quran/audio/audioStore';
import {
  cancelQuranDownload,
  quranDownloadState,
  subscribeQuranDownload,
  type QuranDownloadState,
} from '../quran/quranDownloadManager';
import { findReciter } from '../quran/audio/reciters';
import { deleteTafsirCache, tafsirDiskUsage } from '../quran/tafsir';
import { RiwayahDownloadSection } from '../quran/RiwayahDownloadSection';
import {
  hydrateRiwayahData,
  riwayahProvenance,
} from '../quran/riwayahData';
import { RIWAYAT } from '../quran/riwayat';

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
  const [mushafPages, setMushafPages] = useState(0);
  const [legacyBytes, setLegacyBytes] = useState(0);
  const [tafsirBytes, setTafsirBytes] = useState(0);
  const [audio, setAudio] = useState<ReciterUsage[]>([]);
  const [riwayahBytes, setRiwayahBytes] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // The riwayah store is read from disk once per process; this screen
      // is often the first thing to need it, and it is what makes the
      // section below able to answer synchronously while it renders.
      await hydrateRiwayahData();
      setRiwayahBytes(
        RIWAYAT.reduce(
          (sum, r) => sum + (riwayahProvenance(r.id)?.bytes ?? 0),
          0,
        ),
      );
      const [fonts, legacy, tafsir] = await Promise.all([
        fontStoreStats(),
        legacyImageStoreBytes(),
        tafsirDiskUsage(),
      ]);
      setMushafBytes(fonts.bytes);
      setMushafPages(fonts.pages);
      setLegacyBytes(legacy);
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

  /**
   * What is downloading right now.
   *
   * This screen used to be an inventory and nothing else: it could tell
   * you a reciter took 1.2 GB and let you delete them, but a download in
   * flight was invisible here — you had to be on the screen that started
   * it. Which is precisely backwards for a page called "Manage
   * downloads", and it meant the only place to cancel a run was the place
   * you had already navigated away from.
   *
   * Re-reading the inventory when a run ENDS is the other half: the moment
   * a download finishes is the moment every byte count on this screen is
   * wrong.
   */
  const [download, setDownload] = useState<QuranDownloadState>(
    quranDownloadState,
  );
  useEffect(() => subscribeQuranDownload(setDownload), []);
  const running = download.running;
  useEffect(() => {
    if (!running) void refresh();
  }, [running, refresh]);

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
    mushafBytes +
    legacyBytes +
    tafsirBytes +
    riwayahBytes +
    audio.reduce((s, a) => s + a.bytes, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic">
      <CenteredColumn>
      {running ? (
        <View
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: palette.text }]}>
              {running.kind === 'audio'
                ? findReciter(running.reciterId).name
                : t('downloads.mushaf', 'Mushaf pages')}
            </Text>
            <Text style={[styles.rowSub, { color: palette.muted }]}>
              {running.kind === 'audio'
                ? t('quran.downloadProgressAyahs', {
                    done: download.progress.done,
                    total: download.progress.total,
                  })
                : t('quran.downloadProgress', {
                    done: download.progress.done,
                    total: download.progress.total,
                  })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            hitSlop={8}
            onPress={() => cancelQuranDownload()}
            style={[styles.deleteBtn, { borderColor: palette.border }]}>
            <Text
              style={{
                color: palette.accentSolid,
                fontWeight: '700',
                fontSize: 12,
              }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
            // The count, not a flat "604": a run that was cancelled or that
            // lost pages leaves a store this screen should describe honestly
            // rather than round up to complete.
            t('downloads.mushafPages', {
              defaultValue: '{{pages}} of {{total}} pages',
              pages: mushafPages,
              total: MUSHAF_TOTAL_PAGES,
            }),
            mushafBytes,
            () =>
              confirmDelete(t('downloads.mushaf', 'Mushaf pages'), async () => {
                await deletePageFonts();
              }),
          )
        : null}

      {legacyBytes > 0
        ? row(
            'mushaf-legacy',
            t('downloads.legacyMushaf', 'Older mushaf pages'),
            t(
              'downloads.legacyMushafSub',
              'Left by the previous reader. Nothing opens these now.',
            ),
            legacyBytes,
            () =>
              confirmDelete(
                t('downloads.legacyMushaf', 'Older mushaf pages'),
                async () => {
                  await deleteLegacyImageStore();
                },
              ),
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

      <RiwayahDownloadSection onChanged={() => void refresh()} />

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
      </CenteredColumn>
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
