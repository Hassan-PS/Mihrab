// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  FIXED_LABEL_MAX_FONT_SCALE,
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import type { WidgetHighlightId } from '../../settings/types';
import { sharedSettingsStyles as s } from './sharedStyles';

const WIDGET_HIGHLIGHT_SWATCHES: {
  id: Exclude<WidgetHighlightId, 'custom' | 'dynamic'>;
  hex: string;
}[] = [
  { id: 'green', hex: '#6BC98A' },
  { id: 'teal', hex: '#4EC9B0' },
  { id: 'blue', hex: '#6BA3F5' },
  { id: 'amber', hex: '#E5C07B' },
];

/**
 * Widget settings card: Android background opacity stepper, color swatch
 * picker (dynamic + 4 presets + custom hex), and the validated hex input
 * shown when "custom" is selected.
 */
function WidgetCardImpl() {
  const { t } = useTranslation();
  // Subscribes only to the widget slice (task #11) — toggling theme or
  // notifications elsewhere will not re-render this card.
  const { slice: settings, update: updateSettings } = useWidgetSettings();
  const { palette } = useAppPalette();
  const [widgetHexDraft, setWidgetHexDraft] = useState(
    settings.widgetHighlightCustomHex,
  );

  useEffect(() => {
    setWidgetHexDraft(settings.widgetHighlightCustomHex);
  }, [settings.widgetHighlightCustomHex]);

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
        {Platform.OS === 'android' ? (
          <>
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
          </>
        ) : null}

        <Text
          style={[
            s.label,
            {
              color: palette.muted,
              marginTop: Platform.OS === 'android' ? 16 : 0,
            },
          ]}>
          {t('settings.widgetHighlight')}
        </Text>
        <View style={styles.widgetSwatchRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetHighlight_dynamic')}
            onPress={() => updateSettings({ widgetHighlightId: 'dynamic' })}
            style={[
              styles.widgetSwatch,
              styles.widgetSwatchCustom,
              {
                backgroundColor: palette.card,
                borderColor:
                  settings.widgetHighlightId === 'dynamic'
                    ? palette.accent
                    : palette.border,
                borderWidth: settings.widgetHighlightId === 'dynamic' ? 3 : 2,
              },
            ]}>
            <Text
              style={[styles.widgetSwatchCustomLabel, { color: palette.muted }]}
              maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
              {t('settings.widgetHighlight_dynamicAbbr')}
            </Text>
          </Pressable>
          {WIDGET_HIGHLIGHT_SWATCHES.map(sw => {
            const selected = settings.widgetHighlightId === sw.id;
            return (
              <Pressable
                key={sw.id}
                accessibilityRole="button"
                accessibilityLabel={t(`settings.widgetHighlight_${sw.id}`)}
                onPress={() => updateSettings({ widgetHighlightId: sw.id })}
                style={[
                  styles.widgetSwatch,
                  {
                    backgroundColor: sw.hex,
                    borderColor: selected ? palette.accent : palette.border,
                    borderWidth: selected ? 3 : 2,
                  },
                ]}
              />
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetHighlight_custom')}
            onPress={() => updateSettings({ widgetHighlightId: 'custom' })}
            style={[
              styles.widgetSwatch,
              styles.widgetSwatchCustom,
              {
                backgroundColor: palette.card,
                borderColor:
                  settings.widgetHighlightId === 'custom'
                    ? palette.accent
                    : palette.border,
                borderWidth: settings.widgetHighlightId === 'custom' ? 3 : 2,
              },
            ]}>
            <Text
              style={[styles.widgetSwatchCustomLabel, { color: palette.muted }]}
              maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
              {t('settings.widgetHighlight_customAbbr')}
            </Text>
          </Pressable>
        </View>

        {settings.widgetHighlightId === 'custom' ? (
          <TextInput
            style={[
              s.input,
              {
                marginTop: 10,
                borderColor: palette.border,
                color: palette.text,
                backgroundColor: palette.bg,
              },
            ]}
            value={widgetHexDraft}
            onChangeText={setWidgetHexDraft}
            onBlur={() => {
              const trimmed = widgetHexDraft.trim();
              if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
                updateSettings({ widgetHighlightCustomHex: trimmed });
              } else {
                setWidgetHexDraft(settings.widgetHighlightCustomHex);
              }
            }}
            placeholder={t('settings.widgetHighlightHexPlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        ) : null}

        <Text style={[s.help, { color: palette.muted }]}>
          {t('settings.widgetHighlightDynamicHelp')}
        </Text>
        {Platform.OS === 'android' ? (
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.widgetConfigureHint')}
          </Text>
        ) : null}
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
  widgetSwatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  widgetSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  widgetSwatchCustom: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  widgetSwatchCustomLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
