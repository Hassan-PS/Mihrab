/**
 * @format
 */

import './src/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigationRoot } from './src/AppNavigationRoot';
import { PrayerSettingsProvider } from './src/context/PrayerSettingsContext';
import { TipIapBootstrap } from './src/donations/TipIapBootstrap';

function App() {
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

export default App;
