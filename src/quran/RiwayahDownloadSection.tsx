/**
 * Adding and removing a muṣḥaf the app does not ship.
 *
 * ── WHY THIS SCREEN SAYS SO MUCH ──────────────────────────────────────
 *
 * Every other row in Manage downloads is "we have this, want it?" — the
 * page fonts, the recitations, the tafsir all come from somewhere Mihrab
 * already stands behind. This one does not, and pretending otherwise by
 * making it look like the others would be the dishonest option.
 *
 * Mihrab has no right to distribute the Warsh corpus. Nobody publishes a
 * Warsh text under terms that would give it one (`riwayahStore.ts` has
 * the survey). So the app ships the reader and the checks, and the file
 * comes from the publisher to the reader, with nothing of ours in
 * between — and the reader is told exactly that, along with who publishes
 * it and whom they credit, before they add scripture to their device.
 *
 * ── TWO WAYS IN, BECAUSE ONE IS NOT ENOUGH ────────────────────────────
 *
 * The link field is not a developer affordance. There is no honest URL to
 * hardcode: QUL's own routes are `/resources/:id/:token/download`, and the
 * token is minted per download in the browser. A URL guessed from a
 * rendered page is one that breaks silently later, which for scripture is
 * the worst failure available.
 *
 * But pasting the resource PAGE is the obvious thing to try, and it fails
 * — correctly, and with a message saying so, which is still a dead end for
 * anyone who cannot find the real link. So there is a second way that has
 * no link in it at all: download the file in a browser, then point Mihrab
 * at the folder it went to. That is the existing folder picker — the same
 * native module sync uses — and it works on both platforms today with no
 * new native code.
 *
 * The file never travels through anything of ours either way.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { cardEdgeStyle } from '../theme/chrome';
import {
  riwayahProvenance,
  uninstallRiwayah,
  useRiwayahAvailability,
} from './riwayahData';
import {
  installRiwayahFromText,
  installRiwayahFromUrl,
} from './riwayahDownload';
import { folderAt, hasFolderPicker, pickSyncFolder } from '../sync/folderAccess';
import { RIWAYAT, type RiwayahDefinition } from './riwayat';

function hostOf(from: string): string {
  const m = /^https?:\/\/([^/]+)/i.exec(from);
  return m ? m[1] : from;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function RiwayahDownloadSection({
  onChanged,
}: {
  /** Let the parent re-total its "on this device" figure. */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  // Re-render when a muṣḥaf is added or removed anywhere in the app.
  useRiwayahAvailability();

  const offered = RIWAYAT.filter(r => r.render === 'unicode' && r.source);
  if (offered.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: palette.muted }]}>
        {t('downloads.riwayat', 'Reading traditions')}
      </Text>
      {offered.map(riwayah => (
        <RiwayahCard
          key={riwayah.id}
          riwayah={riwayah}
          onChanged={onChanged}
        />
      ))}
      <Text style={[styles.footnote, { color: palette.muted }]}>
        {t(
          'downloads.riwayatFootnote',
          'Mihrab does not include or host these texts. The file is fetched from the publisher straight to this device, and checked here before anything is read from it.',
        )}
      </Text>
    </View>
  );
}

