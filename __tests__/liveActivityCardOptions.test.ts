/**
 * The two Live Activity settings, end to end.
 *
 * Both were asked for, both were built, and neither had a line of test
 * behind it — which is the state in which a feature quietly stops
 * existing. A setting is only real if it survives the whole chain: the
 * stored value, the row that changes it, the payload that carries it,
 * and the Kotlin that acts on it.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8');

const types = read('src', 'settings', 'types.ts');
const card = read('src', 'screens', 'settings', 'LiveActivityCard.tsx');
const bridge = read('src', 'notifications', 'liveActivity.ts');
const kotlin = read(
  'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times',
  'MihrabLiveActivityModule.kt',
);

describe('the lock-screen button can be turned off', () => {
  it('is a stored setting, on by default', () => {
    expect(types).toMatch(/liveActivityLockButton: boolean;/);
    expect(types).toMatch(/liveActivityLockButton: true,/);
  });

  it('has a row in Settings, and only on Android', () => {
    expect(card).toMatch(
      /Platform\.OS === 'android' && settings\.liveActivityEnabled &&/,
    );
    expect(card).toMatch(/update\(\{ liveActivityLockButton: v \}\)/);
    // Absent means on: a stored `false` is the only thing that hides it,
    // so an install from before the toggle existed keeps the button.
    expect(card).toMatch(/settings\.liveActivityLockButton !== false/);
  });

  it('reaches the card as aodActionEnabled', () => {
    expect(bridge).toMatch(/lockButton = s\.liveActivityLockButton !== false/);
    expect(bridge).toMatch(/aodActionEnabled: lockButton,/);
  });

  it('and the card only draws the button when it is on', () => {
    expect(kotlin).toMatch(/if \(p\.optBoolean\("aodActionEnabled", false\)\) \{/);
  });
});

describe('the countdown has no "since last" metric any more', () => {
  it('the stored value cannot be it', () => {
    expect(types).toMatch(/liveActivitySecondMetric: 'off' \| 'time';/);
  });

  it('the picker offers two choices, and coerces the retired third', () => {
    expect(card).toMatch(/\{ id: 'off', dv: 'None' \},\s*\{ id: 'time', dv: 'Prayer time' \},/);
    expect(card).toMatch(
      /settings\.liveActivitySecondMetric === 'time'\s*\? 'time'\s*: 'off'/,
    );
  });

  it('the bridge coerces it too, so an old install migrates on its own', () => {
    expect(bridge).toMatch(
      /secondMetric = s\.liveActivitySecondMetric === 'time' \? 'time' : 'off';/,
    );
  });

  it('the Kotlin has no stopwatch branch left', () => {
    // "time" is the only second metric it knows how to build; everything
    // else is no second metric at all.
    expect(kotlin).toMatch(/val second: Any\? = when \(secondKind\) \{\s*"time" ->/);
    expect(kotlin).not.toMatch(/"elapsed"/);
    expect(kotlin).not.toMatch(/setBase\(/);
  });
});
