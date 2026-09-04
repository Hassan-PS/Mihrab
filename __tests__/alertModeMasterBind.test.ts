/**
 * The home row and the master switch cannot hold two answers at once.
 *
 * `notificationsEnabled` in Settings decides whether the app speaks at
 * all; the per-prayer modes decide what each prayer says when it does.
 * They were independent, so the app could show five rows with a green
 * bell above a master switch that was off — and then say nothing at any
 * prayer time. The scheduler had always read the master, so it was the
 * rows that were lying, on the one screen people actually look at.
 *
 * Both directions are pinned here, and so is the thing that must NOT
 * happen: the stored per-prayer choices surviving a trip through off.
 */
import {
  cycleAlertModePatch,
  shownAlertMode,
  type AlertModeMap,
} from '../src/settings/alertModes';

const SALAH = 'Fajr';
const EVENT = 'Sunrise';

describe('what a row shows', () => {
  it('reads silent for every row while the master is off', () => {
    const modes: AlertModeMap = { Fajr: 'adhan', Dhuhr: 'notification' };
    expect(shownAlertMode('Fajr', modes, true, false)).toBe('silent');
    expect(shownAlertMode('Dhuhr', modes, true, false)).toBe('silent');
    expect(shownAlertMode('Asr', modes, true, false)).toBe('silent');
  });

  it('reads the stored choice again the moment the master is on', () => {
    const modes: AlertModeMap = { Fajr: 'adhan', Dhuhr: 'notification' };
    expect(shownAlertMode('Fajr', modes, true, true)).toBe('adhan');
    expect(shownAlertMode('Dhuhr', modes, true, true)).toBe('notification');
  });

  it('falls back to the old behaviour for a row never touched', () => {
    // Sparse map: an absent row means "whatever the app did before this
    // control existed", which depends on whether an adhan is chosen.
    expect(shownAlertMode(SALAH, {}, true, true)).toBe('adhan');
    expect(shownAlertMode(SALAH, {}, false, true)).toBe('notification');
  });
});

describe('what pressing a row writes', () => {
  it('turns the master on when a row is asked to speak', () => {
    // The contradiction this exists to prevent: a row set to adhan while
    // the switch that would let it sound is off, three screens away.
    const patch = cycleAlertModePatch(SALAH, 'silent', {}, false);
    expect(patch.notificationsEnabled).toBe(true);
    expect(patch.prayerAlertModes[SALAH]).not.toBe('silent');
  });

  it('does the same for a non-prayer row', () => {
    const patch = cycleAlertModePatch(EVENT, 'silent', {}, false);
    expect(patch.notificationsEnabled).toBe(true);
    expect(patch.prayerAlertModes[EVENT]).toBe('notification');
  });

  it('leaves the master alone when it is already on', () => {
    // Not merely true — ABSENT. Writing `notificationsEnabled: true` on
    // every press would be a settings write that says nothing.
    const patch = cycleAlertModePatch(SALAH, 'adhan', {}, true);
    expect(patch.notificationsEnabled).toBeUndefined();
  });

  it('does not turn the master off when a row goes quiet', () => {
    // One prayer going silent is not a statement about the other four.
    const modes: AlertModeMap = { Fajr: 'notification', Dhuhr: 'adhan' };
    const patch = cycleAlertModePatch('Fajr', 'notification', modes, true);
    expect(patch.prayerAlertModes.Fajr).toBe('silent');
    expect(patch.notificationsEnabled).toBeUndefined();
  });

  it('changes one row and no other', () => {
    const modes: AlertModeMap = { Fajr: 'adhan', Dhuhr: 'adhan', Asr: 'silent' };
    const patch = cycleAlertModePatch('Fajr', 'adhan', modes, true);
    expect(patch.prayerAlertModes.Dhuhr).toBe('adhan');
    expect(patch.prayerAlertModes.Asr).toBe('silent');
  });
});

describe('a trip through off and back', () => {
  it('gives every prayer back the voice it had', () => {
    // The reason "off" only changes what is SHOWN. Flattening five
    // decisions into one default because the master was toggled would
    // lose work the user did deliberately, silently.
    const modes: AlertModeMap = {
      Fajr: 'adhan',
      Dhuhr: 'notification',
      Asr: 'silent',
      Maghrib: 'adhan',
    };
    for (const key of Object.keys(modes)) {
      expect(shownAlertMode(key, modes, true, false)).toBe('silent');
    }
    // Nothing was written while it was off, so this is the same map.
    for (const [key, was] of Object.entries(modes)) {
      expect(shownAlertMode(key, modes, true, true)).toBe(was);
    }
  });

  it('remembers the other four after a row wakes the master', () => {
    const modes: AlertModeMap = { Dhuhr: 'notification', Asr: 'adhan' };
    const patch = cycleAlertModePatch('Fajr', 'silent', modes, false);
    expect(patch.notificationsEnabled).toBe(true);
    expect(patch.prayerAlertModes.Dhuhr).toBe('notification');
    expect(patch.prayerAlertModes.Asr).toBe('adhan');
  });
});
