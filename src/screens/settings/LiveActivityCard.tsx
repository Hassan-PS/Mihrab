// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLiveActivitySettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Live Activity card — task #128.
 *
 * Master toggle pins an ongoing notification (Android) or starts an
 * ActivityKit Live Activity (iOS, lands in task #129). When ON, the
 * customisation sub-toggles reveal so the user can shape the surface.
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
        </View>
        <Switch
          value={settings.liveActivityEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={v => update({ liveActivityEnabled: v })}
        />
      </View>

      {/*
       * Hijri date and Location toggles intentionally removed in
       * v2.1.0-beta.5 — they cluttered the notification header and the
       * user didn't want them surfacing in the Live Activity.
       *
       * Sunrise is now always shown in the prayer list (no toggle) —
       * it's a useful data point (end of Fajr window / start of
       * forbidden prayer time) and most users want it visible.
       */}
    </>
  );
}

export const LiveActivityCard = memo(LiveActivityCardImpl);
