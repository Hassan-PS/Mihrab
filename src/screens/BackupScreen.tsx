/**
 * Export and import — the user's whole record, in a file they own.
 *
 * This screen used to be a shell that exported the settings object and
 * nothing else: `journal: []`, `fasting: []`, `secureSettings: {}` were
 * hardcoded empty, and restore parsed the paste, showed a count, and threw
 * it away without writing a byte. It also passed the MERGED settings object,
 * which carries the coordinate fields, so the one thing it did export was
 * the one thing that should never leave in cleartext by accident.
 *
 * It now moves everything, through `src/sync` — the same format a
 * device-to-device sync would use, so the two can never disagree about what
 * a khatmah plan is.
 *
 * ── WHY THE FILE IS NOT ENCRYPTED ─────────────────────────────────────
 *
 * Because it cannot usefully be, and claiming otherwise would be the lie.
 * The at-rest key lives in the Android Keystore / iOS Keychain and cannot
 * leave the device; anything written in that form would be unreadable on the
 * phone it was meant for. So the file is plain JSON, exactly as private as
 * wherever the user puts it, and the screen says so in the copy rather than
 * implying a protection that is not there.
 */
import { useCallback, useMemo, useState } from 'react';
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
import { CenteredColumn } from '../responsive/CenteredColumn';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { cardEdgeStyle } from '../theme/chrome';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import {
  DEFAULT_SELECTION,
  categoriesIn,
  readSnapshot,
  SYNC_CATEGORIES,
  type Snapshot,
  type SyncCategory,
  type SyncSelection,
} from '../sync/snapshot';
import { applySnapshot } from '../sync/snapshotStore';
import {
  discardExportFile,
  readSnapshotFile,
  shareExportFile,
  writeExportFile,
} from '../sync/exportFile';

/** Rows in the order someone thinks about their own data. */
const ROWS: SyncCategory[] = [
  'prayers',
  'sunnah',
  'fasting',
  'dhikr',
  'quran',
  'settings',
  'location',
];

type Palette = ReturnType<typeof useAppPalette>['palette'];

function CategoryRow({
  category,
  value,
  onChange,
  disabled,
  palette,
}: {
  category: SyncCategory;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  palette: Palette;
}) {
  const { t } = useTranslation();
  const label = t(`sync.category.${category}`);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[typeStyle('body'), { color: palette.text }]}>{label}</Text>
        <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
          {t(`sync.categoryHint.${category}`)}
        </Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
    </View>
  );
}

