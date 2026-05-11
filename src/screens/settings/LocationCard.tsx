// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { PlaceSearchSection } from '../../components/PlaceSearchSection';
import { Button } from '../../components/ui/Button';
import { useLocationSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { GeocodedPlace } from '../../geocoding/nominatim';
import {
  cardEdgeStyle,
  inputChromeStyle,
  segmentChromeStyle,
} from '../../theme/chrome';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Location card: automatic/manual segment, place search (manual mode), and
 * raw lat/lng input with validation. Coord drafts are local state — only
 * committed to settings when "Apply" is pressed or a search result is picked.
 */
function LocationCardImpl() {
  const { t } = useTranslation();
  // Subscribes only to the location slice (task #11).
  const { slice: settings, update: updateSettings } = useLocationSettings();
  const { palette } = useAppPalette();
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setDraftLat(String(settings.manualLatitude));
      setDraftLng(String(settings.manualLongitude));
      setCoordError(null);
    }, [settings.manualLatitude, settings.manualLongitude]),
  );

  const applyCoords = () => {
    const lat = parseFloat(draftLat.replace(',', '.'));
    const lng = parseFloat(draftLng.replace(',', '.'));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordError(t('errors.coordLat'));
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setCoordError(t('errors.coordLng'));
      return;
    }
    setCoordError(null);
    updateSettings({
      manualLatitude: lat,
      manualLongitude: lng,
      manualLocationLabel: undefined,
      // Editing coords directly detaches from the active preset (task #18).
      activeLocationPresetId: undefined,
    });
  };

  const onSearchSelect = (place: GeocodedPlace) => {
    setDraftLat(String(place.latitude));
    setDraftLng(String(place.longitude));
    setCoordError(null);
    updateSettings({
      manualLatitude: place.latitude,
      manualLongitude: place.longitude,
      manualLocationLabel: place.displayName,
      // Picking a new place from search detaches from the active preset.
      activeLocationPresetId: undefined,
    });
  };

  const searchPalette = {
    bg: palette.bg,
    text: palette.text,
    muted: palette.muted,
    border: palette.border,
    accent: palette.accent,
    accentBg: palette.accentBg,
    card: palette.card,
    flatChrome: palette.flatChrome,
  };

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.location')}
      </Text>
      <View
        style={[
          s.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View
          style={s.segmentRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.location')}>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={t('settings.automatic')}
            accessibilityState={{
              selected: settings.locationMode === 'automatic',
            }}
            style={[
              s.segment,
              segmentChromeStyle(palette, settings.locationMode === 'automatic'),
            ]}
            onPress={() => updateSettings({ locationMode: 'automatic' })}>
            <Text
              style={[
                s.segmentLabel,
                { color: palette.text },
                settings.locationMode === 'automatic' && {
                  color: palette.accent,
                },
              ]}>
              {t('settings.automatic')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={t('settings.manual')}
            accessibilityState={{ selected: settings.locationMode === 'manual' }}
            style={[
              s.segment,
              segmentChromeStyle(palette, settings.locationMode === 'manual'),
            ]}
            onPress={() => updateSettings({ locationMode: 'manual' })}>
            <Text
              style={[
                s.segmentLabel,
                { color: palette.text },
                settings.locationMode === 'manual' && { color: palette.accent },
              ]}>
              {t('settings.manual')}
            </Text>
          </Pressable>
        </View>
        {settings.locationMode === 'manual' && (
          <View style={styles.manualBlock}>
            <PlaceSearchSection
              palette={searchPalette}
              onSelectPlace={onSearchSelect}
            />
            <Text style={[s.help, { color: palette.muted }]}>
              {t('settings.manualSearchHelp')}
            </Text>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.coordsLabel')}
            </Text>
            <TextInput
              accessibilityLabel={t('settings.latPlaceholder')}
              value={draftLat}
              onChangeText={setDraftLat}
              keyboardType="numbers-and-punctuation"
              placeholder={t('settings.latPlaceholder')}
              placeholderTextColor={palette.muted}
              style={[
                s.input,
                inputChromeStyle(palette),
                { color: palette.text, backgroundColor: palette.bg },
              ]}
            />
            <TextInput
              accessibilityLabel={t('settings.lngPlaceholder')}
              value={draftLng}
              onChangeText={setDraftLng}
              keyboardType="numbers-and-punctuation"
              placeholder={t('settings.lngPlaceholder')}
              placeholderTextColor={palette.muted}
              style={[
                s.input,
                inputChromeStyle(palette),
                { color: palette.text, backgroundColor: palette.bg },
              ]}
            />
            {coordError && <Text style={styles.errorText}>{coordError}</Text>}
            <Button
              label={t('settings.applyCoords')}
              onPress={applyCoords}
            />
          </View>
        )}
      </View>
    </>
  );
}

export const LocationCard = memo(LocationCardImpl);

const styles = StyleSheet.create({
  manualBlock: {
    marginTop: 16,
    gap: 10,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
});
