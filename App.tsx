/**
 * @format
 */

import './src/i18n';
import './src/config/geolocationInit';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigationRoot } from './src/AppNavigationRoot';
import { PrayerSettingsProvider } from './src/context/PrayerSettingsContext';

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrayerSettingsProvider>
          <AppNavigationRoot />
        </PrayerSettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
