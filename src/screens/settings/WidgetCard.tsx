// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Widget settings card — Android background opacity stepper only.
 *
 * The widget highlight color used to live here as a separate swatch
 * picker, but #127 unified it with the app accent in AppearanceCard
 * so users pick a color once and both follow. Setting the app accent
 * mirrors `widgetHighlightId` / `widgetHighlightCustomHex`; setting
 * dynamic colors flips both back to OS Material You / iOS dynamic.
 */
function WidgetCardImpl() {
  const { t } = useTranslation();
  // Subscribes only to the widget slice (task #11) — toggling theme or
  // notifications elsewhere will not re-render this card.
  const { slice: settings, update: updateSettings } = useWidgetSettings();
  const { palette } = useAppPalette();

  // No swatch picker on iOS at all — widget always follows app accent
  // via the AppearanceCard picker, and there is no Android-specific
  // opacity control to render.
  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.homeScreenWidget')}
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <Text style={[s.label, { color: palette.muted }]}>
          {t('settings.widgetBackgroundOpacity')}
        </Text>
        <View style={styles.widgetOpacityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetBackgroundOpacity')}
            style={[
              styles.widgetOpacityBtn,
              {
                borderColor: palette.border,
                opacity:
                  settings.androidWidgetBackgroundOpacity <= 0 ? 0.4 : 1,
              },
            ]}
            disabled={settings.androidWidgetBackgroundOpacity <= 0}
            onPress={() =>
              updateSettings({
                androidWidgetBackgroundOpacity: Math.max(
                  0,
                  settings.androidWidgetBackgroundOpacity - 4,
                ),
              })
            }>
            <Text style={{ color: palette.text, fontSize: 20 }}>−</Text>
          </Pressable>
          <Text
            style={[
              styles.widgetOpacityValue,
              tabularNumeralStyle,
              { color: palette.text },
            ]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {settings.androidWidgetBackgroundOpacity}%
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetBackgroundOpacity')}
            style={[
              styles.widgetOpacityBtn,
              {
                borderColor: palette.border,
                opacity:
                  settings.androidWidgetBackgroundOpacity >= 100 ? 0.4 : 1,
              },
            ]}
            disabled={settings.androidWidgetBackgroundOpacity >= 100}
            onPress={() =>
              updateSettings({
                androidWidgetBackgroundOpacity: Math.min(
                  100,
                  settings.androidWidgetBackgroundOpacity + 4,
                ),
              })
            }>
            <Text style={{ color: palette.text, fontSize: 20 }}>+</Text>
          </Pressable>
        </View>
        <Text style={[s.help, { color: palette.muted, marginTop: 16 }]}>
          {t(
            'settings.widgetColorFollowsAccentHelp',
            'The widget uses the same accent color as the app. Pick it under Appearance.',
          )}
        </Text>
        <Text style={[s.help, { color: palette.muted }]}>
          {t('settings.widgetConfigureHint')}
        </Text>
      </View>
    </>
  );
}

export const WidgetCard = memo(WidgetCardImpl);

const styles = StyleSheet.create({
  widgetOpacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 8,
  },
  widgetOpacityBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetOpacityValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 52,
    textAlign: 'center',
  },
});
