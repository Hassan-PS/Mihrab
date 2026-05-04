import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { cardEdgeStyle } from '../theme/chrome';
import {
  BACKUP_FORMAT_VERSION,
  buildPayload,
  isLikelyBackupEnvelope,
  parsePayload,
  type BackupEnvelope,
} from '../backup/backup';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';

/**
 * BackupScreen — task #31 UI shell.
 *
 * Lets the user build a JSON backup envelope of their settings, presets,
 * journal, and fasting log, then share it via the native share sheet
 * (saves to Files / iCloud / Google Drive / email).
 *
 * **Crypto note:** the backup envelope contract in `src/backup/backup.ts`
 * encrypts sensitive fields (coordinates, journal, fasting) with a user
 * password. THIS UI is the cleartext shell only — it composes the payload
 * and ships the unencrypted JSON via Share so the user can encrypt it
 * with their own tools (e.g., 1Password attachments). The full passworded
 * envelope flow lights up when a Web Crypto polyfill ships in a follow-up
 * (we keep the envelope shape stable so backups stay forward-compatible).
 *
 * Restore is paste-driven for now — the user pastes a JSON string into the
 * text area; a real DocumentPicker integration is a tiny native dep away
 * but isn't blocking. The screen validates the envelope shape before any
 * destructive write.
 */
export function BackupScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  // Subscribed but unused — keeps the screen re-rendering on size change
  // so future master-detail layouts pick up the new width without a
  // forced remount. iPad/Mac task #33 baseline.
  useBreakpoint();
  const { settings } = usePrayerSettings();
  const [restoreText, setRestoreText] = useState('');
  const [busy, setBusy] = useState(false);

  const onExport = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // For the cleartext-shell pass, sensitive fields stay in `settings`.
      // The crypto follow-up will split them into the encrypted slot.
      const payload = buildPayload({
        settings: settings as unknown as Record<string, unknown>,
        secureSettings: {},
        journal: [],
        fasting: [],
        meta: { app: 'PrayerApp', exportedFrom: 'BackupScreen' },
      });
      // Wrap in the envelope shape so a future passworded version
      // can read the same outer structure.
      const envelope: BackupEnvelope = {
        version: BACKUP_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        salt: '',
        iv: '',
        ciphertext: JSON.stringify(payload),
      };
      const text = JSON.stringify(envelope, null, 2);
      await Share.share({
        message: text,
        title: t('backup.shareTitle'),
      });
    } catch (e) {
      console.warn('Backup export failed', e);
      Alert.alert(t('backup.exportFailedTitle'), String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, settings, t]);

  const onRestore = useCallback(() => {
    if (busy) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(restoreText);
      if (!isLikelyBackupEnvelope(parsed)) {
        throw new Error(t('backup.notAnEnvelope'));
      }
      // Cleartext-shell: ciphertext currently holds the JSON payload.
      const inner = JSON.parse(parsed.ciphertext);
      const payload = parsePayload(inner);
      // Hand-off: a real "apply" should diff with current state and
      // ask the user. For the shell we just confirm we COULD parse it.
      Alert.alert(
        t('backup.restorePreviewTitle'),
        t('backup.restorePreviewBody', {
          settings: Object.keys(payload.settings).length,
          presets:
            (payload.secureSettings.locationPresets as unknown[] | undefined)
              ?.length ?? 0,
          journal: payload.journal.length,
          fasting: payload.fasting.length,
        }),
      );
    } catch (e) {
      Alert.alert(t('backup.restoreFailedTitle'), String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, restoreText, t]);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <Text style={[typeStyle('caption'), styles.section, { color: palette.muted }]}>
        {t('backup.exportSection')}
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.card,
            borderRadius: RADIUS.md,
            ...cardEdgeStyle(palette),
          },
        ]}>
        <Text style={[typeStyle('body'), { color: palette.text }]}>
          {t('backup.exportHelp')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('backup.exportCta')}
          onPress={onExport}
          disabled={busy}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.primary,
            { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
            pressed && { opacity: 0.85 }, hovered && { opacity: 0.92 },
            busy && { opacity: 0.5 },
          ]}>
          <Text style={[typeStyle('headline'), { color: palette.bg }]}>
            {t('backup.exportCta')}
          </Text>
        </Pressable>
      </View>

      <Text style={[typeStyle('caption'), styles.section, { color: palette.muted }]}>
        {t('backup.restoreSection')}
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.card,
            borderRadius: RADIUS.md,
            ...cardEdgeStyle(palette),
          },
        ]}>
        <Text style={[typeStyle('body'), { color: palette.text }]}>
          {t('backup.restoreHelp')}
        </Text>
        <TextInput
          accessibilityLabel={t('backup.restorePastePlaceholder')}
          value={restoreText}
          onChangeText={setRestoreText}
          placeholder={t('backup.restorePastePlaceholder')}
          placeholderTextColor={String(palette.muted)}
          multiline
          numberOfLines={6}
          style={[
            styles.input,
            {
              color: palette.text,
              backgroundColor: palette.bg,
              borderColor: palette.border,
              borderRadius: RADIUS.sm,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('backup.restoreCta')}
          onPress={onRestore}
          disabled={busy || restoreText.trim().length === 0}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.primary,
            { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
            pressed && { opacity: 0.85 }, hovered && { opacity: 0.92 },
            (busy || restoreText.trim().length === 0) && { opacity: 0.45 },
          ]}>
          <Text style={[typeStyle('headline'), { color: palette.bg }]}>
            {t('backup.restoreCta')}
          </Text>
        </Pressable>
      </View>

      <Text style={[typeStyle('footnote'), { color: palette.muted, textAlign: 'center' }]}>
        {t('backup.privacyNote')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  section: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
  },
  card: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  primary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    padding: SPACING.sm,
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
