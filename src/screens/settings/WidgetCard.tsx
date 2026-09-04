// hover-ok: settings-row pressables — pressed feedback is the right affordance.
import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAppearanceSettings,
  useWidgetSettings,
} from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  APP_ACCENT_SWATCHES,
  widgetPatchForAccent,
  widgetSwatchSelected,
} from '../../settings/widgetAccent';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { SettingsBlock, SettingsGroup } from './SettingsGroup';

/**
 * Widget settings card — Android background strength, and the widget's own
 * highlight colour in the one case the app accent cannot supply it.
 *
 * The highlight used to live here as a separate swatch picker, but #127
 * unified it with the app accent in AppearanceCard so users pick a colour
 * once and both follow.
 *
 * THAT UNIFICATION HAD ONE ASSUMPTION, AND IT IS NO LONGER TRUE. It held
 * because turning Material You on sent BOTH to the OS palette, which is
 * why AppearanceCard hides its accent picker in that mode — there was
 * nothing left to choose. Since 2026-08-27 the Android widget does not
 * follow Material You at all. The app still may; the widget takes the
 * colour that was chosen for it. So with system colours on there was a
 * widget with a colour, no picker in Appearance, and nothing here either
 * — a setting the user could see the result of and not change.
 *
 * The picker comes back for exactly that case, and only that case: when
 * the unified one is on screen, a second control writing the same setting
 * would be two answers to one question.
 */
function WidgetCardImpl() {
  const { t } = useTranslation();
  // Subscribes only to the widget slice (task #11) — toggling theme or
  // notifications elsewhere will not re-render this card.
  const { slice: settings, update: updateSettings } = useWidgetSettings();
  // …and to appearance, because whether the unified picker is on screen
  // is what decides whether this card needs one.
  const { slice: appearance } = useAppearanceSettings();
  const { palette, isDark } = useAppPalette();

  // No swatch picker on iOS at all — widget always follows app accent
  // via the AppearanceCard picker, and there is no Android-specific
  // opacity control to render.
  if (Platform.OS !== 'android') {
    return null;
  }

  // The same condition AppearanceCard uses to hide its accent picker.
  const needsOwnPicker =
    appearance.appearance === 'system' && appearance.useSystemDynamicTheme;

  return (
    // No heading: the page is already called Home screen.
    <SettingsGroup
      footer={
        needsOwnPicker
          ? t('settings.widgetConfigureHint')
          : // The widget follows the app accent, so the answer to "where
            // do I change its colour" belongs where the question is asked.
            `${t(
              'settings.widgetColorFollowsAccentHelp',
              'The widget uses the same accent color as the app. Pick it under Appearance.',
            )} ${t('settings.widgetConfigureHint')}`
      }>
      <SettingsBlock>
        <Text style={[styles.label, { color: palette.muted }]}>
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
                opacity: settings.androidWidgetBackgroundOpacity <= 0 ? 0.4 : 1,
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
            <Text style={[styles.stepGlyph, { color: palette.text }]}>−</Text>
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
            <Text style={[styles.stepGlyph, { color: palette.text }]}>+</Text>
          </Pressable>
        </View>
      </SettingsBlock>

      {needsOwnPicker ? (
        <SettingsBlock>
          <Text style={[styles.label, { color: palette.muted }]}>
            {t('settings.widgetHighlight')}
          </Text>
          <View style={styles.swatchRow}>
            {APP_ACCENT_SWATCHES.map(sw => {
              const selected = widgetSwatchSelected(
                sw,
                settings.widgetHighlightId,
                settings.widgetHighlightCustomHex,
              );
              return (
                <Pressable
                  key={sw.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(`settings.accent_${sw.id}`, sw.id)}
                  accessibilityState={{ selected }}
                  onPress={() => updateSettings(widgetPatchForAccent(sw.id))}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: isDark ? sw.dark : sw.light,
                      borderColor: selected ? palette.accent : palette.border,
                      borderWidth: selected ? 3 : 2,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={[styles.help, { color: palette.muted }]}>
            {t(
              'settings.widgetColorOwnHelp',
              'The app is following your system colors, which the widget does not. Pick the widget\u2019s highlight here.',
            )}
          </Text>
        </SettingsBlock>
      ) : null}
    </SettingsGroup>
  );
}

export const WidgetCard = memo(WidgetCardImpl);

const styles = StyleSheet.create({
  // Reads like AppearanceCard's inner labels ("Theme", "Accent color"),
  // not like a second group heading.
  label: { fontSize: 13, marginBottom: 4 },
  help: { fontSize: 13, lineHeight: 18, marginTop: 12 },
  stepGlyph: { fontSize: 20 },
  // Same geometry as the Appearance card's row, so the two read as one
  // control that moved rather than two different pickers.
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
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
