/**
 * One-time geolocation configuration, run at app startup (side-effect import
 * from App.tsx).
 *
 * On Android we force `locationProvider: 'android'` — the platform
 * `LocationManager` — rather than the fused `playServices` provider. Two
 * reasons:
 *   1. F-Droid must stay free of Google Play Services (a hard project rule),
 *      and 'android' never touches `com.google.android.gms`.
 *   2. `LocationManager` still exposes the NETWORK provider, so the staged
 *      locator's coarse request (`enableHighAccuracy: false`) resolves from
 *      Wi-Fi / cell towers indoors when GPS can't get a fix — which is the
 *      whole point of "don't time out when Wi-Fi can locate but GPS can't".
 *
 * On iOS we leave the provider on 'auto' and keep `skipPermissionRequests`
 * false so the library shows the standard when-in-use prompt on first fix.
 */
import Geolocation from '@react-native-community/geolocation';
import { Platform } from 'react-native';

try {
  Geolocation.setRNConfiguration({
    skipPermissionRequests: false,
    authorizationLevel: 'whenInUse',
    locationProvider: Platform.OS === 'android' ? 'android' : 'auto',
  });
} catch {
  // Native module not ready / older library — the library's own defaults
  // (auto provider) still work, so this is non-fatal.
}
