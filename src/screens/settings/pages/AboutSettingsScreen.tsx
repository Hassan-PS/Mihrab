/** Settings → About. Version, licences, attributions, the hidden bits. */
import { AboutCard } from '../AboutCard';
import { SettingsPage } from '../SettingsPage';

export function AboutSettingsScreen() {
  return (
    <SettingsPage>
      <AboutCard />
    </SettingsPage>
  );
}
