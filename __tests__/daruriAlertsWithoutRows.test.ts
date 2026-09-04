/**
 * Being told about a boundary without having to draw it — issue #19.
 *
 * The reporter asked for the notifications and specifically not the rows:
 * *"Having an additional time in the rows will just make the UI compact
 * and bad looking."* The app could not give him that. One switch,
 * `malikiSecondTimesEnabled`, decided both — the card's rows AND whether
 * the alert list was passed to the scheduler — so the only way to be told
 * about a boundary was to also put it on the card.
 *
 * The wiring underneath it matters as much as the switch: the schedule
 * reads the boundaries out of the WEEK it is handed, so a week built
 * without them cannot produce an alert however the settings read. That is
 * why the injection now follows the feature and the drawing follows its
 * own setting, and why HomeScreen passes `alertWeek` rather than the week
 * it draws from.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const HOME = read('src/screens/HomeScreen.tsx');
const CARD = read('src/screens/settings/CalculationCard.tsx');
const TYPES = read('src/settings/types.ts');

describe('the setting exists and defaults to what the app already did', () => {
  it('has a rows switch of its own', () => {
    expect(TYPES).toMatch(/malikiSecondTimeRows: boolean;/);
    // On by default: nobody who already had the rows loses them.
    expect(TYPES).toMatch(/malikiSecondTimeRows: true,/);
  });

  it('has an end-of-window switch, off by default', () => {
    expect(TYPES).toMatch(/malikiSecondTimeEndAlerts: boolean;/);
    expect(TYPES).toMatch(/malikiSecondTimeEndAlerts: false,/);
  });
});

describe('drawing and announcing are separate', () => {
  it('injects the boundaries whenever the feature is on', () => {
    // NOT gated on the rows — the alert week needs them either way.
    expect(HOME).toMatch(
      /const tableWithDaruri =\s*settings\.malikiSecondTimesEnabled\s*\?\s*injectDaruriTimes\(/,
    );
  });

  it('draws them only when the rows are asked for', () => {
    expect(HOME).toMatch(
      /const drawDaruri =\s*tableWithDaruri != null && settings\.malikiSecondTimeRows;/,
    );
    expect(HOME).toMatch(/table: drawDaruri\s*\?/);
  });

  it('schedules from the alert week, not the drawn one', () => {
    // Both sync call sites — the effect and the focus resync.
    const uses = HOME.match(/week: view\.alertWeek,/g) ?? [];
    expect(uses).toHaveLength(2);
    expect(HOME).not.toMatch(/syncPrayerNotifications\([\s\S]{0,900}?week: view\.table\.week,/);
  });

  it('passes the end-of-window switch through at both sites', () => {
    const uses = HOME.match(/daruriEndAlerts: settings\.malikiSecondTimeEndAlerts,/g) ?? [];
    expect(uses).toHaveLength(2);
  });
});

describe('the settings screen offers both', () => {
  it('lets the rows be turned off where the alerts are chosen', () => {
    expect(CARD).toMatch(/settings\.malikiSecondTimeRows/);
    expect(CARD).toMatch(/updateSettings\(\{ malikiSecondTimeRows: v \}\)/);
  });

  it('offers the end alert once something is set to fire', () => {
    expect(CARD).toMatch(
      /alerts\.length > 0 \? \([\s\S]{0,800}?malikiSecondTimeEndAlerts/,
    );
  });
});
