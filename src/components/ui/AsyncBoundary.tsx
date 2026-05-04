import { memo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SPACING } from '../../theme/tokens';
import { EmptyState } from './EmptyState';

/**
 * AsyncBoundary — task #42.
 *
 * Renders one of three states for a fetch / async screen:
 *   • `loading` — calm centered indicator (or a custom skeleton via
 *                 `loadingFallback`).
 *   • `error`   — illustration + message + retry CTA via the EmptyState
 *                 component (icon + body + button).
 *   • `empty`   — illustration + message via EmptyState, no CTA needed.
 *   • otherwise — renders `children`.
 *
 * Each state is the EmptyState pattern from #39, just preconfigured. This
 * is the canonical "every async surface has all three states designed"
 * tool the `/state-coverage` audit was looking for.
 */
type AsyncBoundaryProps = {
  state: 'loading' | 'error' | 'empty' | 'ready';
  children: ReactNode;
  /** Custom loading layout (e.g. skeleton list). Defaults to a centered indicator. */
  loadingFallback?: ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
  emptyIllustration?: ReactNode;
  errorTitle?: string;
  errorBody?: string;
  errorIllustration?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
};

function AsyncBoundaryImpl({
  state,
  children,
  loadingFallback,
  emptyTitle,
  emptyBody,
  emptyIllustration,
  errorTitle,
  errorBody,
  errorIllustration,
  onRetry,
  retryLabel,
}: AsyncBoundaryProps) {
  const { palette } = useAppPalette();
  if (state === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        {loadingFallback ?? (
          <ActivityIndicator size="large" color={palette.accent} />
        )}
      </View>
    );
  }
  if (state === 'error') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        <EmptyState
          illustration={errorIllustration}
          title={errorTitle ?? 'Something went wrong'}
          body={errorBody}
          ctaLabel={retryLabel}
          onCta={onRetry}
        />
      </View>
    );
  }
  if (state === 'empty') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        <EmptyState
          illustration={emptyIllustration}
          title={emptyTitle ?? 'Nothing here yet'}
          body={emptyBody}
        />
      </View>
    );
  }
  return <>{children}</>;
}

export const AsyncBoundary = memo(AsyncBoundaryImpl);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
});
