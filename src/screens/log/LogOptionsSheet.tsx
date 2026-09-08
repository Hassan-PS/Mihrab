/**
 * Everything on the Log page that is not the log — behind one ⋯.
 *
 * The page used to carry, below the day being logged: a group of three
 * actions (fill in earlier days, fill three months, reset), a card with
 * the end-of-day reminder switch, and a pointer to set sync up — and,
 * above the prayers, a "Mark all on time" button on a line of its own. Each was
 * worth having and none was worth a screen-height of scrolling past on
 * every visit, because the visit is "log Maghrib" and takes one tap. The
 * page is one screen now, like Today: the graph, the day, and this
 * button. Everything that was under the day is under here.
 *
 * Rows, not a menu of words: the same Group/Row idiom the settings pages
 * use, so the danger tone on Reset and the switch on the reminder look
 * the way they look everywhere else in the app.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Group, Row } from '../../components/ui';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ResponsiveModal } from '../../responsive/ResponsiveModal';
import { listPeers } from '../../sync/peers';
import { reportForRound } from '../../sync/roundReport';
import { runSyncNow, syncIsReady } from '../../sync/runSync';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, typeStyle } from '../../theme/typography';
import { useSyncDialog } from '../sync/useSyncDialog';

export function LogOptionsSheet({
  visible,
  onClose,
  disabled,
  onMarkAllOnTime,
  onBackfill,
  onMonthFill,
  onReset,
  reminderOn,
  onReminderChange,
}: {
  visible: boolean;
  onClose: () => void;
  /** While a fill is running, or before the log has loaded. */
  disabled: boolean;
  onMarkAllOnTime: () => void;
  onBackfill: () => void;
  onMonthFill: () => void;
  onReset: () => void;
  reminderOn: boolean;
  onReminderChange: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation();
  const { tell, dialog } = useSyncDialog();
  const [syncReady, setSyncReady] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Re-checked on focus, as the header button was: someone who sets sync
  // up and comes back should find "Sync now" here, not "Set up sync".
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const can = await syncIsReady();
        if (alive) setSyncReady(can);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const syncNow = useCallback(() => {
    if (syncing) return;
    void (async () => {
      setSyncing(true);
      try {
        const result = await runSyncNow();
        const report = reportForRound(result, await listPeers(), {
          unnamedDevice: t('sync.unnamedDevice'),
        });
        tell(t(report.title), t(report.body, report.vars));
      } finally {
        setSyncing(false);
      }
    })();
  }, [syncing, t, tell]);

  // Close first, then act: the confirmations these open are sheets of
  // their own, and two sheets at once is one too many.
  const then = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <>
      <ResponsiveModal visible={visible} onClose={onClose} closeLabel={t('common.close', 'Close')}>
        <View style={styles.sheet}>
          <Text style={[typeStyle('title3'), { color: palette.text }]}>
            {t('log.options', 'Options')}
          </Text>
          <Group>
            <Row
              tone="accent"
              title={t('log.markAllOnTime', 'Mark all on time')}
              onPress={then(onMarkAllOnTime)}
            />
            <Row
              tone="accent"
              title={t('log.backfillAction', 'Fill in earlier days')}
              onPress={disabled ? undefined : then(onBackfill)}
              quiet={disabled}
            />
            <Row
              tone="accent"
              title={t('log.fillMonthsAction', 'Fill the past three months')}
              onPress={disabled ? undefined : then(onMonthFill)}
              quiet={disabled}
            />
            <Row
              tone="danger"
              title={t('log.resetAction', 'Reset the prayer log')}
              onPress={disabled ? undefined : then(onReset)}
              quiet={disabled}
            />
          </Group>
          <Group>
            <Row
              title={t('settings.endOfDayLog')}
              subtitle={t('settings.endOfDayLogHelp')}
              trailing={
                <Switch
                  value={reminderOn}
                  trackColor={{ true: palette.accentSolid, false: String(palette.border) }}
                  thumbColor="#ffffff"
                  onValueChange={onReminderChange}
                />
              }
            />
            {syncReady ? (
              <Row
                tone="accent"
                title={t('sync.syncNow')}
                onPress={syncing ? undefined : syncNow}
                quiet={syncing}
                trailing={
                  syncing ? (
                    <ActivityIndicator size="small" color={String(palette.accentSolid)} />
                  ) : undefined
                }
              />
            ) : (
              <Row
                tone="accent"
                title={t('log.setUpSync', 'Set up sync')}
                subtitle={t('sync.hint.logBody')}
                onPress={then(() => navigation.navigate('Sync' as never))}
              />
            )}
          </Group>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Close')}
            onPress={onClose}
            style={[styles.close, { backgroundColor: palette.accentBg }]}>
            <Text style={[typeStyle('headline'), { color: palette.accentSolid }]}>
              {t('common.close', 'Close')}
            </Text>
          </Pressable>
        </View>
      </ResponsiveModal>
      {dialog}
    </>
  );
}

/** The ⋯ that opens it. */
export function LogOptionsButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('log.options', 'Options')}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.more,
        { backgroundColor: palette.controlBg },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.moreGlyph, { color: palette.text }]}>⋯</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: SPACING.md },
  close: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: RADIUS.md,
  },
  more: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  moreGlyph: { fontSize: TYPE.title3.fontSize, fontWeight: '700', lineHeight: 22 },
});
