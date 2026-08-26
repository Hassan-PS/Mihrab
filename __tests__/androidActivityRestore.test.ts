/**
 * MainActivity must not hand Android's saved fragment state back to
 * react-native-screens.
 *
 * `ScreenFragment.<init>` throws `IllegalStateException: Screen fragments
 * should never be restored` on purpose, and it throws out of
 * `performLaunchActivity` — a FATAL EXCEPTION, before any JS or any of our
 * own code runs. Nothing can catch it. The only defence is passing `null`
 * to `super.onCreate`, which drops the fragment state Android saved and
 * lets JS rebuild the navigation stack from its own.
 *
 * It is a one-line requirement that is easy to lose in a merge and
 * impossible to notice in a debug session, because the crash needs the
 * activity to be RECREATED FROM SAVED STATE: a background kill followed by
 * a return from Recents, or a configuration change outside the manifest's
 * `configChanges` list. It was in fact lost, and took the app down on a
 * Pixel 10 Pro on 2026-08-26. Hence a test, cheap and blunt.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..');
const MAIN_ACTIVITY = path.join(
  REPO,
  'android/app/src/main/java/com/prayer_times/MainActivity.kt',
);

describe('MainActivity', () => {
  const source = fs.readFileSync(MAIN_ACTIVITY, 'utf-8');

  it('overrides onCreate', () => {
    expect(source).toMatch(/override fun onCreate\(savedInstanceState: Bundle\?\)/);
  });

  it('passes null to super, never the saved state', () => {
    expect(source).toMatch(/super\.onCreate\(null\)/);
    // The bug is not "no onCreate" so much as "onCreate that forwards the
    // bundle", which looks more correct and is the thing that crashes.
    expect(source).not.toMatch(/super\.onCreate\(savedInstanceState\)/);
  });

  it('still declares uiMode so the theme flip does not restart it', () => {
    // Not this test's subject, but the two interact: every config change
    // NOT listed here recreates the activity, which is the path that used
    // to crash. If uiMode ever leaves the list, dark mode becomes that path.
    const manifest = fs.readFileSync(
      path.join(REPO, 'android/app/src/main/AndroidManifest.xml'),
      'utf-8',
    );
    const activity = manifest.slice(manifest.indexOf('android:name=".MainActivity"'));
    expect(activity.slice(0, 600)).toMatch(/android:configChanges="[^"]*uiMode/);
  });
});
