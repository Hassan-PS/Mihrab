// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { Skeleton } from '../../components/ui/Skeleton';
import { SPACING } from '../../theme/tokens';

/**
 * Loading and error screens for the non-`ready` phases of `usePrayerDay`.
 *
 * Consolidates the previous five inline early-exit blocks (idle/loading/
 * permission_denied/location_error/api_error) into a single component with a
 * `kind` discriminator. Same visual layout, less repetition, single place to
 * upgrade once the design system (#34) and empty-state illustrations (#42) land.
 */
type PhaseScreenProps =
  | { kind: 'loading'; hint?: string }
  | { kind: 'idle' }
  | {
      kind: 'error';
      title: string;
      body: string;
      retryLabel: string;
      bodyDanger?: boolean;
      onRetry: () => void;
    };

function PhaseScreenImpl(props: PhaseScreenProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  if (props.kind === 'idle' || props.kind === 'loading') {
    // Skeleton layout instead of a spinner — keeps the eye anchored to the
    // shape of the prayer table that's about to fill in. Eliminates the
    // jarring spinner→table jump and is consistent with task #42's
    // illustration-led loading principle.
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={
          props.kind === 'loading' ? props.hint ?? t('common.loading') : t('common.loading')
        }
        style={[styles.skeletonScreen, { backgroundColor: palette.bg }]}>
        {/* Hero card skeleton */}
        <Skeleton width="100%" height={140} radius="lg" />
        {/* Day-carousel pager dot row skeleton */}
        <View style={styles.skelRow}>
          <Skeleton width={80} height={28} radius="full" />
          <Skeleton width={56} height={28} radius="full" />
          <Skeleton width={56} height={28} radius="full" />
        </View>
        {/* Six prayer rows */}
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={styles.skelRow}>
            <Skeleton width={80} height={20} radius="sm" />
            <Skeleton width={64} height={20} radius="sm" />
          </View>
        ))}
        {props.kind === 'loading' && props.hint ? (
          <Text style={[styles.loadingHint, { color: palette.muted }]}>
            {props.hint}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[styles.centered, styles.errorScreen, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>{props.title}</Text>
      <Text
        style={[
          styles.body,
          styles.bodyCenter,
          { color: props.bodyDanger ? palette.danger : palette.muted },
        ]}>
        {props.body}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.retryLabel}
        onPress={props.onRetry}
        style={[styles.button, { backgroundColor: palette.accent }]}>
        <Text style={styles.buttonLabel}>{props.retryLabel}</Text>
      </Pressable>
    </View>
  );
}

export const PhaseScreen = memo(PhaseScreenImpl);

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorScreen: { padding: 24 },
  loadingHint: { marginTop: 12, fontSize: 15, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  bodyCenter: { textAlign: 'center' },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  skeletonScreen: { flex: 1, padding: SPACING.lg, gap: SPACING.md },
  skelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
