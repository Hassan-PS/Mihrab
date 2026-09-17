// tokens-ok: the hex-input placeholder is an example hex, not a colour in use
// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useState } from 'react';
import {
  Alert,
  BackHandler,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAppearanceSettings,
  usePrayerSettings,
} from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { AccentShelf } from '../../components/AccentShelf';
import { ConfirmModal } from '../../components/ConfirmModal';
import { restartApp as nativeRestartApp } from '../../native/SystemTheme';
import { saveSettings } from '../../settings/storage';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import type { ClockFormat } from '../../utils/clockFormat';
import { SegmentedControl } from '../../components/ui';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';
import { SPACING } from '../../theme/tokens';

/**
 * Appearance card: theme picker (System / Light / Dark), the colour theme
 * (Classic, or one of the accent presets — picking a preset themes dark
 * mode in it, `tintedSurfaces`), the system dynamic-colours switch
 * (Material You / Liquid Glass) as the alternative to a chosen colour, and
 * the Pure-Black OLED toggle when in dark mode. Subscribes only to the appearance slice
 * (task #11) — toggling a widget color or notifications setting will not
 * re-render this card.
 */
// The swatches and the app-accent → widget-highlight mapping moved to
// src/settings/widgetAccent.ts when the Widget card gained a picker of
// its own: two cards writing the same setting must agree on what each
// colour is, and a copy in each is how they stop agreeing.

function AppearanceCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useAppearanceSettings();
  // Need the full settings object (not just the appearance slice) so we
  // can synchronously persist a copy with the toggled value before
  // restarting the process — task #114.
  const { settings: fullSettings } = usePrayerSettings();
  const { palette, isDark } = useAppPalette();
  const clock = useClockFormatter();
  // Pending value for the "restart required" themed confirm modal. Null
  // ⇒ hidden; true/false ⇒ the dynamic-colours value the user is trying
  // to switch to, awaiting confirmation.
  const [pendingDynamic, setPendingDynamic] = useState<boolean | null>(null);

  // Persist the toggled value to disk, then restart so PlatformColor /
  // dynamic refs re-resolve. Persist DIRECTLY (not via the async
  // updateSettings save) because the imminent Process.exit can kill an
  // in-flight write, leaving the next launch reading the old value (#114).
  // Turning system colours ON clears Verdant — the two themes cannot share
  // a palette.
  const applyDynamicAndRestart = (v: boolean) => {
    void (async () => {
      const next = {
        ...fullSettings,
        useSystemDynamicTheme: v,
        ...(v ? { tintedSurfaces: false } : {}),
      };
      try {
        await saveSettings(next);
      } catch (e) {
        console.warn('Failed to persist toggle before restart:', e);
      }
      updateSettings({
        useSystemDynamicTheme: v,
        ...(v ? { tintedSurfaces: false } : {}),
      });
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
    settings.useSystemDynamicTheme &&
    (Platform.OS === 'android' || Platform.OS === 'ios');
  const verdantActive = settings.tintedSurfaces && !dynamicColorsActive;

  return (
    <>
      <SettingsGroup
        title={t('settings.appearance')}
        footer={t('settings.themeHelp')}
      >
        <SettingsBlock>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.theme')}
          </Text>
          <SegmentedControl
            accessibilityLabel={t('settings.theme')}
            segments={[
              { key: 'system', label: t('settings.themeSystem') },
              { key: 'light', label: t('settings.themeLight') },
              { key: 'dark', label: t('settings.themeDark') },
            ]}
            value={settings.appearance}
            onChange={appearance => updateSettings({ appearance })}
          />
        </SettingsBlock>

        {/* Colour theme — the alternative to system colours. Classic is the
            app's own paper and ink; a preset themes dark mode in that colour
            (light stays classic). Custom colours are an accent only, since
            free-form washes are barred from the surfaces. Hidden under
            system colours, which own the palette. */}
        {!dynamicColorsActive && (
          <SettingsBlock>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.colourTheme', 'Colour theme')}
            </Text>
            <View style={styles.shelf}>
              <AccentShelf
                testIDPrefix="appearance"
                classic={{
                  selected: !settings.tintedSurfaces,
                  label: t('settings.classicTheme', 'Classic'),
                  onPress: () => updateSettings({ tintedSurfaces: false }),
                }}
                onPick={id =>
                  // A preset is the theme; a custom colour is an accent only.
                  updateSettings({ tintedSurfaces: id !== 'custom' })
                }
              />
            </View>
            <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
              {t(
                'settings.colourThemeHelp',
                'Classic keeps the app’s own paper and ink. Pick a colour to theme dark mode in it — light mode stays classic.',
              )}
            </Text>
          </SettingsBlock>
        )}
        {Platform.OS === 'android' || Platform.OS === 'ios' ? (
          <SettingsToggleRow
            title={
              Platform.OS === 'ios'
                ? t('settings.liquidGlass', 'Liquid Glass')
                : t('settings.systemDynamicColors')
            }
            help={
              verdantActive
                ? t(
                    'settings.verdantThemeSystemDisabled',
                    'A colour theme is active — choose Classic to use system colours.',
                  )
                : Platform.OS === 'ios'
                  ? t(
                      'settings.liquidGlassHelp',
                      'Adopt iOS system colours and translucent glass chrome. Follows Light/Dark automatically.',
                    )
                  : t('settings.systemDynamicColorsHelp')
            }
            value={settings.useSystemDynamicTheme}
            // Answerable under Light and Dark as well as System. Pinning a
            // mode says which mode is drawn, not where its colours come
            // from — "dark, in my wallpaper's colours" is a reasonable ask
            // and used to be unsayable. Verdant still owns the palette
            // when it is on, because two colour sources cannot both win.
            disabled={verdantActive}
            // Material You / iOS dynamic colors are resolved at view-attach
            // time, so flipping them mid-session leaves stale tints on
            // already-mounted surfaces (#110). Defer the actual change to a
            // themed confirm modal; the switch is controlled by the
            // persisted value, so until the user confirms it snaps back to
            // its prior position.
            onValueChange={v => setPendingDynamic(v)}
          />
        ) : null}

        {isDark ? (
          <SettingsToggleRow
            title={t('settings.pureBlack')}
            help={t('settings.pureBlackHelp')}
            value={settings.pureBlackDark}
            onValueChange={v => updateSettings({ pureBlackDark: v })}
          />
        ) : null}
      </SettingsGroup>

      {/* Time format — issue #18.

          Its own card rather than a row under Theme: it is not about
          light and dark, and someone looking for it is looking for a
          heading that says so. The example underneath is rendered by the
          same formatter the rest of the app uses, so what is shown here
          is literally what a prayer row will show. */}
      <SettingsGroup footer={t('settings.clockFormatHelp')}>
        <SettingsBlock>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.clockFormat', 'Time format')}
          </Text>
          <SegmentedControl
            accessibilityLabel={t('settings.clockFormat', 'Time format')}
            segments={
              [
                { key: 'auto', label: t('settings.clockFormatAuto', 'Automatic') },
                { key: '12', label: t('settings.clockFormat12', '12-hour') },
                { key: '24', label: t('settings.clockFormat24', '24-hour') },
              ] as ReadonlyArray<{ key: ClockFormat; label: string }>
            }
            value={settings.clockFormat}
            onChange={clockFormat => updateSettings({ clockFormat })}
          />
          <Text style={[s.help, { color: palette.muted, marginTop: SPACING.md }]}>
            {t('settings.clockFormatExample', {
              defaultValue: 'For example: {{time}}',
              time: clock('17:31'),
            })}
          </Text>
        </SettingsBlock>
      </SettingsGroup>

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
  // The label's own `marginBottom` is the settings scale's tightest; a
  // row of 44pt circles needs more air under a caption than a line of
  // text does.
  shelf: { marginTop: SPACING.sm },
});
