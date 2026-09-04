/**
 * Settings → Home screen. The widget, and only the widget.
 *
 * The Live Activity used to be here, on the argument that it and the
 * widget are "the two surfaces the app has outside itself". That reads
 * well and is wrong about the thing that matters: a Live Activity is a
 * NOTIFICATION. It is posted, it is dismissed, it lives in the shade
 * beside the adhan alert, and everything that governs whether the user
 * hears from this app governs it too. Someone looking for it looked
 * under Notifications and did not find it.
 *
 * What is left really is one surface — the home-screen widget — which is
 * Android-only, and why `SETTINGS_SUBPAGES` drops this section entirely
 * on the platforms where `WidgetCard` renders nothing.
 */
import { SettingsPage } from '../SettingsPage';
import { WidgetCard } from '../WidgetCard';

export function WidgetSettingsScreen() {
  return (
    <SettingsPage>
      <WidgetCard />
    </SettingsPage>
  );
}
