import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SPACING } from '../../theme/tokens';
import { listPeers } from '../../sync/peers';
import { runSyncNow, syncIsReady } from '../../sync/runSync';

/**
 * Sync, from the screen showing the data that would travel.
 *
 * ── WHY IT IS NOT ALWAYS THERE ────────────────────────────────────────
 *
 * It appears only once sync would actually do something — a folder AND a
 * paired device. Before that the same two screens carry a pointer offering
 * to set it up, and having both at once would be the app asking twice for
 * one thing. After that the pointer is gone and this takes its place.
 *
 * ── WHY IT IS WORTH A HEADER SLOT AT ALL ──────────────────────────────
 *
 * The rounds that matter are the ones someone asks for: they logged Fajr on
 * their phone and want it on the tablet before they put the phone down.
 * Sending them to Settings to do that is three taps away from the screen
 * they are already looking at, and the automatic round on app open cannot
 * help with something they did thirty seconds ago.
 *
 * It reports the same three outcomes as the Sync screen, in the same words,
 * because a round that found nothing must not be called "Synced" here and
 * something else there.
 */
function SyncIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {/* Two arcs chasing each other, with an arrowhead on each. */}
      <Path
        d="M20 11.5a8 8 0 0 0-13.7-5.6L3.5 8.6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.5 4.5v4.2h4.2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 12.5a8 8 0 0 0 13.7 5.6l2.8-2.7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.5 19.5v-4.2h-4.2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SyncHeaderButton() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-checked on focus, not only on mount: someone who sets sync up and
  // comes back should find the button here, and someone who removes their
  // last device should not.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const can = await syncIsReady();
        if (alive) setReady(can);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const onPress = useCallback(() => {
    if (busy) return;
    void (async () => {
      setBusy(true);
      try {
        const result = await runSyncNow();
        if (!result.ok) {
          Alert.alert(
            t('sync.syncFailedTitle'),
            result.reason === 'folder-gone'
              ? t('sync.errorFolderGone')
              : result.reason === 'no-folder'
                ? t('sync.folderHelp')
                : result.reason === 'unsupported' ||
                    result.reason === 'no-identity'
                  ? t('sync.errorUnsupported')
                  : t('sync.syncFailedBody', { detail: result.detail ?? '' }),
          );
          return;
        }
        if (result.outcome.read > 0) {
          Alert.alert(t('sync.syncDoneTitle'), t('sync.syncDoneBody'));
          return;
        }
        const known = await listPeers();
        const neverAnyone = known.length > 0 && known.every(p => !p.lastSeenAt);
        Alert.alert(
          t('sync.syncQuietTitle'),
          neverAnyone ? t('sync.syncNothingArrived') : t('sync.syncNothing'),
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, t]);

  if (!ready) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('sync.syncNow')}
      accessibilityState={{ disabled: busy, busy }}
      testID="sync-header-button"
      onPress={onPress}
      disabled={busy}
      // Generous around a 22pt glyph in a crowded bar.
      hitSlop={SPACING.sm}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={String(palette.accentSolid)} />
      ) : (
        <SyncIcon color={String(palette.accentSolid)} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
