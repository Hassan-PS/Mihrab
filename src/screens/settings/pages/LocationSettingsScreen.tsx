/**
 * Settings → Location. Where you are, and the places you have saved.
 *
 * `highlight` arrives from the home screen's location chip ("Add new
 * location"), and flashes the saved-locations card so the tap lands
 * somewhere the eye already is.
 */
import { useEffect, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../../navigation/types';
import { LocationCard } from '../LocationCard';
import { SavedLocationsCard } from '../SavedLocationsCard';
import { SettingsPage } from '../SettingsPage';

export function LocationSettingsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'SettingsLocation'>>();
  const [highlightSignal, setHighlightSignal] = useState(0);

  useEffect(() => {
    if (route.params?.highlight !== 'savedLocations') return;
    // A beat, so the flash lands after the push animation rather than
    // under it.
    const id = setTimeout(() => setHighlightSignal(s => s + 1), 350);
    return () => clearTimeout(id);
  }, [route.params?.highlight]);

  return (
    <SettingsPage>
      <LocationCard />
      <SavedLocationsCard highlightSignal={highlightSignal} />
    </SettingsPage>
  );
}
