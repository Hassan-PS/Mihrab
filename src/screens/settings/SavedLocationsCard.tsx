// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocationSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle, inputChromeStyle } from '../../theme/chrome';
import {
  addPreset,
  deletePreset,
  MAX_LOCATION_PRESETS,
} from '../../settings/locationPresets';
import { PlaceSearchSection } from '../../components/PlaceSearchSection';
import type { GeocodedPlace } from '../../geocoding/nominatim';
import { sharedSettingsStyles as s } from './sharedStyles';

/** Coords are "the same place" if they round to the same 4-decimal value
 *  (~11 m precision). Used to reject duplicate saves of the same spot
 *  under different names — that's the bug behind #79. */
function sameCoord(a: number, b: number): boolean {
  return Math.round(a * 1e4) === Math.round(b * 1e4);
}

/**
 * Saved-locations card — task #18.
 *
 * Lets the user keep multiple named locations (Home / Work / Travel) and
 * switch between them with one tap. Coordinates are PII; the underlying
 * `locationPresets` array lives in encrypted storage (task #16 + #18).
 *
 * UI states:
 *   • Empty — shows help text + "Save current as…" button.
 *   • Populated — list of presets with use/delete actions; "Save current"
 *     button at the bottom (hidden when limit reached).
 *   • Adding — inline name input replaces the bottom button.
 *
 * Only renders when locationMode === 'manual'. Saving a GPS location as a
 * preset doesn't make sense — task #18's spec is about switching between
 * manual locations.
 */
function SavedLocationsCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useLocationSettings();
  const { palette } = useAppPalette();
  const [draftName, setDraftName] = useState('');
  const [draftPlace, setDraftPlace] = useState<GeocodedPlace | null>(null);
  const [draftLatStr, setDraftLatStr] = useState('');
  const [draftLngStr, setDraftLngStr] = useState('');
  const [adding, setAdding] = useState(false);

  if (settings.locationMode !== 'manual') return null;

  const presets = settings.locationPresets ?? [];
  const limitReached = presets.length >= MAX_LOCATION_PRESETS;

  const onUse = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    updateSettings({
      manualLatitude: preset.latitude,
      manualLongitude: preset.longitude,
      manualLocationLabel: preset.label,
      activeLocationPresetId: preset.id,
    });
  };

  const onDelete = (id: string) => {
    updateSettings({
      locationPresets: deletePreset(presets, id),
      // If the deleted preset was active, clear the active id. The current
      // manualLatitude/Longitude stay — user keeps using those coords until
      // they pick a different preset or edit manually.
      activeLocationPresetId:
        settings.activeLocationPresetId === id
          ? undefined
          : settings.activeLocationPresetId,
    });
  };

  const onSaveCurrent = () => {
    const name = draftName.trim();
    if (!name) return;

    // Resolve the coords to save:
    //   1) Place picked from search → its lat/lng + display label
    //   2) Manual lat/lng typed in the inputs → parsed numbers
    //   3) Fall back to the current `manual*` (legacy behavior)
    let lat: number | null = null;
    let lng: number | null = null;
    let label: string | undefined;

    if (draftPlace) {
      lat = draftPlace.latitude;
      lng = draftPlace.longitude;
      label = draftPlace.displayName;
    } else if (draftLatStr.trim() || draftLngStr.trim()) {
      const parsedLat = parseFloat(draftLatStr.replace(',', '.'));
      const parsedLng = parseFloat(draftLngStr.replace(',', '.'));
      if (
        !Number.isFinite(parsedLat) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        !Number.isFinite(parsedLng) ||
        parsedLng < -180 ||
        parsedLng > 180
      ) {
        Alert.alert(
          t('locations.invalidCoordsTitle', 'Invalid coordinates'),
          t('locations.invalidCoordsBody', 'Latitude must be between -90 and 90, longitude between -180 and 180.'),
        );
        return;
      }
      lat = parsedLat;
      lng = parsedLng;
    } else {
      lat = settings.manualLatitude;
      lng = settings.manualLongitude;
      label = settings.manualLocationLabel;
    }

    // Reject the explicit "no location set" sentinel (0, 0) — most likely
    // user landed here without picking a real place.
    if (lat == null || lng == null || (lat === 0 && lng === 0)) {
      Alert.alert(
        t('locations.invalidCoordsTitle', 'Invalid coordinates'),
        t('locations.pickAPlace', 'Search for a city or enter coordinates first.'),
      );
      return;
    }

    // Reject duplicates of an existing preset — addresses the user's bug
    // report that saving "different names" kept producing the same coords.
    const dupe = presets.find(
      p => sameCoord(p.latitude, lat as number) && sameCoord(p.longitude, lng as number),
    );
    if (dupe) {
      Alert.alert(
        t('locations.duplicateTitle', 'Already saved'),
        t(
          'locations.duplicateBody',
          'A location at these coordinates is already saved as "{{name}}".',
          { name: dupe.name },
        ),
      );
      return;
    }

    const next = addPreset(presets, {
      name,
      latitude: lat,
      longitude: lng,
      label,
    });
    const newPreset = next[next.length - 1];
    updateSettings({
      locationPresets: next,
      activeLocationPresetId: newPreset?.id,
      // Switch the manual location to the just-saved preset so the rest
      // of the app immediately reflects the user's choice.
      manualLatitude: lat,
      manualLongitude: lng,
      manualLocationLabel: label,
    });
    setDraftName('');
    setDraftPlace(null);
    setDraftLatStr('');
    setDraftLngStr('');
    setAdding(false);
  };

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('locations.title')}
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        {presets.length === 0 ? (
          <Text style={[s.help, { color: palette.muted }]}>
            {t('locations.empty')}
          </Text>
        ) : (
          <View style={styles.list}>
            {presets.map(p => {
              const isActive = settings.activeLocationPresetId === p.id;
              return (
                <View
                  key={p.id}
                  style={[
                    styles.row,
                    isActive && { backgroundColor: palette.accentBg },
                  ]}>
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.rowName, { color: palette.text }]}
                      numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text
                      style={[styles.rowSub, { color: palette.muted }]}
                      numberOfLines={1}>
                      {p.label ??
                        `${p.latitude.toFixed(4)}°, ${p.longitude.toFixed(4)}°`}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('locations.use')}: ${p.name}`}
                      accessibilityState={{ selected: isActive }}
                      onPress={() => onUse(p.id)}
                      hitSlop={8}
                      style={styles.actionBtn}>
                      <Text
                        style={[
                          styles.actionLabel,
                          { color: isActive ? palette.muted : palette.accent },
                        ]}>
                        {t('locations.use')}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('locations.delete')}: ${p.name}`}
                      onPress={() => onDelete(p.id)}
                      hitSlop={8}
                      style={styles.actionBtn}>
                      <Text style={[styles.actionLabel, styles.deleteLabel]}>
                        {t('locations.delete')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {adding ? (
          <View style={styles.addColumn}>
            <TextInput
              accessibilityLabel={t('locations.addPrompt')}
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('locations.addPlaceholder')}
              placeholderTextColor={palette.muted}
              autoFocus
              returnKeyType="next"
              maxLength={60}
              style={[
                s.input,
                inputChromeStyle(palette),
                { color: palette.text, backgroundColor: palette.bg },
              ]}
            />
            {/* Place search: pick a real city by name (geocoded). Selecting
                a result populates draftPlace and we use those coords. */}
            <PlaceSearchSection
              palette={{
                bg: palette.bg,
                text: palette.text,
                muted: palette.muted,
                border: palette.border,
                accent: palette.accent,
                accentBg: palette.accentBg,
                card: palette.card,
                flatChrome: palette.flatChrome,
              }}
              onSelectPlace={place => {
                setDraftPlace(place);
                setDraftLatStr(String(place.latitude));
                setDraftLngStr(String(place.longitude));
              }}
            />
            {/* OR manual coordinates: lat/lng pair. Editing either clears
                the picked place so we know to use the typed values. */}
            <View style={styles.coordsRow}>
              <TextInput
                accessibilityLabel={t('settings.latPlaceholder', 'Latitude')}
                value={draftLatStr}
                onChangeText={txt => {
                  setDraftLatStr(txt);
                  setDraftPlace(null);
                }}
                keyboardType="numbers-and-punctuation"
                placeholder={t('settings.latPlaceholder', 'Latitude')}
                placeholderTextColor={palette.muted}
                style={[
                  s.input,
                  inputChromeStyle(palette),
                  styles.coordInput,
                  { color: palette.text, backgroundColor: palette.bg },
                ]}
              />
              <TextInput
                accessibilityLabel={t('settings.lngPlaceholder', 'Longitude')}
                value={draftLngStr}
                onChangeText={txt => {
                  setDraftLngStr(txt);
                  setDraftPlace(null);
                }}
                keyboardType="numbers-and-punctuation"
                placeholder={t('settings.lngPlaceholder', 'Longitude')}
                placeholderTextColor={palette.muted}
                style={[
                  s.input,
                  inputChromeStyle(palette),
                  styles.coordInput,
                  { color: palette.text, backgroundColor: palette.bg },
                ]}
              />
            </View>
            <View style={styles.addRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('locations.cancel')}
                onPress={() => {
                  setAdding(false);
                  setDraftName('');
                  setDraftPlace(null);
                  setDraftLatStr('');
                  setDraftLngStr('');
                }}
                hitSlop={8}
                style={styles.addCancelBtn}>
                <Text style={[styles.actionLabel, { color: palette.muted }]}>
                  {t('locations.cancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('locations.save')}
                accessibilityState={{ disabled: draftName.trim().length === 0 }}
                disabled={draftName.trim().length === 0}
                onPress={onSaveCurrent}
                style={[
                  styles.addSaveBtn,
                  {
                    backgroundColor:
                      draftName.trim().length === 0
                        ? palette.muted
                        : palette.accent,
                  },
                ]}>
                <Text style={styles.addSaveLabel}>{t('locations.save')}</Text>
              </Pressable>
            </View>
          </View>
        ) : limitReached ? (
          <Text
            style={[s.help, { color: palette.muted, marginTop: 8 }]}>
            {t('locations.limitReached', { max: MAX_LOCATION_PRESETS })}
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('locations.add')}
            onPress={() => setAdding(true)}
            style={[
              styles.addBtn,
              { borderColor: palette.border, backgroundColor: palette.bg },
            ]}>
            <Text style={[styles.addBtnLabel, { color: palette.accent }]}>
              + {t('locations.add')}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

export const SavedLocationsCard = memo(SavedLocationsCardImpl);

const styles = StyleSheet.create({
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteLabel: {
    color: '#b91c1c',
  },
  addBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  addBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  addColumn: {
    marginTop: 12,
    gap: 10,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
  },
  coordsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  coordInput: {
    flex: 1,
  },
  addInput: {
    flex: 1,
  },
  addCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  addSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addSaveLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
