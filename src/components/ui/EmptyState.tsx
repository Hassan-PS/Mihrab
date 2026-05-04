import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { Button } from './Button';

/**
 * EmptyState — task #39 + #42.
 *
 * Illustration + title + body + optional CTA. Used everywhere "nothing
 * here yet" / "search returned empty" / "permission needed" appears.
 * The illustration prop accepts any ReactNode so callers wire in any of
 * the SVG icons from `theme/icons.tsx` or a custom SVG.
 *
 * Design principle (CLAUDE.md): empty states are PART of the design,
 * not afterthoughts. Calm, layout-stable, never alarmist.
 */
type EmptyStateProps = {
  /** Optional illustration (SVG component or icon). */
  illustration?: ReactNode;
  title: string;
  body?: string;
  /** Optional primary CTA. */
  ctaLabel?: string;
  onCta?: () => void;
};

function EmptyStateImpl({
  illustration,
  title,
  body,
  ctaLabel,
  onCta,
}: EmptyStateProps) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.root}>
      {illustration ? <View style={styles.illustration}>{illustration}</View> : null}
      <Text
        style={[typeStyle('title2'), styles.title, { color: palette.text }]}>
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            typeStyle('body'),
            styles.body,
            { color: palette.muted },
          ]}>
          {body}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <View style={styles.ctaRow}>
          <Button label={ctaLabel} onPress={onCta} />
        </View>
      ) : null}
    </View>
  );
}

export const EmptyState = memo(EmptyStateImpl);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  illustration: {
    marginBottom: SPACING.sm,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', maxWidth: 360 },
  ctaRow: { marginTop: SPACING.md },
});
