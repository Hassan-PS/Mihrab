/**
 * @format
 */

import './src/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigationRoot } from './src/AppNavigationRoot';
import { PrayerSettingsProvider } from './src/context/PrayerSettingsContext';
import { showDonationsUi } from './src/distribution';

function App() {
  if (showDonationsUi()) {
    const { TipIapBootstrap } = require('./src/donations/TipIapBootstrap');
    return (
      <SafeAreaProvider>
        <PrayerSettingsProvider>
          <TipIapBootstrap>
            <AppNavigationRoot />
          </TipIapBootstrap>
        </PrayerSettingsProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <PrayerSettingsProvider>
        <AppNavigationRoot />
      </PrayerSettingsProvider>
    </SafeAreaProvider>
  );
}

export default App;
