/**
 * Settings → Home screen. The widget and the Live Activity — the two
 * surfaces the app has outside itself, which is why they are one page
 * rather than two entries a reader has to tell apart.
 */
import { LiveActivityCard } from '../LiveActivityCard';
import { SettingsPage } from '../SettingsPage';
import { WidgetCard } from '../WidgetCard';

export function WidgetSettingsScreen() {
  return (
    <SettingsPage>
      <WidgetCard />
      <LiveActivityCard />
    </SettingsPage>
  );
}
