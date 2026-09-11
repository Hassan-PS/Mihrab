// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import notifee from '@notifee/react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * Three banner conditions surfaced above the next-prayer card:
 *   • `usingLocalFallback` — the network provider failed and the widget is
 *     showing on-device adhan computations.
 *   • `exactAlarmDenied` — Android revoked SCHEDULE_EXACT_ALARM (task #3).
 *   • `notifPermDenied` — iOS notification permission denied.
 */
type PermissionBannersProps = {
  usingLocalFallback: boolean;
  exactAlarmDenied: boolean;
  notifPermDenied: boolean;
  onRetryFetch: () => void;
  /**
   * The status bar's height, when these are the first thing on a page
   * that runs to the top edge of the screen — the phone's Today.
   *
   * A banner there was drawn through the clock and behind the camera
   * cutout. It is padding rather than a margin so the tint fills the
   * strip behind the bar rather than leaving a band of page above it.
   */
  topInset?: number;
};

function PermissionBannersImpl({
  usingLocalFallback,
  exactAlarmDenied,
  notifPermDenied,
  onRetryFetch,
  topInset = 0,
}: PermissionBannersProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  if (!usingLocalFallback && !exactAlarmDenied && !notifPermDenied) {
    return null;
  }

  // Only the FIRST banner clears the bar; any others stack under it.
  // The strip runs behind the bar rather than starting under it: the tint
  // fills the top of the screen, so the clock sits on the notice instead
  // of on a band of page above it. Its top corners square off for that.
  const lead =
    topInset > 0
      ? {
          paddingTop: topInset + SPACING.sm,
          borderTopStartRadius: 0,
          borderTopEndRadius: 0,
        }
      : null;
  let first = true;
  const leadStyle = () => {
    if (!first) return null;
    first = false;
    return lead;
  };

  return (
    <>
      {usingLocalFallback && (
        <View style={[styles.banner, { backgroundColor: palette.accentBg }, leadStyle()]}>
          <Text style={[styles.text, { color: palette.text }]}>
            {t('home.localFallbackNotice')}
          </Text>
          <Pressable
            onPress={onRetryFetch}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}>
            <Text style={[styles.action, { color: palette.accent }]}>
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
      )}

      {exactAlarmDenied && (
        <View style={[styles.banner, { backgroundColor: palette.accentBg }, leadStyle()]}>
          <Text
            style={[styles.text, { color: palette.text }]}
            numberOfLines={2}>
            {t('home.exactAlarmDenied')}
          </Text>
          <Pressable
            onPress={() => notifee.openAlarmPermissionSettings().catch(() => {})}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.openSettings')}>
            <Text style={[styles.action, { color: palette.accent }]}>
              {t('common.openSettings')}
            </Text>
          </Pressable>
        </View>
      )}

      {notifPermDenied && (
        <View style={[styles.banner, { backgroundColor: palette.accentBg }, leadStyle()]}>
          <Text
            style={[styles.text, { color: palette.text }]}
            numberOfLines={2}>
            {t('home.notifPermDenied')}
          </Text>
          <Pressable
            onPress={() => Linking.openSettings().catch(() => {})}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.openSettings')}>
            <Text style={[styles.action, { color: palette.accent }]}>
              {t('common.openSettings')}
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

export const PermissionBanners = memo(PermissionBannersImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  text: { flex: 1, fontSize: TYPE.footnote.fontSize, lineHeight: 18 },
  action: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
});