function RiwayahCard({
  riwayah,
  onChanged,
}: {
  riwayah: RiwayahDefinition;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  /** Several JSON files in the chosen folder — the reader picks one. */
  const [candidates, setCandidates] = useState<{
    handle: string;
    names: string[];
  } | null>(null);

  const installed = riwayahProvenance(riwayah.id);
  const name = t(riwayah.nameKey, riwayah.arabic);

  /**
   * Take the file the reader downloaded themselves.
   *
   * A folder rather than a file because that is the picker this app
   * already has native code for, on both platforms. Everything ending in
   * `.json` is offered; one match is taken without asking, since a folder
   * with a single JSON in it is almost always the one just downloaded.
   */
  const chooseFile = useCallback(async () => {
    setError(null);
    setDetail(null);
    let handle: string;
    try {
      const picked = await pickSyncFolder();
      if (!picked) return;
      handle = picked.handle;
    } catch {
      setError(t('downloads.riwayahNoPicker', 'This build cannot open a folder.'));
      return;
    }
    setBusy(true);
    try {
      const folder = folderAt(handle);
      const names = (await folder.list()).filter(n =>
        n.toLowerCase().endsWith('.json'),
      );
      if (names.length === 0) {
        setError(
          t(
            'downloads.riwayahNoJson',
            'There is no .json file in that folder. Choose the folder you downloaded it to.',
          ),
        );
        return;
      }
      // Newest-looking last: exports are usually named with the resource,
      // and a reader who has several is best served by being asked.
      const name = names.length === 1 ? names[0] : null;
      if (!name) {
        setCandidates({ handle, names });
        return;
      }
      const contents = await folder.read(name);
      const result = await installRiwayahFromText(riwayah.id, contents, name);
      if (result.ok) {
        onChanged?.();
        return;
      }
      setError(t(result.error.key, result.error.fallback, result.error.params));
      setDetail(result.error.detail ?? null);
    } catch (e) {
      setError(
        t('downloads.riwayahUnreadable', 'That file could not be read.'),
      );
      setDetail(String(e));
    } finally {
      setBusy(false);
    }
  }, [onChanged, riwayah.id, t]);

  /**
   * One of several JSON files in the chosen folder.
   *
   * Not named `useCandidate`: the lint rule reads a `use` prefix as a hook
   * and refuses it inside a callback, which is the rule doing its job on a
   * function that is not one.
   */
  const installCandidate = useCallback(
    async (name: string) => {
      if (!candidates) return;
      setBusy(true);
      setError(null);
      setDetail(null);
      try {
        const contents = await folderAt(candidates.handle).read(name);
        const result = await installRiwayahFromText(riwayah.id, contents, name);
        if (result.ok) {
          setCandidates(null);
          onChanged?.();
          return;
        }
        setError(t(result.error.key, result.error.fallback, result.error.params));
        setDetail(result.error.detail ?? null);
      } catch (e) {
        setError(t('downloads.riwayahUnreadable', 'That file could not be read.'));
        setDetail(String(e));
      } finally {
        setBusy(false);
      }
    },
    [candidates, onChanged, riwayah.id, t],
  );

  const install = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDetail(null);
    const result = await installRiwayahFromUrl(riwayah.id, url);
    setBusy(false);
    if (result.ok) {
      setUrl('');
      onChanged?.();
      return;
    }
    setError(t(result.error.key, result.error.fallback, result.error.params));
    setDetail(result.error.detail ?? null);
  }, [onChanged, riwayah.id, t, url]);

  const remove = useCallback(() => {
    Alert.alert(
      t('downloads.deleteTitle', 'Delete download?'),
      t('downloads.deleteBody', {
        defaultValue:
          '{{what}} will be removed from this device. You can download it again at any time.',
        what: name,
      }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            void uninstallRiwayah(riwayah.id).then(() => onChanged?.());
          },
        },
      ],
    );
  }, [name, onChanged, riwayah.id, t]);

  if (installed) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={[styles.title, { color: palette.text }]}>{name}</Text>
            <Text style={[styles.sub, { color: palette.muted }]}>
              {t('downloads.riwayahInstalled', {
                defaultValue: '{{pages}} pages · from {{host}}',
                pages: installed.pages,
                host: hostOf(installed.from),
              })}
            </Text>
          </View>
          <Text style={[styles.bytes, { color: palette.muted }]}>
            {formatBytes(installed.bytes)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.delete', 'Delete')}
            hitSlop={8}
            onPress={remove}
            style={[styles.deleteBtn, { borderColor: palette.border }]}>
            <Text style={styles.deleteLabel}>
              {t('common.delete', 'Delete')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
      ]}>
      <Text style={[styles.title, { color: palette.text }]}>{name}</Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        {t('downloads.riwayahPublisher', {
          defaultValue: 'Published by {{publisher}}. Credits {{credits}}.',
          publisher: riwayah.source?.publisher ?? '',
          credits: riwayah.source?.credits ?? '',
        })}
      </Text>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('downloads.riwayahOpenSource', 'Open the source')}
        onPress={() => {
          const page = riwayah.source?.page;
          if (page) void Linking.openURL(page);
        }}
        style={styles.linkBtn}>
        <Text style={[styles.link, { color: palette.accentSolid }]}>
          {t('downloads.riwayahOpenSource', 'Open the source')}
        </Text>
      </Pressable>

      <Text style={[styles.help, { color: palette.muted }]}>
        {t(
          'downloads.riwayahHowTo',
          'Download the JSON export from that page, then choose the folder it went to.',
        )}
      </Text>

      {hasFolderPicker() ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            'downloads.riwayahChooseFile',
            'Choose the downloaded file',
          )}
          disabled={busy}
          onPress={() => void chooseFile()}
          style={({ pressed }) => [
            styles.secondary,
            { borderColor: palette.accentSolid },
            (busy || pressed) && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.secondaryLabel, { color: palette.accentSolid }]}>
            {t('downloads.riwayahChooseFile', 'Choose the downloaded file')}
          </Text>
        </Pressable>
      ) : null}

      {candidates ? (
        <View style={styles.candidates}>
          <Text style={[styles.help, { color: palette.muted }]}>
            {t('downloads.riwayahWhichFile', 'Which file is it?')}
          </Text>
          {candidates.names.map(name => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={name}
              onPress={() => void installCandidate(name)}
              style={({ pressed }) => [
                styles.candidate,
                { borderColor: palette.border ?? palette.muted },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={{ color: palette.text, fontSize: 13 }} numberOfLines={1}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={[styles.help, styles.orLine, { color: palette.muted }]}>
        {t('downloads.riwayahOrLink', 'Or paste a direct link to the file:')}
      </Text>

      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!busy}
        placeholder="https://…"
        placeholderTextColor={String(palette.muted)}
        accessibilityLabel={t('downloads.riwayahLink', 'Link to the data file')}
        style={[
          styles.input,
          { color: palette.text, borderColor: palette.border },
        ]}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          {detail ? (
            <Text style={[styles.detail, { color: palette.muted }]}>
              {detail}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('downloads.riwayahInstall', 'Add this muṣḥaf')}
        disabled={busy || url.trim().length === 0}
        onPress={() => void install()}
        style={[
          styles.cta,
          {
            backgroundColor: palette.accentSolid,
            opacity: busy || url.trim().length === 0 ? 0.5 : 1,
          },
        ]}>
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.ctaLabel}>
            {t('downloads.riwayahInstall', 'Add this muṣḥaf')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginHorizontal: 4,
  },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  bytes: { fontSize: 12, fontVariant: ['tabular-nums'] },
  deleteBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteLabel: { color: '#d43f3f', fontWeight: '700', fontSize: 12 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  secondary: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginBottom: 4,
  },
  secondaryLabel: { fontWeight: '700', fontSize: 15 },
  orLine: { marginTop: 10 },
  candidates: { marginTop: 6, marginBottom: 4 },
  candidate: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  link: { fontSize: 14, fontWeight: '700' },
  help: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorBox: { marginTop: 10 },
  error: { color: '#d43f3f', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  detail: { fontSize: 11, marginTop: 4, lineHeight: 15 },
  cta: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  ctaLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footnote: { fontSize: 11, lineHeight: 16, marginHorizontal: 4, marginTop: 2 },
});
