import { getPositionStaged } from '../utils/getPosition';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
} from 'react-native';
import { requestAndroidLocationPermission } from '../utils/locationPermission';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { GeocodedPlace } from '../geocoding/nominatim';
import { inputChromeStyle } from '../theme/chrome';
import { MapPinIcon, SearchIcon } from '../theme/icons';
import { RADIUS, SPACING } from '../theme/tokens';
import { PlaceSearchSection } from './PlaceSearchSection';

type Palette = {
  bg: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  accent: ColorValue;
  accentBg: ColorValue;
  /** Plain "#RRGGBB" accent for SVG icon fills (task #104). */
  accentSolid: string;
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
          // Accept an "Approximate" (coarse) grant too — enough for prayer
          // times and works over Wi-Fi when GPS is unavailable.
          const perm = await requestAndroidLocationPermission();
          if (perm !== 'granted') {
            setGpsError(t('errors.gpsPermission'));
            setGpsBusy(false);
            return;
          }
        }
        // Staged locator: a fast Wi-Fi/cell fix first (works indoors, where
        // people usually set the app up), refined by GPS. onFix may fire
        // twice — the second (precise) fix just updates the saved coords.
        getPositionStaged(
          fix => {
            // Persist the coords as lastFetched so usePrayerDay's effect
            // re-fires even when locationMode/onboardingComplete are
            // already set (e.g., re-entering after a manual_required
            // bounce — #125). Otherwise pressing "Use automatic" would
            // be a silent no-op because the settings didn't change.
            updateSettings({
              locationMode: 'automatic',
              locationOnboardingComplete: true,
              manualLocationLabel: undefined,
              lastFetchedLatitude: fix.latitude,
              lastFetchedLongitude: fix.longitude,
            });
            setGpsBusy(false);
          },
          err => {
            setGpsError(err.message || t('errors.gpsRead'));
            setGpsBusy(false);
          },
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
          accessibilityRole="button"
          accessibilityLabel={t('locationSetup.useAutomatic')}
          accessibilityState={{ busy: gpsBusy, disabled: gpsBusy }}
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
            <View style={styles.btnContent}>
              <MapPinIcon size={20} color="#fff" />
              <Text style={styles.primaryBtnLabel}>
                {t('locationSetup.useAutomatic')}
              </Text>
            </View>
          )}
        </Pressable>
        {gpsError && (
          <Text style={[styles.err, { color: palette.danger }]}>{gpsError}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('locationSetup.searchCoords')}
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
          <View style={styles.btnContent}>
            <SearchIcon size={20} color={palette.accentSolid} />
            <Text style={[styles.secondaryLabel, { color: palette.accent }]}>
              {t('locationSetup.searchCoords')}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.manualContent}
      keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => setStep('choose')}
        hitSlop={12}>
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
        accessibilityRole="button"
        accessibilityLabel={t('common.continue')}
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
    padding: SPACING.xl,
    paddingTop: SPACING.xxxl,
    gap: SPACING.lg,
  },
  manualContent: {
    padding: SPACING.xl,
    paddingTop: SPACING.xl,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl + SPACING.sm, // 40 — between xxl (32) and xxxl (48)
  },
  headline: {
    fontSize: 24, // tokens-ok-line: hero one-off; will move to TYPE.title1 in #36 sweep
    fontWeight: '700',
  },
  sub: {
    fontSize: 15, // tokens-ok-line: TYPE.callout target
    lineHeight: 22,
  },
  primaryBtn: {
    paddingVertical: 14, // tokens-ok-line: 44pt min-tap baseline
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  primaryBtnBusy: {
    opacity: 0.7,
  },
  primaryBtnLabel: {
    color: '#fff',
    fontSize: 17, // tokens-ok-line: TYPE.headline target
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 14, // tokens-ok-line: matches primaryBtn baseline
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  secondaryLabel: {
    fontSize: 17, // tokens-ok-line: TYPE.headline target
    fontWeight: '600',
  },
  err: {
    fontSize: 14, // tokens-ok-line: TYPE.footnote target
    textAlign: 'center',
  },
  back: {
    fontSize: 17, // tokens-ok-line: TYPE.headline target
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  advLabel: {
    fontSize: 13, // tokens-ok-line: TYPE.footnote target
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10, // tokens-ok-line: input min-tap baseline
    fontSize: 16, // tokens-ok-line: TYPE.body target
  },
});