export function BackupScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  useBreakpoint();

  const [selection, setSelection] = useState<SyncSelection>(DEFAULT_SELECTION);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  /** A snapshot that has been read and is waiting for the user to accept it. */
  const [pending, setPending] = useState<Snapshot | null>(null);
  const [accept, setAccept] = useState<SyncSelection>(DEFAULT_SELECTION);

  const nothingSelected = useMemo(
    () => !SYNC_CATEGORIES.some(c => selection[c]),
    [selection],
  );

  const onExport = useCallback(async () => {
    if (busy || nothingSelected) return;
    setBusy(true);
    let path: string | null = null;
    try {
      const written = await writeExportFile(selection);
      path = written.path;
      await shareExportFile(written);
    } catch (e) {
      Alert.alert(t('sync.exportFailedTitle', 'Export failed'), String(e));
    } finally {
      // The share sheet has copied wherever the user chose by now, so the
      // working copy has done its job. Leaving it would keep their whole
      // record in a cache directory they never picked.
      if (path) void discardExportFile(path);
      setBusy(false);
    }
  }, [busy, nothingSelected, selection, t]);

  const onPreview = useCallback(async () => {
    if (busy || !pasted.trim()) return;
    setBusy(true);
    try {
      const input = pasted.trim();
      // A PATH IS AS GOOD AS A PASTE. Android hands a `content://` URI when
      // a file arrives from a file manager or a share, and a backup with a
      // year of notes is a lot to move through a clipboard. Anything that
      // is not JSON is treated as somewhere to read from, which costs one
      // branch and saves the whole file from having to fit in a text box.
      const snapshot = input.startsWith('{')
        ? readSnapshot(JSON.parse(input))
        : await readSnapshotFile(input);
      const present = categoriesIn(snapshot);
      if (present.length === 0) {
        Alert.alert(t('sync.importEmptyTitle', 'Nothing to import'));
        return;
      }
      // Default to accepting exactly what the file carries — the user
      // already chose once, on the device that made it.
      const next = { ...accept };
      for (const c of SYNC_CATEGORIES) next[c] = present.includes(c);
      setAccept(next);
      setPending(snapshot);
    } catch (e) {
      Alert.alert(
        t('sync.importUnreadableTitle', 'Couldn’t read that'),
        `${t('sync.importUnreadableBody', {
          defaultValue:
            'That doesn’t look like a Mihrab backup. Paste the whole contents of the .json file.',
        })}\n\n${String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [accept, busy, pasted, t]);

  const onApply = useCallback(async () => {
    if (busy || !pending) return;
    setBusy(true);
    try {
      const { summary } = await applySnapshot(pending, accept);
      const lines = (Object.keys(summary) as Array<keyof typeof summary>)
        .filter(k => summary[k].after !== summary[k].before)
        .map(k =>
          t('sync.importedLine', {
            defaultValue: '{{label}}: {{before}} → {{after}}',
            label: t(`sync.count.${k}`),
            before: summary[k].before,
            after: summary[k].after,
          }),
        );
      setPending(null);
      setPasted('');
      Alert.alert(
        t('sync.importDoneTitle', 'Imported'),
        lines.length
          ? lines.join('\n')
          : t(
              'sync.importNothingNew',
              'Everything in that file was already here.',
            ),
      );
    } catch (e) {
      Alert.alert(t('sync.importFailedTitle', 'Import failed'), String(e));
    } finally {
      setBusy(false);
    }
  }, [accept, busy, pending, t]);

  const card = {
    backgroundColor: palette.card,
    borderRadius: RADIUS.md,
    ...cardEdgeStyle(palette),
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* The gap belongs to the stack, not to `contentContainerStyle`.
          That gap separates the ScrollView's DIRECT children, and since
          the centred column went in there has been exactly one of those,
          so it separated nothing and the cards sat flush against each
          other. Both props: CenteredColumn is a pass-through on a phone
          and only grows its inner column on a tablet or a Mac. See
          duaCardSpacing, which pins this for every screen that does it. */}
      <CenteredColumn innerStyle={styles.stack} style={styles.stack}>
        <Text
          style={[
            typeStyle('caption'),
            styles.section,
            { color: palette.muted },
          ]}
        >
          {t('sync.exportSection', 'Export')}
        </Text>
        <View style={[styles.card, card]}>
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {t('sync.exportHelp', {
              defaultValue:
                'Save everything you have recorded to a file you keep — to move to a new phone, or just so it exists somewhere else.',
            })}
          </Text>
          {ROWS.map(c => (
            <CategoryRow
              key={c}
              category={c}
              palette={palette}
              value={selection[c]}
              disabled={busy}
              onChange={next => setSelection(s => ({ ...s, [c]: next }))}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sync.exportCta', 'Export to a file')}
            accessibilityState={{ disabled: busy || nothingSelected }}
            testID="sync-export"
            onPress={onExport}
            disabled={busy || nothingSelected}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
              pressed && styles.pressed,
              (busy || nothingSelected) && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={String(palette.bg)} />
            ) : (
              <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                {t('sync.exportCta', 'Export to a file')}
              </Text>
            )}
          </Pressable>
        </View>

        <Text
          style={[
            typeStyle('caption'),
            styles.section,
            { color: palette.muted },
          ]}
        >
          {t('sync.importSection', 'Import')}
        </Text>
        <View style={[styles.card, card]}>
          <Text style={[typeStyle('body'), { color: palette.text }]}>
            {t('sync.importHelp', {
              defaultValue:
                'Open the backup file, copy all of it, and paste it here. Nothing already on this device is deleted — the two records are merged.',
            })}
          </Text>
          <TextInput
            accessibilityLabel={t(
              'sync.importPastePlaceholder',
              'Paste the backup file, or its path',
            )}
            testID="sync-paste"
            value={pasted}
            onChangeText={setPasted}
            placeholder={t(
              'sync.importPastePlaceholder',
              'Paste the backup file',
            )}
            placeholderTextColor={String(palette.muted)}
            multiline
            numberOfLines={6}
            autoCapitalize="none"
            autoCorrect={false}
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
          {pending ? (
            <>
              <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
                {t('sync.importFound', {
                  defaultValue:
                    'Made on {{date}}. Choose what to take from it:',
                  date: new Date(pending.createdAt).toLocaleDateString(),
                })}
              </Text>
              {categoriesIn(pending).map(c => (
                <CategoryRow
                  key={c}
                  category={c}
                  palette={palette}
                  value={accept[c]}
                  disabled={busy}
                  onChange={next => setAccept(s => ({ ...s, [c]: next }))}
                />
              ))}
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              pending
                ? t('sync.importApplyCta', 'Import into this device')
                : t('sync.importPreviewCta', 'Check the file')
            }
            accessibilityState={{ disabled: busy || !pasted.trim() }}
            testID="sync-import"
            onPress={() => void (pending ? onApply() : onPreview())}
            disabled={busy || !pasted.trim()}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
              pressed && styles.pressed,
              (busy || !pasted.trim()) && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={String(palette.bg)} />
            ) : (
              <Text style={[typeStyle('headline'), { color: palette.bg }]}>
                {pending
                  ? t('sync.importApplyCta', 'Import into this device')
                  : t('sync.importPreviewCta', 'Check the file')}
              </Text>
            )}
          </Pressable>
        </View>

        <Text
          style={[
            typeStyle('footnote'),
            { color: palette.muted, textAlign: 'center' },
          ]}
        >
          {t('sync.privacyNote', {
            defaultValue:
              'The file is plain text and is not password-protected — it is as private as wherever you save it. Nothing is ever uploaded.',
          })}
        </Text>
      </CenteredColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg },
  stack: { gap: SPACING.md },
  section: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
  },
  card: { padding: SPACING.md, gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  rowText: { flex: 1 },
  primary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  input: {
    borderWidth: 1,
    padding: SPACING.sm,
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
