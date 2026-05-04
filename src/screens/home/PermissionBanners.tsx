// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import notifee from '@notifee/react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';

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
};

function PermissionBannersImpl({
  usingLocalFallback,
  exactAlarmDenied,
  notifPermDenied,
  onRetryFetch,
}: PermissionBannersProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  if (!usingLocalFallback && !exactAlarmDenied && !notifPermDenied) {
    return null;
  }

  return (
    <>
      {usingLocalFallback && (
        <View style={[styles.banner, { backgroundColor: palette.accentBg }]}>
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
        <View style={[styles.banner, { backgroundColor: palette.accentBg }]}>
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
        <View style={[styles.banner, { backgroundColor: palette.accentBg }]}>
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
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  action: { fontSize: 13, fontWeight: '600' },
});
