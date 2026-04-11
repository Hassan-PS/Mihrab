/**
 * react-native-iap is linked manually in android/app/build.gradle for the
 * `play` flavor only (Google Play Billing). The `fdroid` flavor omits it for
 * F-Droid policy compliance.
 */
module.exports = {
  dependencies: {
    'react-native-iap': {
      platforms: {
        android: null,
      },
    },
  },
};
