/**
 * The furniture every first-launch screen shares.
 *
 * One frame, one progress rule, one pair of button shapes — so that six
 * screens written over three phases cannot drift into six layouts. What
 * is NOT here is anything a screen decides for itself: its question, its
 * controls, and what it writes.
 *
 * See docs/design/onboarding-remake.md §6.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { isReduceMotion } from '../theme/motion';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';

/** The reading measure for a linear flow — narrower than a settings page. */
export const ONBOARDING_COLUMN = 560;

/**
 * The hairline that replaced "Step 2 of 4".
 *
 * A sentence the user must read to learn something a line can show
 * (principles.md #4). It is still announced — `progressbar` with a value
 * — because the one thing the string genuinely did was tell a
 * screen-reader user where they were.
 *
 * The track is `muted` at a low opacity rather than `border`: under the
 * iOS Liquid Glass palette `border` is transparent and the rule would
 * simply not be there. The feature tour's dots learned this first.
 */
export function ProgressRule({
  now,
  total,
}: {
  now: number;
  total: number;
}) {
  const { palette } = useAppPalette();
  const { t } = useTranslation();
  const fraction = total > 0 ? Math.min(1, Math.max(0, now / total)) : 0;
  const width = useRef(new Animated.Value(fraction)).current;

  useEffect(() => {
    let alive = true;
    void isReduceMotion().then(reduce => {
      if (!alive) return;
      if (reduce) {
        width.setValue(fraction);
        return;
      }
      Animated.timing(width, {
        toValue: fraction,
        duration: 240,
        easing: Easing.out(Easing.quad),
        // Width cannot run on the native driver; this is two pixels tall
        // and animates once per screen, so the JS thread is fine.
        useNativeDriver: false,
      }).start();
    });
    return () => {
      alive = false;
    };
  }, [fraction, width]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('onboarding.progressA11y', 'Setup progress')}
      accessibilityValue={{ min: 1, max: total, now }}
      style={styles.ruleTrack}>
      {/* The track is its own layer rather than a background with the
          opacity on the parent — the parent's opacity would dim the fill
          along with it, which is the one thing that must stay solid. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.muted, opacity: 0.25 },
        ]}
      />
      {/* A row, not a left-anchored absolute fill: the direction of the
          tree mirrors this for free, so the rule fills from the leading
          edge — the right, in Arabic and Urdu. */}
      <Animated.View
        style={[
          styles.ruleFill,
          {
            backgroundColor: palette.accentSolid,
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

/**
 * The page: safe-area inset, progress rule, a scrolling body capped to a
 * reading measure, and a footer that does not scroll away.
 */
export function OnboardingFrame({
  progress,
  topRow,
  children,
  footer,
  center,
}: {
  progress: { now: number; total: number } | null;
  /** The language chip, the Skip control — whatever sits above the title. */
  topRow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Centre the body in whatever height is left over, instead of stacking
   * it under the top row.
   *
   * For the sparse screens — the greeting, and the alerts screen before
   * it has been answered. Those have a few lines of content and a button
   * at the foot, and top-aligning them left two thirds of a phone empty
   * between the two, which reads as a layout that broke rather than as
   * calm. A screen with rows or a widget in it keeps the top alignment,
   * where the gap is filled and centring would only push the first row
   * away from the title it belongs to.
   */
  center?: boolean;
}) {
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardAwareScroll<ScrollView>();
  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <View style={{ height: insets.top }} />
      {progress ? (
        <ProgressRule now={progress.now} total={progress.total} />
      ) : (
        // Reserve the same two points so the body does not shift when the
        // rule appears on the second screen.
        <View style={styles.ruleTrack} />
      )}
      <ScrollView
        ref={kb.ref}
        automaticallyAdjustKeyboardInsets
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // `flexGrow`, not `flex`: the body still scrolls when it is
          // taller than the screen — a long translation at large text
          // sizes, the shelf on a small phone — and only centres in the
          // slack when there is slack.
          center ? styles.contentCentered : null,
          kb.contentPadding,
        ]}
        keyboardShouldPersistTaps="handled">
        {topRow ? (
          // Outside the centred column: the language chip and the Skip
          // control belong to the top edge of the screen whatever the
          // body does with the space below them.
          <CenteredColumn maxWidth={ONBOARDING_COLUMN}>
            <View style={styles.topRow}>{topRow}</View>
          </CenteredColumn>
        ) : null}
        <CenteredColumn
          maxWidth={ONBOARDING_COLUMN}
          style={center ? styles.bodyCentered : undefined}>
          {children}
        </CenteredColumn>
      </ScrollView>
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, SPACING.lg) },
          ]}>
          <CenteredColumn maxWidth={ONBOARDING_COLUMN}>{footer}</CenteredColumn>
        </View>
      ) : null}
    </View>
  );
}

/** The one primary action a screen is allowed. */
export function PrimaryAction({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { palette } = useAppPalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.primary,
        { backgroundColor: palette.accent, borderRadius: RADIUS.md },
        disabled ? styles.disabled : null,
        pressed && { opacity: 0.85 },
        hovered && { opacity: 0.92 },
      ]}>
      <Text
        style={[typeStyle('headline'), { color: palette.bg }]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Skip, Not now, I'm not sure — everything that is not the main action. */
export function QuietAction({
  label,
  onPress,
  align = 'center',
  testID,
}: {
  label: string;
  onPress: () => void;
  align?: 'center' | 'end';
  testID?: string;
}) {
  const { palette } = useAppPalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.quiet,
        align === 'end' ? styles.quietEnd : null,
        pressed && { opacity: 0.6 },
        hovered && { opacity: 0.92 },
      ]}>
      <Text style={[typeStyle('body'), { color: palette.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The question, as the headline. Body copy only where it changes a decision. */
export function OnboardingHeading({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.heading}>
      <Text
        accessibilityRole="header"
        style={[typeStyle('title1'), styles.title, { color: palette.text }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[typeStyle('body'), styles.body, { color: palette.muted }]}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  ruleTrack: {
    height: 2,
    width: '100%',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  ruleFill: { height: 2 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  contentCentered: { flexGrow: 1 },
  // The body takes the leftover height and sits in the middle of it; the
  // top row above it keeps its own place at the top.
  bodyCentered: { flex: 1, justifyContent: 'center' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 32,
  },
  heading: { gap: SPACING.sm, marginBottom: SPACING.md },
  title: { textAlign: 'center', fontWeight: '700' },
  body: { textAlign: 'center' },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  primary: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  quiet: { paddingVertical: SPACING.sm, alignItems: 'center' },
  quietEnd: { alignItems: 'flex-end' },
});
