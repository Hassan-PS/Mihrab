// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocationSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { findPreset } from '../../settings/locationPresets';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Quick location switcher chip — task #18 follow-up wiring.
 *
 * Surfaces the current location near the top of HomeScreen as a tappable
 * chip. Opens a small bottom-sheet listing the user's saved location
 * presets so they can switch with one tap (no detour through Settings).
 *
 * Visibility rules — render only when:
 *   • `locationMode === 'manual'` (GPS mode has no static "active location"
 *     to chip), AND
 *   • the user has at least one saved preset (otherwise the chip would
 *     just show their coords with nothing to switch to).
 *
 * The chip itself displays the active preset name when one is selected,
 * or the `manualLocationLabel` / coords as fallback. Switching writes
 * `manualLatitude/Longitude/Label` + `activeLocationPresetId` in one
 * `updateSettings` call so the prayer-day re-fetch is debounced.
 */
function LocationChipImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { slice: settings, update: updateSettings } = useLocationSettings();
  const [open, setOpen] = useState(false);

  const presets = settings.locationPresets ?? [];
  const activePreset = useMemo(
    () => findPreset(presets, settings.activeLocationPresetId),
    [presets, settings.activeLocationPresetId],
  );

  const chipLabel = useMemo(() => {
    if (activePreset) return activePreset.name;
    if (settings.manualLocationLabel) return settings.manualLocationLabel;
    return `${settings.manualLatitude.toFixed(2)}°, ${settings.manualLongitude.toFixed(2)}°`;
  }, [activePreset, settings.manualLocationLabel, settings.manualLatitude, settings.manualLongitude]);

  const onClose = useCallback(() => setOpen(false), []);

  const onPick = useCallback(
    (id: string) => {
      const preset = findPreset(presets, id);
      if (!preset) return;
      updateSettings({
        manualLatitude: preset.latitude,
        manualLongitude: preset.longitude,
        manualLocationLabel: preset.label,
        activeLocationPresetId: preset.id,
      });
      setOpen(false);
    },
    [presets, updateSettings],
  );

  if (settings.locationMode !== 'manual' || presets.length === 0) {
    return null;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.switchLocation')}
        accessibilityHint={chipLabel}
        onPress={() => setOpen(true)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.chip,
          {
            backgroundColor: palette.card,
            borderRadius: RADIUS.full,
            ...cardEdgeStyle(palette),
          },
          pressed && { opacity: 0.7 }, hovered && { opacity: 0.92 },
        ]}>
        <Text
          numberOfLines={1}
          style={[typeStyle('callout'), styles.chipText, { color: palette.text }]}>
          {chipLabel}
        </Text>
        <Text style={[typeStyle('caption'), { color: palette.muted }]}>
          {t('home.switchLocation')}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={onClose}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.switchLocation')}
          style={[styles.backdrop, { backgroundColor: palette.overlay }]}
          onPress={onClose}>
          <Pressable
            // Inner Pressable swallows backdrop taps so the sheet stays open
            // when tapped on its own surface. Not interactive itself — the
            // children (preset rows) carry the accessible affordances.
            accessible={false}
            onPress={() => {}}
            style={[
              styles.sheet,
              {
                backgroundColor: palette.card,
                borderRadius: RADIUS.lg,
                ...cardEdgeStyle(palette),
              },
            ]}>
            <Text style={[typeStyle('headline'), { color: palette.text, marginBottom: SPACING.sm }]}>
              {t('locations.title')}
            </Text>
            {presets.map(preset => {
              const isActive = preset.id === settings.activeLocationPresetId;
              return (
                <Pressable
                  key={preset.id}
                  accessibilityRole="button"
                  accessibilityLabel={preset.name}
                  accessibilityState={{ selected: isActive }}
                  onPress={() => onPick(preset.id)}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.row,
                    isActive && { backgroundColor: palette.accentBg },
                    pressed && { opacity: 0.75 }, hovered && { opacity: 0.92 },
                  ]}>
                  <Text style={[typeStyle('body'), { color: palette.text, flex: 1 }]} numberOfLines={1}>
                    {preset.name}
                  </Text>
                  {isActive ? (
                    <Text
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={[typeStyle('headline'), { color: palette.accent }]}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const LocationChip = memo(LocationChipImpl);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    alignSelf: 'flex-start',
  },
  chipText: { fontWeight: '600', flexShrink: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: SPACING.md,
  },
  sheet: {
    padding: SPACING.md,
    gap: 4,
  },
  row: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
});
