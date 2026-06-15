import { memo } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLiveActivitySettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Live Activity card — task #128.
 *
 * Master toggle pins an ongoing notification (Android) or starts an
 * ActivityKit Live Activity (iOS). On Android the notification is a colorized
 * "Live Update" card (Notification.ProgressStyle day timeline + status-bar
 * chip) tinted with the device's system colour.
 *
 * Off by default — existing users see no change unless they opt in.
 */
function LiveActivityCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update } = useLiveActivitySettings();
  const { palette } = useAppPalette();

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.liveActivity')}
      </Text>

      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.liveActivity')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.liveActivityHelp')}
          </Text>
          {Platform.OS === 'ios' && (
            <Text
              style={[s.help, { color: palette.muted, fontStyle: 'italic' }]}>
              {t('settings.liveActivityExperimental')}
            </Text>
          )}
        </View>
        <Switch
          value={settings.liveActivityEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={v => update({ liveActivityEnabled: v })}
        />
      </View>
    </>
  );
}

export const LiveActivityCard = memo(LiveActivityCardImpl);
