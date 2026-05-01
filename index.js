/**
 * @format
 */

import 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerAdhanSafetyControls } from './src/notifications/adhanSafetyControls';

// Disable react-native-screens' freeze behaviour so all screens in the
// NativeStackNavigator remain live in the React tree. Without this, background
// screens are suspended and do not re-render when the theme context changes
// (e.g. system dark-mode toggle), leaving them stuck on the old palette until
// the user navigates back to them. With only ~5 screens in the stack the
// memory overhead is negligible.
enableFreeze(false);

registerAdhanSafetyControls();

AppRegistry.registerComponent(appName, () => App);
