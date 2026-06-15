/**
 * Android autolinking exclusions.
 *
 * - react-native-iap: linked manually in android/app/build.gradle for the
 *   `play` flavor only (Google Play Billing); the `fdroid` flavor omits it for
 *   F-Droid policy compliance.
 * - @react-native-community/blur: the "Liquid Glass" blur is iOS-only
 *   (GlassSurface renders BlurView solely when Platform.OS === 'ios'), but its
 *   Android side pulls com.github.Dimezis:BlurView from jitpack, which F-Droid
 *   can't resolve reliably. Since Android never renders it, drop it from Android
 *   autolinking entirely — no jitpack dependency in any Android build. iOS
 *   autolinking (CocoaPods) is unaffected, so the blur still works there.
 */
module.exports = {
  dependencies: {
    'react-native-iap': {
      platforms: {
        android: null,
      },
    },
    '@react-native-community/blur': {
      platforms: {
        android: null,
      },
    },
  },
};
