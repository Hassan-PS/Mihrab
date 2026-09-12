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
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAppearanceSettings,
  usePrayerSettings,
  useWidgetSettings,
} from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ColorPickerModal } from '../../components/ColorPickerModal';
import { restartApp as nativeRestartApp } from '../../native/SystemTheme';
import { saveSettings } from '../../settings/storage';
import type { AppAccentId } from '../../settings/types';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import type { ClockFormat } from '../../utils/clockFormat';
import {
  APP_ACCENT_SWATCHES,
  widgetPatchForAccent,
} from '../../settings/widgetAccent';
import {
  addSavedAccent,
  MAX_SAVED_ACCENTS,
  removeSavedAccent,
} from '../../settings/accentColors';
import { SegmentedControl } from '../../components/ui';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

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
  const clock = useClockFormatter();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Two taps to remove a saved colour, the same contract the reciter
  // sheet uses — a swatch is small and a long-press menu for one verb is
  // more chrome than the verb is worth.
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
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
        {Platform.OS === 'android' || Platform.OS === 'ios' ? (
          <SettingsToggleRow
            title={
              Platform.OS === 'ios'
                ? t('settings.liquidGlass', 'Liquid Glass')
                : t('settings.systemDynamicColors')
            }
            help={
              Platform.OS === 'ios'
                ? t(
                    'settings.liquidGlassHelp',
                    'Adopt iOS system colours and translucent glass chrome. Follows Light/Dark automatically.',
                  )
                : t('settings.systemDynamicColorsHelp')
            }
            value={settings.useSystemDynamicTheme}
            // Only answerable while the theme follows the system: there is
            // nothing dynamic to follow once Light or Dark is pinned.
            disabled={settings.appearance !== 'system'}
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

      {!dynamicColorsActive && (
        <SettingsGroup
          footer={t(
            'settings.accentColorHelp',
            'Used across the app and the home-screen widget.',
          )}
        >
          <SettingsBlock>
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
                    accessibilityLabel={t(`settings.accent_${sw.id}`, sw.id)}
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
              {/* The shelf: colours this person kept, newest first. Tapping
                  one applies it; tapping a second time removes it, which
                  is the same two-tap contract the reciter sheet uses. */}
              {settings.savedAccentColors.map(hex => {
                const selected =
                  settings.appAccentId === 'custom' &&
                  settings.appAccentCustomHex.toUpperCase() === hex;
                const arming = pendingRemove === hex;
                return (
                  <Pressable
                    key={hex}
                    accessibilityRole="button"
                    accessibilityLabel={hex}
                    accessibilityHint={
                      arming
                        ? t('common.confirmDelete', 'Tap again to delete')
                        : undefined
                    }
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (arming) {
                        setPendingRemove(null);
                        updateSettings({
                          savedAccentColors: removeSavedAccent(
                            settings.savedAccentColors,
                            hex,
                          ),
                        });
                        return;
                      }
                      if (selected) {
                        // Already the active colour — a second tap on it
                        // is the only unambiguous "remove this one".
                        setPendingRemove(hex);
                        return;
                      }
                      setAccent('custom', hex);
                    }}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: hex,
                        borderColor: arming
                          ? palette.danger
                          : selected
                            ? palette.accent
                            : palette.border,
                        borderWidth: arming || selected ? 3 : 2,
                      },
                    ]}
                  />
                );
              })}

              {/* Add — opens the picker. Hidden once the shelf is full,
                  because a button that can only fail is worse than no
                  button; the oldest colour falls off on save instead. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.accentPickerTitle', 'Custom colour')}
                accessibilityState={{
                  selected: settings.appAccentId === 'custom',
                }}
                onPress={() => {
                  setPendingRemove(null);
                  setPickerOpen(true);
                }}
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
                ]}
              >
                <Text
                  style={[styles.swatchCustomLabel, { color: palette.muted }]}
                >
                  {settings.savedAccentColors.length >= MAX_SAVED_ACCENTS
                    ? t('settings.accent_customAbbr', 'Hex')
                    : '+'}
                </Text>
              </Pressable>
            </View>
          </SettingsBlock>
        </SettingsGroup>
      )}

      <ColorPickerModal
        visible={pickerOpen}
        initial={settings.appAccentCustomHex}
        palette={palette}
        // The ground this accent will sit on. The standard base as a hex
        // rather than `palette.bg`, which can be a PlatformColor the
        // contrast maths cannot read — the picker is unreachable under
        // dynamic colours anyway, but a colour that cannot be measured
        // should not silently measure as black.
        ground={isDark ? '#141210' : '#FAF7F2'}
        onApply={hex => {
          setAccent('custom', hex);
          setPickerOpen(false);
        }}
        onSave={hex => {
          // One write: the colour becomes active AND joins the shelf, so
          // a save that is interrupted cannot leave a colour on the shelf
          // that was never applied, or the other way round.
          updateSettings({
            appAccentId: 'custom',
            appAccentCustomHex: hex,
            savedAccentColors: addSavedAccent(settings.savedAccentColors, hex),
          });
          if (!dynamicColorsActive) updateWidget(widgetPatchForAccent('custom', hex));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

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
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.xl,
  },
  swatchCustom: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  swatchCustomLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '700',
  },
});
