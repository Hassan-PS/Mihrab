/**
 * @format
 */

import 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { AppRegistry } from 'react-native';
import App from './App';
import { registerAdhanSafetyControls } from './src/notifications/adhanSafetyControls';

// The React Native module name MUST match what the native side requests
// in `getMainComponentName()` (Android: MainActivity.kt) and the iOS
// AppDelegate's RCTRootView. It's a stable identifier — never the brand.
//
// Was previously read from app.json via `import { name as appName } …`,
// but that path went through a Hermes/Metro caching layer that produced
// bundles with `appName` resolving to something other than the value in
// app.json on disk (v2.0.7/v2.0.8 shipped bundles where `runApplication`
// could not find the registered component). Hard-coding the literal
// makes the registration deterministic regardless of build cache state.
const APP_REGISTRY_NAME = 'PrayerApp';

// Disable react-native-screens' freeze behaviour so all screens in the
// NativeStackNavigator remain live in the React tree. Without this, background
// screens are suspended and do not re-render when the theme context changes
// (e.g. system dark-mode toggle), leaving them stuck on the old palette until
// the user navigates back to them. With only ~5 screens in the stack the
// memory overhead is negligible.
enableFreeze(false);

// Wrap module-init side effects so a throw from a downstream import can't
// silently prevent registerComponent from running. The reported v2.0.7+
// "PrayerApp has not been registered" was the visible symptom of an
// earlier failure here being swallowed; surfacing it as a console.error
// at least gives us a stack trace next time.
try {
  registerAdhanSafetyControls();
} catch (e) {
  console.error('[mihrab] registerAdhanSafetyControls failed:', e);
}

AppRegistry.registerComponent(APP_REGISTRY_NAME, () => App);
