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
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useLocationSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { findPreset } from '../../settings/locationPresets';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Compact map-pin icon for the header-mounted LocationChip variant.
 * Same Feather-style stroke vocabulary as `HeaderToolbarIcons` so the
 * three header glyphs (pin, settings) read as a set rather than as
 * mismatched icons from different families.
 */
function PinIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"
        stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx="12" cy="10" r="2.5" stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

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
type Props = {
  /**
   * When true, render as a slim header-mounted icon button (pin glyph
   * + truncated label) rather than the body chip. Used in HomeScreen's
   * navigation header next to the Settings gear so the chip lives in
   * the same row as the other top-level controls.
   */
  compactHeader?: boolean;
  /**
   * Called from the selector's "Add new location" button — the caller
   * routes to Settings (and flashes the Saved Locations section) so the
   * user knows where to add a location.
   */
  onAddLocation?: () => void;
};

function LocationChipImpl({ compactHeader = false, onAddLocation }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { slice: settings, update: updateSettings } = useLocationSettings();
  const [open, setOpen] = useState(false);

  const presets = settings.locationPresets ?? [];
  const activePreset = useMemo(
    () => findPreset(presets, settings.activeLocationPresetId),
    [presets, settings.activeLocationPresetId],
  );

  // Automatic mode is anything that isn't explicit manual entry (GPS).
  const isAuto = settings.locationMode !== 'manual';

  const chipLabel = useMemo(() => {
    if (isAuto) {
      // Prefer the reverse-geocoded city name; fall back to last-known coords,
      // then to a "locating…" placeholder before the first fix lands.
      if (settings.autoLocationLabel) return settings.autoLocationLabel;
      if (
        settings.lastFetchedLatitude != null &&
        settings.lastFetchedLongitude != null
      ) {
        return `${settings.lastFetchedLatitude.toFixed(2)}°, ${settings.lastFetchedLongitude.toFixed(2)}°`;
      }
      return t('home.locating');
    }
    if (activePreset) return activePreset.name;
    if (settings.manualLocationLabel) return settings.manualLocationLabel;
    return `${settings.manualLatitude.toFixed(2)}°, ${settings.manualLongitude.toFixed(2)}°`;
  }, [
    isAuto,
    settings.autoLocationLabel,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    activePreset,
    settings.manualLocationLabel,
    settings.manualLatitude,
    settings.manualLongitude,
    t,
  ]);

  const onClose = useCallback(() => setOpen(false), []);

  // Tapping the chip always opens the location selector — even with no
  // saved presets, since the sheet always offers "Add new location".
  const onPressChip = useCallback(() => setOpen(true), []);

  const onAdd = useCallback(() => {
    setOpen(false);
    onAddLocation?.();
  }, [onAddLocation]);

  const onPick = useCallback(
    (id: string) => {
      const preset = findPreset(presets, id);
      if (!preset) return;
      updateSettings({
        // Picking a saved location switches to manual mode — so the chip
        // works as a real switcher even when currently on automatic.
        locationMode: 'manual',
        manualLatitude: preset.latitude,
        manualLongitude: preset.longitude,
        manualLocationLabel: preset.label,
        activeLocationPresetId: preset.id,
      });
      setOpen(false);
    },
    [presets, updateSettings],
  );

  // The chip always renders now — in manual mode it shows the saved
  // location, in automatic mode the reverse-geocoded city + an "Auto" badge
  // so the current location is always visible next to the gear.

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.switchLocation')}
        accessibilityHint={chipLabel}
        onPress={onPressChip}
        hitSlop={compactHeader ? 10 : undefined}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) =>
          compactHeader
            ? [
                styles.headerPin,
                pressed && { opacity: 0.6 },
                hovered && { opacity: 0.85 },
              ]
            : [
                styles.chip,
                {
                  backgroundColor: palette.card,
                  borderRadius: RADIUS.full,
                  ...cardEdgeStyle(palette),
                },
                pressed && { opacity: 0.7 },
                hovered && { opacity: 0.92 },
              ]
        }>
        {compactHeader ? (
          // Pin glyph + the active location's name. The label is
          // truncated to a single line with ellipsis so a long preset
          // name (e.g. "Stockholm, Sweden") doesn't push the Settings
          // gear off-screen on smaller iPhones; full name is in the
          // accessibilityHint above for screen-reader users.
          <View style={styles.headerPinRow}>
            <PinIcon color={palette.accentSolid} size={20} />
            {/* City name + an inline "· Auto" suffix in the accent colour.
                Nested Text (rather than a sibling pill) is used deliberately:
                iOS's native header wraps headerRight in a glass capsule that
                drops extra flex children, so a separate badge View vanished
                there. An inline nested Text always renders. */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.headerPinLabel, { color: palette.text }]}>
              {chipLabel}
              {isAuto ? (
                <Text style={{ color: palette.accentSolid }}>
                  {'  '}
                  {t('home.autoBadge')}
                </Text>
              ) : null}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.chipLabelRow}>
              <Text
                numberOfLines={1}
                style={[typeStyle('callout'), styles.chipText, { color: palette.text }]}>
                {chipLabel}
              </Text>
              {isAuto ? (
                <Text
                  style={[
                    styles.autoBadge,
                    {
                      color: palette.accent,
                      backgroundColor: palette.accentBg,
                    },
                  ]}>
                  {t('home.autoBadge')}
                </Text>
              ) : null}
            </View>
            <Text style={[typeStyle('caption'), { color: palette.muted }]}>
              {t('home.switchLocation')}
            </Text>
          </>
        )}
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
            {presets.length === 0 ? (
              <Text
                style={[
                  typeStyle('callout'),
                  { color: palette.muted, marginBottom: SPACING.sm },
                ]}>
                {t('locations.empty')}
              </Text>
            ) : null}
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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('locations.add')}
              onPress={onAdd}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.addRow,
                { borderTopColor: palette.border },
                pressed && { opacity: 0.7 },
                hovered && { opacity: 0.92 },
              ]}>
              <Text style={[typeStyle('body'), styles.addLabel, { color: palette.accent }]}>
                + {t('locations.add')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const LocationChip = memo(LocationChipImpl);

const styles = StyleSheet.create({
  // Slim header-mounted variant: pin glyph + truncated location label,
  // sitting in the same icon-row context as HeaderToolbarIcons. The
  // maxWidth keeps a long preset name from pushing the Settings gear
  // off the right edge on the smallest supported iPhones (~375 pt).
  headerPin: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    // Roomier than before so the city name AND the "Auto" badge both fit; the
    // label truncates (numberOfLines=1) before the badge gets squeezed out.
    maxWidth: 210,
  },
  headerPinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  headerPinLabel: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  chipLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  // Small "Auto" pill shown when the app is on automatic (GPS) location.
  // flexShrink:0 so it never gets squeezed out — the city label truncates
  // instead (seen clipped on iOS where the name filled the whole chip).
  autoBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    flexShrink: 0,
  },
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
  addRow: {
    marginTop: 4,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addLabel: {
    fontWeight: '600',
  },
});
