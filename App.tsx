/**
 * @format
 */

import './src/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigationRoot } from './src/AppNavigationRoot';
import { PrayerSettingsProvider } from './src/context/PrayerSettingsContext';
import { showDonationsUi } from './src/distribution';

function App() {
  if (showDonationsUi()) {
    const { TipIapBootstrap } = require('./src/donations/TipIapBootstrap');
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrayerSettingsProvider>
          <TipIapBootstrap>
            <AppNavigationRoot />
          </TipIapBootstrap>
        </PrayerSettingsProvider>
      </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

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
