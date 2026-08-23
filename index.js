/**
 * @format
 */

import 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { AppRegistry } from 'react-native';
import App from './App';
import { registerAdhanSafetyControls } from './src/notifications/adhanSafetyControls';
import { adhanMuteToggleTask } from './src/notifications/adhanMute';

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

// Stamp the first day this build ran, once. The Log's "fill in earlier
// days" button uses it as the earliest day it may offer to fill: without
// it, on a platform whose OS will not say when the app was installed, the
// button would have to either guess or refuse. It writes only if nothing
// is stored, so it records a first launch and never a later one.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { recordFirstSeen } = require('./src/journal/installDate');
  void recordFirstSeen();
} catch (e) {
  console.error('[mihrab] recordFirstSeen failed:', e);
}

// The Quran download's foreground service.
//
// Notifee requires the task to be registered before any notification asks
// to be one, and it has to be registered at the top level of the bundle
// rather than from a screen — the process can be started by the system
// with no UI at all. The task itself does nothing but stay pending: the
// download is driven from JS, and resolving this is how the service is
// told it may stop. See src/quran/downloadNotification.ts.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const notifee = require('@notifee/react-native').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { foregroundServiceTask } = require('./src/quran/downloadNotification');
  notifee.registerForegroundService(() => foregroundServiceTask());
} catch (e) {
  console.error('[mihrab] registerForegroundService failed:', e);
}

AppRegistry.registerComponent(APP_REGISTRY_NAME, () => App);

// Quran recitation playback service (lock-screen / notification remote
// controls + memorization pause-between-repeats). The player itself is
// only set up on first play (see src/quran/audio/playback.ts).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TrackPlayer = require('react-native-track-player').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PlaybackService } = require('./src/quran/audio/PlaybackService');
  TrackPlayer.registerPlaybackService(() => PlaybackService);
} catch (e) {
  console.error('[mihrab] registerPlaybackService failed:', e);
}

// HeadlessJS task for the Live Activity "Mute next adhan" toggle (Android 17+).
// Dispatched by AdhanMuteHeadlessService; must match its task name.
AppRegistry.registerHeadlessTask('AdhanMuteToggle', () => adhanMuteToggleTask);
