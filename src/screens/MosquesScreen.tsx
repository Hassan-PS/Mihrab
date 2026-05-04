// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { useCallback } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocationSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { cardEdgeStyle } from '../theme/chrome';
import { SPACING } from '../theme/tokens';

/**
 * Mosque finder — task #28, simplified under the user's #83 follow-up.
 *
 * Per spec: "either have the maps built in the app or if it fails to
 * load just take the user to the maps app or a browser with a 'mosque'
 * search query." The previous in-app Overpass list was unreliable on
 * Android and would surface mosques for the wrong area on iOS, so
 * we've dropped it in favor of a single, always-working CTA:
 *
 *   1. Apple Maps (iOS) / Google Maps geo intent (Android) with a
 *      "mosque" near-me search.
 *   2. Browser fallback to Google Maps web if the maps app declines
 *      the URL.
 *
 * Coordinates respect `locationMode`:
 *   • automatic → lastFetchedLatitude / lastFetchedLongitude
 *   • manual    → manualLatitude / manualLongitude
 */
export function MosquesScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { slice } = useLocationSettings();
  useAndroidSubScreenBack();

  const lat =
    slice.locationMode === 'automatic'
      ? slice.lastFetchedLatitude ?? slice.manualLatitude
      : slice.manualLatitude ?? slice.lastFetchedLatitude;
  const lng =
    slice.locationMode === 'automatic'
      ? slice.lastFetchedLongitude ?? slice.manualLongitude
      : slice.manualLongitude ?? slice.lastFetchedLongitude;

  const hasCoords =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !(lat === 0 && lng === 0);

  const openMapsSearch = useCallback(async () => {
    const query = 'mosque';
    const lt = (lat ?? 0) as number;
    const lg = (lng ?? 0) as number;
    const hasUsable = hasCoords && Number.isFinite(lt) && Number.isFinite(lg);

    // 1) Native maps app first — the user's chosen default reads the URL.
    if (Platform.OS === 'ios') {
      const apple = hasUsable
        ? `maps://?q=${encodeURIComponent(query)}&sll=${lt},${lg}`
        : `maps://?q=${encodeURIComponent(query)}`;
      try {
        const supported = await Linking.canOpenURL(apple);
        if (supported) {
          await Linking.openURL(apple);
          return;
        }
      } catch {
        // fall through
      }
    } else if (Platform.OS === 'android') {
      // Geo intents support both location-aware and search-only forms.
      const geo = hasUsable
        ? `geo:${lt},${lg}?q=${encodeURIComponent(query)}`
        : `geo:0,0?q=${encodeURIComponent(query)}`;
      try {
        const supported = await Linking.canOpenURL(geo);
        if (supported) {
          await Linking.openURL(geo);
          return;
        }
      } catch {
        // fall through
      }
    }

    // 2) Browser fallback — Google Maps in the default browser.
    const web = hasUsable
      ? `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lt},${lg},14z`
      : `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    try {
      await Linking.openURL(web);
    } catch (e) {
      console.warn('Could not open maps URL:', e);
    }
  }, [hasCoords, lat, lng]);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('mosques.title', 'Find a mosque near you')}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          {hasCoords
            ? t(
                'mosques.bodyWithLocation',
                'We will open your maps app with a "mosque" search centered on your location. If your maps app is not available, we will open Google Maps in your browser.',
              )
            : t(
                'mosques.bodyNoLocation',
                'Set a location first (Settings → Location). We will then open your maps app with a "mosque" search centered on it. If your maps app is not available, we will open Google Maps in your browser.',
              )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mosques.openInMapsApp', 'Open Maps and search "mosque"')}
          onPress={openMapsSearch}
          style={[styles.primaryBtn, { backgroundColor: palette.accent }]}>
          <Text style={styles.primaryBtnLabel}>
            {t('mosques.openInMapsApp', 'Open Maps and search "mosque"')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: {
    borderRadius: 14,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  primaryBtnLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
