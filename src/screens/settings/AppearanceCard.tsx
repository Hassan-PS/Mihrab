// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import {
  Alert,
  BackHandler,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { restartApp as nativeRestartApp } from '../../native/SystemTheme';
import { cardEdgeStyle, segmentChromeStyle } from '../../theme/chrome';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Appearance card: theme picker (System / Light / Dark), Android system
 * dynamic-colors switch (Material You), and Pure-Black OLED toggle when in
 * dark mode. Subscribes only to the appearance slice (task #11) — toggling a
 * widget color or notifications setting will not re-render this card.
 */
function AppearanceCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useAppearanceSettings();
  const { palette, isDark } = useAppPalette();

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.appearance')}
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <Text style={[s.label, { color: palette.muted }]}>
          {t('settings.theme')}
        </Text>
        <View
          style={s.segmentRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.theme')}>
          {(
            [
              { id: 'system' as const, label: t('settings.themeSystem') },
              { id: 'light' as const, label: t('settings.themeLight') },
              { id: 'dark' as const, label: t('settings.themeDark') },
            ] as const
          ).map(opt => (
            <Pressable
              key={opt.id}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: settings.appearance === opt.id }}
              style={[
                s.segment,
                styles.appearanceSegment,
                segmentChromeStyle(palette, settings.appearance === opt.id),
              ]}
              onPress={() => updateSettings({ appearance: opt.id })}>
              <Text
                style={[
                  styles.appearanceSegmentLabel,
                  { color: palette.text },
                  settings.appearance === opt.id && { color: palette.accent },
                ]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {Platform.OS === 'android' && (
          <View
            style={[
              s.switchRow,
              {
                marginTop: 14,
                opacity: settings.appearance === 'system' ? 1 : 0.45,
              },
            ]}
            pointerEvents={settings.appearance === 'system' ? 'auto' : 'none'}>
            <View style={s.switchCopy}>
              <Text style={[s.valueText, { color: palette.text }]}>
                {t('settings.systemDynamicColors')}
              </Text>
              <Text style={[s.help, { color: palette.muted }]}>
                {t('settings.systemDynamicColorsHelp')}
              </Text>
            </View>
            <Switch
              value={settings.useSystemDynamicTheme}
              disabled={settings.appearance !== 'system'}
              onValueChange={v => {
                // Material You / iOS dynamic colors are resolved at
                // view-attach time, so flipping them mid-session leaves
                // stale tints on already-mounted surfaces (#110). Confirm
                // with the user, then save + restart on yes / revert on
                // no — the toggle should not flip if they decline.
                Alert.alert(
                  t('settings.themeRestartTitle', 'Restart required'),
                  t(
                    'settings.themeRestartBody',
                    'Switching system colors needs the app to restart so every screen picks up the new theme. Restart now?',
                  ),
                  [
                    {
                      text: t('common.cancel', 'Cancel'),
                      style: 'cancel',
                      onPress: () => {
                        // Do nothing — the Switch is uncontrolled in
                        // RN's onValueChange model; since we never
                        // called updateSettings the persisted value is
                        // unchanged and the next render snaps the
                        // switch back to its prior position.
                      },
                    },
                    {
                      text: t('settings.themeRestartConfirm', 'Restart'),
                      style: 'destructive',
                      onPress: () => {
                        // Persist the new value first.
                        updateSettings({ useSystemDynamicTheme: v });
                        // Try the native dev-settings reload (works in
                        // dev + on a prod bridge that has it linked),
                        // then fall back to BackHandler.exitApp on
                        // Android. iOS has no programmatic restart;
                        // surface a follow-up alert telling the user
                        // to reopen the app manually.
                        const tryReload = () => {
                          try {
                            const dev = (NativeModules as { DevSettings?: { reload?: () => void } })
                              .DevSettings;
                            if (dev?.reload) {
                              dev.reload();
                              return true;
                            }
                          } catch {
                            // ignore
                          }
                          return false;
                        };
                        if (Platform.OS === 'android') {
                          // Try the proper native restart first — this
                          // launches a fresh Activity and kills the
                          // process so PlatformColor refs re-resolve.
                          // Falls back to the dev reload, then to a
                          // cold exit if neither is available.
                          if (nativeRestartApp()) return;
                          if (!tryReload()) {
                            BackHandler.exitApp();
                          }
                        } else {
                          // iOS: try reload, otherwise prompt manual.
                          if (!tryReload()) {
                            Alert.alert(
                              t('settings.themeRestartManualTitle', 'Reopen the app'),
                              t(
                                'settings.themeRestartManualBody',
                                'iOS does not allow apps to restart themselves. Please force-quit Prayer Times and reopen it for the new theme to take effect.',
                              ),
                              [{ text: t('common.ok', 'OK'), style: 'default' }],
                            );
                          }
                        }
                      },
                    },
                  ],
                );
              }}
            />
          </View>
        )}
        <Text style={[s.help, { color: palette.muted }]}>
          {t('settings.themeHelp')}
        </Text>
      </View>

      {isDark ? (
        <View
          style={[
            s.card,
            s.switchRow,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={s.switchCopy}>
            <Text style={[s.valueText, { color: palette.text }]}>
              {t('settings.pureBlack')}
            </Text>
            <Text style={[s.help, { color: palette.muted }]}>
              {t('settings.pureBlackHelp')}
            </Text>
          </View>
          <Switch
            value={settings.pureBlackDark}
            onValueChange={v => updateSettings({ pureBlackDark: v })}
          />
        </View>
      ) : null}
    </>
  );
}

export const AppearanceCard = memo(AppearanceCardImpl);

const styles = StyleSheet.create({
  appearanceSegment: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  appearanceSegmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
