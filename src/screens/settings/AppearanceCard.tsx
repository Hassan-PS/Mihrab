// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings, usePrayerSettings, useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ConfirmModal } from '../../components/ConfirmModal';
import { restartApp as nativeRestartApp } from '../../native/SystemTheme';
import { saveSettings } from '../../settings/storage';
import type { AppAccentId } from '../../settings/types';
import {
  APP_ACCENT_SWATCHES,
  widgetPatchForAccent,
} from '../../settings/widgetAccent';
import { cardEdgeStyle, segmentChromeStyle } from '../../theme/chrome';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Appearance card: theme picker (System / Light / Dark), Android system
 * dynamic-colors switch (Material You), and Pure-Black OLED toggle when in
 * dark mode. Subscribes only to the appearance slice (task #11) — toggling a
 * widget color or notifications setting will not re-render this card.
 */
// The swatches and the app-accent → widget-highlight mapping moved to
// src/settings/widgetAccent.ts when the Widget card gained a picker of
// its own: two cards writing the same setting must agree on what each
// colour is, and a copy in each is how they stop agreeing.

function AppearanceCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useAppearanceSettings();
  const { update: updateWidget } = useWidgetSettings();
  // Need the full settings object (not just the appearance slice) so we
  // can synchronously persist a copy with the toggled value before
  // restarting the process — task #114.
  const { settings: fullSettings } = usePrayerSettings();
  const { palette, isDark } = useAppPalette();
  const [accentHexDraft, setAccentHexDraft] = useState(
    settings.appAccentCustomHex,
  );
  useEffect(() => {
    setAccentHexDraft(settings.appAccentCustomHex);
  }, [settings.appAccentCustomHex]);

  // Pending value for the "restart required" themed confirm modal. Null
  // ⇒ hidden; true/false ⇒ the dynamic-colours value the user is trying
  // to switch to, awaiting confirmation.
  const [pendingDynamic, setPendingDynamic] = useState<boolean | null>(null);

  // Persist the toggled value to disk, then restart so PlatformColor /
  // dynamic refs re-resolve. Persist DIRECTLY (not via the async
  // updateSettings save) because the imminent Process.exit can kill an
  // in-flight write, leaving the next launch reading the old value (#114).
  const applyDynamicAndRestart = (v: boolean) => {
    void (async () => {
      try {
        await saveSettings({ ...fullSettings, useSystemDynamicTheme: v });
      } catch (e) {
        console.warn('Failed to persist toggle before restart:', e);
      }
      updateSettings({ useSystemDynamicTheme: v });
      const tryReload = () => {
        try {
          const dev = (
            NativeModules as { DevSettings?: { reload?: () => void } }
          ).DevSettings;
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
        if (nativeRestartApp()) return;
        if (!tryReload()) BackHandler.exitApp();
      } else if (!tryReload()) {
        Alert.alert(
          t('settings.themeRestartManualTitle', 'Reopen the app'),
          t(
            'settings.themeRestartManualBody',
            'iOS does not allow apps to restart themselves. Please force-quit Prayer Times and reopen it for the new theme to take effect.',
          ),
          [{ text: t('common.ok', 'OK'), style: 'default' }],
        );
      }
    })();
  };

  // Picker is hidden under dynamic colors — both app and widget follow OS.
  // Android = Material You; iOS = Liquid Glass (system colours).
  const dynamicColorsActive =
    settings.appearance === 'system' &&
    settings.useSystemDynamicTheme &&
    (Platform.OS === 'android' || Platform.OS === 'ios');

  /**
   * Atomic accent change: write app accent + mirror widget highlight.
   *
   * Per #127 the picker is unified: switching the app accent should
   * also retint the widget so the user sees one color across surfaces.
   * When dynamic colors are on, this sync is skipped (the OS drives
   * both already).
   */
  const setAccent = (id: AppAccentId, customHex?: string) => {
    updateSettings({
      appAccentId: id,
      ...(customHex ? { appAccentCustomHex: customHex } : {}),
    });
    if (!dynamicColorsActive) {
      updateWidget(widgetPatchForAccent(id, customHex));
    }
    // When dynamic colours ARE active the widget is not mirrored, because
    // the widget does not follow Material You any more (2026-08-27) and
    // this picker is hidden in that mode. The Widget card carries the
    // colour control for that case — see WidgetCard.
  };

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
        {(Platform.OS === 'android' || Platform.OS === 'ios') && (
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
                {Platform.OS === 'ios'
                  ? t('settings.liquidGlass', 'Liquid Glass')
                  : t('settings.systemDynamicColors')}
              </Text>
              <Text style={[s.help, { color: palette.muted }]}>
                {Platform.OS === 'ios'
                  ? t(
                      'settings.liquidGlassHelp',
                      'Adopt iOS system colours and translucent glass chrome. Follows Light/Dark automatically.',
                    )
                  : t('settings.systemDynamicColorsHelp')}
              </Text>
            </View>
            <Switch
              value={settings.useSystemDynamicTheme}
              disabled={settings.appearance !== 'system'}
              // Explicit accent so the Switch shows brand green when
              // dynamic colors are off; under dynamic colors,
              // accentSolid resolves to the live system primary (#115).
              trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
              thumbColor={'#ffffff'}
              // Material You / iOS dynamic colors are resolved at
              // view-attach time, so flipping them mid-session leaves
              // stale tints on already-mounted surfaces (#110). Defer the
              // actual change to a themed confirm modal; the Switch is
              // controlled by the persisted value, so until the user
              // confirms it snaps back to its prior position.
              onValueChange={v => setPendingDynamic(v)}
            />
          </View>
        )}
        <Text style={[s.help, { color: palette.muted }]}>
          {t('settings.themeHelp')}
        </Text>
      </View>

      {!dynamicColorsActive && (
        <View
          style={[
            s.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.accentColor', 'Accent color')}
          </Text>
          <View style={styles.swatchRow}>
            {APP_ACCENT_SWATCHES.map(sw => {
              const selected = settings.appAccentId === sw.id;
              return (
                <Pressable
                  key={sw.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    `settings.accent_${sw.id}`,
                    sw.id,
                  )}
                  accessibilityState={{ selected }}
                  onPress={() => setAccent(sw.id)}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.accent_custom', 'Custom')}
              accessibilityState={{ selected: settings.appAccentId === 'custom' }}
              onPress={() => setAccent('custom')}
              style={[
                styles.swatch,
                styles.swatchCustom,
                {
                  backgroundColor: palette.card,
                  borderColor:
                    settings.appAccentId === 'custom'
                      ? palette.accent
                      : palette.border,
                  borderWidth: settings.appAccentId === 'custom' ? 3 : 2,
                },
              ]}>
              <Text
                style={[styles.swatchCustomLabel, { color: palette.muted }]}>
                {t('settings.accent_customAbbr', 'Hex')}
              </Text>
            </Pressable>
          </View>
          {settings.appAccentId === 'custom' ? (
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
              value={accentHexDraft}
              onChangeText={setAccentHexDraft}
              onBlur={() => {
                const trimmed = accentHexDraft.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
                  setAccent('custom', trimmed);
                } else {
                  setAccentHexDraft(settings.appAccentCustomHex);
                }
              }}
              placeholder="#22c55e"
              placeholderTextColor={palette.muted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          ) : null}
          <Text style={[s.help, { color: palette.muted, marginTop: 8 }]}>
            {t(
              'settings.accentColorHelp',
              'Used across the app and the home-screen widget.',
            )}
          </Text>
        </View>
      )}

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
            trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
            thumbColor={'#ffffff'}
            onValueChange={v => updateSettings({ pureBlackDark: v })}
          />
        </View>
      ) : null}

      {/* Also on the Log tab, next to the graph it governs — this is where
          someone looking for it in Settings would go. */}
      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('log.showOnHome')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('log.showOnHomeHelp')}
          </Text>
        </View>
        <Switch
          value={settings.showPracticeOnHome}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={v => updateSettings({ showPracticeOnHome: v })}
        />
      </View>

      <ConfirmModal
        visible={pendingDynamic !== null}
        title={t('settings.themeRestartTitle', 'Restart required')}
        message={t(
          'settings.themeRestartBody',
          'Switching system colors needs the app to restart so every screen picks up the new theme. Restart now?',
        )}
        confirmLabel={t('settings.themeRestartConfirm', 'Restart')}
        cancelLabel={t('common.cancel', 'Cancel')}
        onCancel={() => setPendingDynamic(null)}
        onConfirm={() => {
          const v = pendingDynamic;
          setPendingDynamic(null);
          if (v !== null) applyDynamicAndRestart(v);
        }}
      />
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
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  swatchCustom: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  swatchCustomLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
