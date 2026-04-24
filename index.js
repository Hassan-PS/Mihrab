/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerAdhanSafetyControls } from './src/notifications/adhanSafetyControls';

registerAdhanSafetyControls();

AppRegistry.registerComponent(appName, () => App);
