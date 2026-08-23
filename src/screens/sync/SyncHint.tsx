// hover-ok: a list-row style pressable, matching the cards it sits among.
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import type { RootStackParamList } from '../../navigation/types';
import { hasFolderPicker } from '../../sync/folderAccess';
import { listPeers } from '../../sync/peers';
import { hasSecureRandom } from '../../sync/secureRandom';
import { getSyncSettings } from '../../sync/syncSettings';

/**
 * "Your record can live on more than one device" — said once, where it is
 * relevant, and then never again.
 *
 * ── WHY IT IS HERE AND NOT ONLY IN SETTINGS ───────────────────────────
 *
 * Sync is the kind of feature nobody goes looking for, because the problem
 * it solves — reading on the phone and losing your place on the tablet —
 * does not feel like something an app could fix. It has to be mentioned at
 * the moment the user is looking at the data that would travel. That is the
 * Quran index and the Log, and nowhere else: a pointer on every screen
 * would be an advertisement.
 *
 * ── AND WHY IT DISAPPEARS BY ITSELF ───────────────────────────────────
 *
 * Three ways out, and the user only has to take one of them:
 *
 *   1. They set sync up. The hint is gone because it is answered.
 *   2. They dismiss it. Permanently, per screen, no "are you sure".
 *   3. This build cannot do sync at all — no folder module, or no secure
 *      randomness for an identity. Then it never appears, because pointing
 *      someone at a screen that cannot help them is worse than silence.
 *
 * "Set up" means a folder AND a paired device, which is the honest test:
 * either one alone syncs nothing, so the hint is still telling the truth
 * and still has somewhere useful to send them.
 *
 * ── IT RE-CHECKS ON FOCUS ─────────────────────────────────────────────
 *
 * The obvious path is Log → hint → Sync screen → set it up → back. If this
 * only read its state on mount, the user would return to the very hint they
 * had just acted on, which reads as the app not having noticed.
 */

/** Which screens the user has waved away. Small, plaintext, device-local. */
const DISMISSED_KEY = 'mihrab.syncHint.dismissed.v1';

export type SyncHintPlace = 'quran' | 'log';

async function dismissedPlaces(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Whether the hint has anything useful to say on `place`.
 *
 * Exported so a test can ask the question without a renderer, and so the
 * rule lives in one place rather than being re-derived by each caller.
 */
export async function shouldShowSyncHint(
  place: SyncHintPlace,
): Promise<boolean> {
  if (!hasSecureRandom() || !hasFolderPicker()) return false;
  if ((await dismissedPlaces()).includes(place)) return false;
  const [settings, peers] = await Promise.all([getSyncSettings(), listPeers()]);
  return !(settings.folder && peers.length > 0);
}

export async function dismissSyncHint(place: SyncHintPlace): Promise<void> {
  try {
    const places = await dismissedPlaces();
    if (places.includes(place)) return;
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...places, place]));
  } catch {
    // Lost on the next launch, which shows the hint once more. Annoying;
    // not worth failing the tap over.
  }
}

/** For tests, and for a future "show me the tips again". */
export async function resetSyncHints(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Nothing to undo.
  }
}

type Props = {
  place: SyncHintPlace;
  /** Overrides the wrapper's margins where a screen has its own rhythm. */
  style?: object;
};

export function SyncHint({ place, style }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [visible, setVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const show = await shouldShowSyncHint(place);
        if (alive) setVisible(show);
      })();
      return () => {
        alive = false;
      };
    }, [place]),
  );

  if (!visible) return null;

  const onDismiss = () => {
    // Hidden first, saved after. The tap should feel instant, and a failed
    // write costs one more sighting rather than a row that will not go away.
    setVisible(false);
    void dismissSyncHint(place);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(`sync.hint.${place}Title`)}
        accessibilityHint={t('sync.hint.openHint')}
        testID={`sync-hint-${place}`}
        onPress={() => navigation.navigate('Sync')}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.text}>
          <Text style={[typeStyle('headline'), { color: palette.text }]}>
            {t(`sync.hint.${place}Title`)}
          </Text>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t(`sync.hint.${place}Body`)}
          </Text>
        </View>
        <Text style={[styles.arrow, { color: palette.accentSolid }]}>→</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('sync.hint.dismiss')}
        testID={`sync-hint-dismiss-${place}`}
        onPress={onDismiss}
        // Generous, because it is a small glyph next to a large target and
        // hitting the wrong one sends the user to a screen they did not want.
        hitSlop={SPACING.md}
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
      >
        <Text style={[styles.dismissGlyph, { color: palette.muted }]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    // Start/end, not left/right: the arrow and the dismiss glyph swap sides
    // in Arabic and Urdu, and so must the padding that frames them.
    paddingStart: SPACING.md,
    paddingEnd: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  text: { flex: 1, gap: 2 },
  arrow: { fontSize: 18 },
  pressed: { opacity: 0.7 },
  dismiss: { padding: SPACING.sm },
  dismissGlyph: { fontSize: 15, lineHeight: 18 },
});
