import Geolocation from '@react-native-community/geolocation';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type ColorValue,
} from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { GeocodedPlace } from '../geocoding/nominatim';
import { inputChromeStyle } from '../theme/chrome';
import { PlaceSearchSection } from './PlaceSearchSection';

type Palette = {
  bg: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  accent: ColorValue;
  accentBg: ColorValue;
  card: ColorValue;
  danger: ColorValue;
  flatChrome: boolean;
};

type Props = {
  palette: Palette;
};

export function LocationSetup({ palette }: Props) {
  const { t } = useTranslation();
  const { updateSettings } = usePrayerSettings();
  const [step, setStep] = useState<'choose' | 'manual'>('choose');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [placeLabel, setPlaceLabel] = useState<string | undefined>();
  const [coordError, setCoordError] = useState<string | null>(null);

  const onSelectPlace = (place: GeocodedPlace) => {
    setDraftLat(String(place.latitude));
    setDraftLng(String(place.longitude));
    setPlaceLabel(place.displayName);
    setCoordError(null);
    updateSettings({
      locationMode: 'manual',
      manualLatitude: place.latitude,
      manualLongitude: place.longitude,
      manualLocationLabel: place.displayName,
      locationOnboardingComplete: true,
    });
  };

  const completeManual = () => {
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
      locationMode: 'manual',
      manualLatitude: lat,
      manualLongitude: lng,
      manualLocationLabel: placeLabel,
      locationOnboardingComplete: true,
    });
  };

  const useDeviceLocation = () => {
    setGpsError(null);
    setGpsBusy(true);
    const run = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setGpsError(t('errors.gpsPermission'));
            setGpsBusy(false);
            return;
          }
        }
        Geolocation.getCurrentPosition(
          () => {
            updateSettings({
              locationMode: 'gps',
              locationOnboardingComplete: true,
              manualLocationLabel: undefined,
            });
            setGpsBusy(false);
          },
          err => {
            setGpsError(err.message || t('errors.gpsRead'));
            setGpsBusy(false);
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
        );
      } catch (e) {
        setGpsError(
          e instanceof Error ? e.message : t('errors.gpsRequest'),
        );
        setGpsBusy(false);
      }
    };
    run().catch(() => {
      setGpsBusy(false);
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

  if (step === 'choose') {
    return (
      <ScrollView
        style={[styles.fill, { backgroundColor: palette.bg }]}
        contentContainerStyle={styles.chooseContent}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.headline, { color: palette.text }]}>
          {t('locationSetup.headline')}
        </Text>
        <Text style={[styles.sub, { color: palette.muted }]}>
          {t('locationSetup.sub')}
        </Text>
        <Pressable
          disabled={gpsBusy}
          onPress={useDeviceLocation}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.accent },
            gpsBusy && styles.primaryBtnBusy,
          ]}>
          {gpsBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnLabel}>
              {t('locationSetup.useGps')}
            </Text>
          )}
        </Pressable>
        {gpsError && (
          <Text style={[styles.err, { color: palette.danger }]}>{gpsError}</Text>
        )}
        <Pressable
          onPress={() => setStep('manual')}
          style={[
            styles.secondaryBtn,
            palette.flatChrome
              ? {
                  borderWidth: 0,
                  borderColor: 'transparent',
                  backgroundColor: palette.card,
                }
              : { borderColor: palette.border },
          ]}>
          <Text style={[styles.secondaryLabel, { color: palette.accent }]}>
            {t('locationSetup.searchCoords')}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.manualContent}
      keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => setStep('choose')} hitSlop={12}>
        <Text style={[styles.back, { color: palette.accent }]}>
          ← {t('common.back')}
        </Text>
      </Pressable>
      <Text style={[styles.headline, { color: palette.text }]}>
        {t('locationSetup.manualHeadline')}
      </Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        {t('locationSetup.manualSub')}
      </Text>
      <PlaceSearchSection palette={searchPalette} onSelectPlace={onSelectPlace} />
      <Text style={[styles.advLabel, { color: palette.muted }]}>
        {t('locationSetup.decimalCoords')}
      </Text>
      <TextInput
        value={draftLat}
        onChangeText={t => {
          setDraftLat(t);
          setPlaceLabel(undefined);
        }}
        keyboardType="numbers-and-punctuation"
        placeholder={t('settings.latPlaceholder')}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          inputChromeStyle(palette),
          {
            color: palette.text,
            backgroundColor: palette.bg,
          },
        ]}
      />
      <TextInput
        value={draftLng}
        onChangeText={t => {
          setDraftLng(t);
          setPlaceLabel(undefined);
        }}
        keyboardType="numbers-and-punctuation"
        placeholder={t('settings.lngPlaceholder')}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          inputChromeStyle(palette),
          {
            color: palette.text,
            backgroundColor: palette.bg,
          },
        ]}
      />
      {coordError && (
        <Text style={[styles.err, { color: palette.danger }]}>{coordError}</Text>
      )}
      <Pressable
        onPress={completeManual}
        style={[styles.primaryBtn, { backgroundColor: palette.accent }]}>
        <Text style={styles.primaryBtnLabel}>{t('common.continue')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  chooseContent: {
    padding: 24,
    paddingTop: 48,
    gap: 16,
  },
  manualContent: {
    padding: 24,
    paddingTop: 24,
    gap: 12,
    paddingBottom: 40,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
  },
  sub: {
    fontSize: 15,
    lineHeight: 22,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnBusy: {
    opacity: 0.7,
  },
  primaryBtnLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  secondaryLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  err: {
    fontSize: 14,
    textAlign: 'center',
  },
  back: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  advLabel: {
    fontSize: 13,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
