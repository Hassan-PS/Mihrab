/**
 * Pairing: this device's code, and the devices it has been introduced to.
 *
 * ── WHAT THIS SCREEN IS HONEST ABOUT ──────────────────────────────────
 *
 * THE CODE IS NOT A SECRET. It is this device's public key written for a
 * human, so the screen shows it permanently rather than behind a "reveal"
 * button, and says it is safe to copy or photograph. Treating a public key
 * as a password teaches the user the wrong thing about their own data and
 * makes the feature feel more dangerous than it is.
 *
 * PAIRING IS TWO-WAY, AND THE CONFIRMATION SAYS SO. The user carries one
 * code in one direction, which reads like a one-way import — so the dialog
 * before pairing states plainly that both devices will sync afterwards, and
 * that merging never deletes.
 *
 * THE FOLDER IS SOMEBODY ELSE'S JOB, AND THE COPY SAYS SO. Mihrab does not
 * move the file between devices; it writes one into a folder and reads what
 * it finds. Which folder, and what keeps it in step, is the user's choice —
 * Syncthing, Nextcloud, a shared drive. Explaining that up front is what
 * makes "nothing arrived" a thing they can debug rather than a mystery.
 *
 * REMOVING IS ONE-SIDED, AND SO DOES THAT. This device can stop talking to
 * a peer; it cannot reach into that peer and remove itself. The dialog says
 * to do it on both, because the alternative is a phone that keeps writing
 * files nobody opens and a user who thinks it did not work.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { useAppPalette } from '../hooks/useAppPalette';
import { cardEdgeStyle } from '../theme/chrome';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import { PairingQr } from './sync/PairingQr';
import { copyToClipboard, readClipboard } from '../sync/clipboard';
import { fingerprintOf, myPairingCode } from '../sync/deviceIdentity';
import {
  defaultDeviceName,
  getDeviceName,
  MAX_DEVICE_NAME,
  setDeviceName,
} from '../sync/deviceName';
import { decode } from '../sync/pairingCode';
import {
  addPeerByCode,
  forgetPeer,
  listPeers,
  MAX_PEERS,
  renamePeer,
  type Peer,
} from '../sync/peers';
import { hasSecureRandom } from '../sync/secureRandom';
import { hasFolderPicker, pickSyncFolder } from '../sync/folderAccess';
import { runSyncNow } from '../sync/runSync';
import {
  getSyncSettings,
  updateSyncSettings,
  type SyncSettings,
} from '../sync/syncSettings';
import { SYNC_CATEGORIES, type SyncCategory } from '../sync/snapshot';

type Palette = ReturnType<typeof useAppPalette>['palette'];

function PeerRow({
  peer,
  palette,
  onRename,
  onRemove,
}: {
  peer: Peer;
  palette: Palette;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(peer.name ?? '');

  return (
    <View style={styles.peerRow}>
      <View style={styles.peerText}>
        <TextInput
          accessibilityLabel={t('sync.peerNameLabel')}
          value={name}
          onChangeText={setName}
          onEndEditing={() => onRename(name)}
          onSubmitEditing={() => onRename(name)}
          placeholder={t('sync.unnamedDevice')}
          placeholderTextColor={String(palette.muted)}
          maxLength={MAX_DEVICE_NAME}
          style={[typeStyle('body'), styles.peerName, { color: palette.text }]}
        />
        <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
          {t('sync.fingerprint', { value: peer.fingerprint })}
          {'  ·  '}
          {peer.via === 'code'
            ? t('sync.viaCode')
            : t('sync.viaAnnounced')}
        </Text>
        <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
          {peer.lastSeenAt
            ? t('sync.lastSeen', {
                when: new Date(peer.lastSeenAt).toLocaleString(),
              })
            : t('sync.neverSeen')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sync.remove')}
        onPress={onRemove}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
      >
        <Text style={[typeStyle('footnote'), { color: palette.danger }]}>
          {t('sync.remove')}
        </Text>
      </Pressable>
    </View>
  );
}

export function SyncScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  const [code, setCode] = useState<string | null>(null);
  const [deviceName, setName] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [entered, setEntered] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!hasSecureRandom()) {
        if (alive) setReady(false);
        return;
      }
      try {
        const [mine, name, list, stored] = await Promise.all([
          myPairingCode(),
          getDeviceName(),
          listPeers(),
          getSyncSettings(),
        ]);
        if (!alive) return;
        setCode(mine);
        setName(name);
        setPeers(list);
        setSettings(stored);
        setReady(true);
      } catch {
        if (alive) setReady(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshPeers = useCallback(async () => {
    setPeers(await listPeers());
  }, []);

  const onCopy = useCallback(async () => {
    if (!code) return;
    const result = await copyToClipboard(code);
    if (result === 'failed') {
      Alert.alert(t('sync.copyFailed'));
      return;
    }
    // Android 13 and up shows its own confirmation; a second one is noise.
    if (result === 'copied-quietly') Alert.alert(t('sync.copied'));
  }, [code, t]);

  const onPaste = useCallback(async () => {
    const text = await readClipboard();
    if (text.trim()) setEntered(text.trim());
  }, []);

  const onRenameSelf = useCallback(
    (next: string) => {
      void (async () => {
        const saved = await setDeviceName(next);
        setName(saved);
      })();
    },
    [],
  );

  const onAdd = useCallback(() => {
    const text = entered.trim();
    if (!text || busy) return;
    const parsed = decode(text);
    if (!parsed.ok) {
      Alert.alert(t('sync.errorBadCodeTitle'), t('sync.errorBadCode'));
      return;
    }
    const fingerprint = fingerprintOf(parsed.key);

    Alert.alert(
      t('sync.pairWarnTitle', { value: fingerprint }),
      t('sync.pairWarnBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sync.pairConfirm'),
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const result = await addPeerByCode(text);
                if (!result.ok) {
                  Alert.alert(
                    t('sync.errorBadCodeTitle'),
                    result.reason === 'this-device'
                      ? t('sync.errorThisDevice')
                      : result.reason === 'too-many'
                        ? t('sync.errorTooMany', { max: MAX_PEERS })
                        : t('sync.errorBadCode'),
                  );
                  return;
                }
                setEntered('');
                await refreshPeers();
                Alert.alert(t('sync.pairedTitle'), t('sync.pairedBody'));
              } catch {
                Alert.alert(t('sync.errorSaveTitle'), t('sync.errorSaveBody'));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [busy, entered, refreshPeers, t]);

  const onChooseFolder = useCallback(() => {
    void (async () => {
      if (!hasFolderPicker()) {
        Alert.alert(t('sync.errorUnsupported'));
        return;
      }
      try {
        const picked = await pickSyncFolder();
        // Null is a cancel, not a failure. Saying nothing is the correct
        // response to someone deciding not to.
        if (!picked) return;
        setSettings(await updateSyncSettings({ folder: picked, lastError: null }));
      } catch (e) {
        Alert.alert(t('sync.syncFailedTitle'), String(e));
      }
    })();
  }, [t]);

  const onSyncNow = useCallback(() => {
    if (syncing) return;
    void (async () => {
      setSyncing(true);
      try {
        const result = await runSyncNow();
        setSettings(await getSyncSettings());
        if (result.ok) {
          await refreshPeers();
          Alert.alert(
            t('sync.syncDoneTitle'),
            result.outcome.read > 0
              ? t('sync.syncDoneBody')
              : t('sync.syncNothing'),
          );
          return;
        }
        Alert.alert(
          t('sync.syncFailedTitle'),
          result.reason === 'folder-gone'
            ? t('sync.errorFolderGone')
            : result.reason === 'no-folder'
              ? t('sync.folderHelp')
              : result.reason === 'unsupported' || result.reason === 'no-identity'
                ? t('sync.errorUnsupported')
                : t('sync.syncFailedBody', { detail: result.detail ?? '' }),
        );
      } finally {
        setSyncing(false);
      }
    })();
  }, [refreshPeers, syncing, t]);

  const onToggleCategory = useCallback(
    (category: SyncCategory, next: boolean) => {
      void (async () => {
        const current = settings ?? (await getSyncSettings());
        setSettings(
          await updateSyncSettings({
            selection: { ...current.selection, [category]: next },
          }),
        );
      })();
    },
    [settings],
  );

  const onToggleAuto = useCallback((next: boolean) => {
    void (async () => {
      setSettings(await updateSyncSettings({ autoOnOpen: next }));
    })();
  }, []);

  const onRemove = useCallback(
    (peer: Peer) => {
      Alert.alert(
        t('sync.removeTitle', {
          value: peer.name || t('sync.unnamedDevice'),
        }),
        t('sync.removeBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('sync.remove'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                await forgetPeer(peer.pk);
                await refreshPeers();
              })();
            },
          },
        ],
      );
    },
    [refreshPeers, t],
  );

  const card = {
    backgroundColor: palette.card,
    borderRadius: RADIUS.md,
    ...cardEdgeStyle(palette),
  };

  if (ready === false) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <CenteredColumn>
          <View style={[styles.card, card]}>
            <Text style={[typeStyle('body'), { color: palette.text }]}>
              {t('sync.notReady')}
            </Text>
          </View>
        </CenteredColumn>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <CenteredColumn>
        <Text style={[typeStyle('body'), { color: palette.text }]}>
          {t('sync.pairIntro')}
        </Text>

        <Text
          style={[typeStyle('caption'), styles.section, { color: palette.muted }]}
        >
          {t('sync.thisDevice')}
        </Text>
        <View style={[styles.card, card]}>
          <TextInput
            accessibilityLabel={t('sync.deviceNameLabel')}
            value={deviceName}
            onChangeText={setName}
            onEndEditing={() => onRenameSelf(deviceName)}
            onSubmitEditing={() => onRenameSelf(deviceName)}
            placeholder={defaultDeviceName()}
            placeholderTextColor={String(palette.muted)}
            maxLength={MAX_DEVICE_NAME}
            style={[
              typeStyle('body'),
              styles.input,
              {
                color: palette.text,
                backgroundColor: palette.bg,
                borderColor: palette.border,
                borderRadius: RADIUS.sm,
              },
            ]}
          />
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {t('sync.thisDeviceHelp')}
          </Text>
          {code ? (
            <>
              <PairingQr code={code} />
              <Text
                accessibilityLabel={t('sync.codeA11y')}
                selectable
                testID="sync-code"
                style={[styles.code, { color: palette.text }]}
              >
                {code}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('sync.copyCode')}
                testID="sync-copy"
                onPress={() => void onCopy()}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                  {t('sync.copyCode')}
                </Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={String(palette.accent)} />
          )}
        </View>

        <Text
          style={[typeStyle('caption'), styles.section, { color: palette.muted }]}
        >
          {t('sync.addDevice')}
        </Text>
        <View style={[styles.card, card]}>
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {t('sync.addDeviceHelp')}
          </Text>
          <TextInput
            accessibilityLabel={t('sync.codePlaceholder')}
            testID="sync-code-input"
            value={entered}
            onChangeText={setEntered}
            placeholder={t('sync.codePlaceholder')}
            placeholderTextColor={String(palette.muted)}
            autoCapitalize="characters"
            autoCorrect={false}
            multiline
            style={[
              styles.codeInput,
              {
                color: palette.text,
                backgroundColor: palette.bg,
                borderColor: palette.border,
                borderRadius: RADIUS.sm,
              },
            ]}
          />
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sync.pasteCode')}
              onPress={() => void onPaste()}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: palette.border, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typeStyle('headline'), { color: palette.text }]}>
                {t('sync.pasteCode')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sync.addCta')}
              accessibilityState={{ disabled: busy || !entered.trim() }}
              testID="sync-pair"
              onPress={onAdd}
              disabled={busy || !entered.trim()}
              style={({ pressed }) => [
                styles.primary,
                styles.grow,
                { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
                (busy || !entered.trim()) && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={String(palette.bg)} />
              ) : (
                <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                  {t('sync.addCta')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <Text
          style={[typeStyle('caption'), styles.section, { color: palette.muted }]}
        >
          {t('sync.pairedSection')}
        </Text>
        <View style={[styles.card, card]}>
          {peers.length === 0 ? (
            <Text style={[typeStyle('body'), { color: palette.muted }]}>
              {t('sync.noneYet')}
            </Text>
          ) : (
            peers.map(peer => (
              <PeerRow
                key={peer.pk}
                peer={peer}
                palette={palette}
                onRename={name => {
                  void (async () => {
                    await renamePeer(peer.pk, name);
                    await refreshPeers();
                  })();
                }}
                onRemove={() => onRemove(peer)}
              />
            ))
          )}
        </View>

        <Text
          style={[typeStyle('caption'), styles.section, { color: palette.muted }]}
        >
          {t('sync.folderSection')}
        </Text>
        <View style={[styles.card, card]}>
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {t('sync.folderHelp')}
          </Text>
          {settings?.folder ? (
            <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
              {t('sync.folderChosen', { value: settings.folder.label })}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                settings?.folder
                  ? t('sync.changeFolder')
                  : t('sync.chooseFolder')
              }
              testID="sync-choose-folder"
              onPress={onChooseFolder}
              style={({ pressed }) => [
                styles.secondary,
                styles.grow,
                { borderColor: palette.border, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typeStyle('headline'), { color: palette.text }]}>
                {settings?.folder
                  ? t('sync.changeFolder')
                  : t('sync.chooseFolder')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sync.syncNow')}
              accessibilityState={{ disabled: syncing || !settings?.folder }}
              testID="sync-now"
              onPress={onSyncNow}
              disabled={syncing || !settings?.folder}
              style={({ pressed }) => [
                styles.primary,
                styles.grow,
                { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
                pressed && styles.pressed,
                (syncing || !settings?.folder) && styles.disabled,
              ]}
            >
              {syncing ? (
                <ActivityIndicator color={String(palette.bg)} />
              ) : (
                <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                  {t('sync.syncNow')}
                </Text>
              )}
            </Pressable>
          </View>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {settings?.lastSyncAt
              ? t('sync.lastSyncedAt', {
                  when: new Date(settings.lastSyncAt).toLocaleString(),
                })
              : t('sync.neverSynced')}
          </Text>
          <View style={styles.peerRow}>
            <Text
              style={[typeStyle('body'), styles.peerText, { color: palette.text }]}
            >
              {t('sync.autoOnOpen')}
            </Text>
            <Switch
              accessibilityLabel={t('sync.autoOnOpen')}
              value={settings?.autoOnOpen ?? true}
              onValueChange={onToggleAuto}
            />
          </View>
        </View>

        <Text
          style={[typeStyle('caption'), styles.section, { color: palette.muted }]}
        >
          {t('sync.whatSyncs')}
        </Text>
        <View style={[styles.card, card]}>
          {SYNC_CATEGORIES.map(category => (
            <View key={category} style={styles.peerRow}>
              <View style={styles.peerText}>
                <Text style={[typeStyle('body'), { color: palette.text }]}>
                  {t(`sync.category.${category}`)}
                </Text>
                <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
                  {t(`sync.categoryHint.${category}`)}
                </Text>
              </View>
              <Switch
                accessibilityLabel={t(`sync.category.${category}`)}
                value={settings?.selection[category] ?? false}
                onValueChange={next => onToggleCategory(category, next)}
              />
            </View>
          ))}
        </View>

        <Text
          style={[
            typeStyle('footnote'),
            { color: palette.muted, textAlign: 'center' },
          ]}
        >
          {t('sync.privacyNoteP2p')}
        </Text>
      </CenteredColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md },
  section: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
  },
  card: { padding: SPACING.md, gap: SPACING.sm },
  code: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 1,
    textAlign: 'center',
  },
  codeInput: {
    fontFamily: 'monospace',
    fontSize: 14,
    borderWidth: 1,
    padding: SPACING.sm,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  input: { borderWidth: 1, padding: SPACING.sm },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'stretch' },
  grow: { flex: 1 },
  primary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  secondary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
    borderWidth: 1,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  peerText: { flex: 1 },
  peerName: { padding: 0, margin: 0 },
  remove: { paddingVertical: 4, paddingHorizontal: SPACING.xs },
});
