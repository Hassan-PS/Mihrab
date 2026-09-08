/**
 * The user's own dhikr reminders — issue #29.
 *
 * Three things here are worth a test without a notification system, and
 * they are the three that would fail quietly:
 *
 *   • a trigger in the past fires the instant it is created, so a
 *     resync that included "today at 09:00" at 10:00 would re-deliver a
 *     reminder somebody already read;
 *   • iOS keeps only the 64 soonest pending notifications an app has
 *     registered and silently drops the rest, so an unbounded list of
 *     these could take a Fajr alert off somebody's phone;
 *   • a reminder loaded from a hand-edited blob with `hour: "nine"` is
 *     a trigger that never fires, or fires now.
 *
 * Plus the rule the whole content side of this app is held to: every
 * dhikr the app offers names the report it stands on.
 */
import {
  DHIKR,
  dhikrArabic,
  dhikrPresetsResolve,
  findDhikr,
} from '../src/dhikr/dhikr';
import {
  addDhikrReminder,
  coerceDhikrReminders,
  dhikrFingerprint,
  MAX_DHIKR_REMINDERS,
  reminderOccurrences,
  removeDhikrReminder,
  runsOn,
  updateDhikrReminder,
  type DhikrReminder,
} from '../src/dhikr/dhikrReminders';
import {
  DHIKR_PENDING_LIMIT,
  dhikrSchedule,
  reminderText,
} from '../src/notifications/dhikrReminders';
import {
  notificationRoute,
  ROUTE_DHIKR,
} from '../src/notifications/notificationRoute';

jest.mock('../src/quran/quranState', () => ({
  hydrateQuranState: jest.fn(async () => {}),
  getQuranState: jest.fn(() => ({ lastRead: null })),
  activeKhatmah: jest.fn(() => null),
}));

jest.mock('../src/tasbih/tasbihStore', () => ({
  hydrateTasbihState: jest.fn(async () => {}),
  setActiveTasbih: jest.fn((id: string) => {
    mockActive = id;
  }),
}));
let mockActive: string | null = null;

/** A Wednesday, mid-morning, so "today at 09:00" is already behind. */
const WED_10AM = new Date(2026, 8, 9, 10, 0, 0);

const reminder = (patch: Partial<DhikrReminder> = {}): DhikrReminder => ({
  id: 'r1',
  dhikr: 'astaghfirullah',
  hour: 9,
  minute: 0,
  days: [],
  enabled: true,
  sound: 'default',
  ...patch,
});

describe('the dhikr this app offers', () => {
  it('names the report every one of them stands on', () => {
    // The rule duas.ts states and the reviewer enforces. A reminder is
    // something the app says to somebody several times a day.
    for (const entry of DHIKR) {
      expect(entry.source.length).toBeGreaterThan(20);
      expect(entry.source).toMatch(/Bukh|Muslim/);
    }
  });

  it('has words for every one of them', () => {
    for (const entry of DHIKR) {
      expect(dhikrArabic(entry).trim().length).toBeGreaterThan(3);
      // Arabic, not a transliteration that slipped into the wrong field.
      expect(dhikrArabic(entry)).toMatch(/[؀-ۿ]/);
    }
  });

  it('points only at tasbih presets that exist', () => {
    // The tap destination hangs off this: a preset id that no longer
    // exists is a reminder that opens the counter on the wrong dhikr.
    expect(dhikrPresetsResolve()).toBe(true);
  });

  it('includes the three the issue asked for', () => {
    // ṣalawāt, istighfār and the tahlīl — #29's own examples.
    for (const id of ['salahonprophet', 'astaghfirullah', 'lailaha']) {
      expect(findDhikr(id)).toBeTruthy();
    }
  });

  it('gives each one a distinct id', () => {
    expect(new Set(DHIKR.map(d => d.id)).size).toBe(DHIKR.length);
  });
});

describe('when a reminder fires', () => {
  it('never schedules a moment already past', () => {
    // The whole reason this is a pure function: a TIMESTAMP trigger in
    // the past is delivered immediately.
    const times = reminderOccurrences({
      reminder: reminder({ hour: 9 }),
      now: WED_10AM,
      days: 3,
    });
    for (const at of times) expect(at.getTime()).toBeGreaterThan(WED_10AM.getTime());
    expect(times[0].getDate()).toBe(10);
  });

  it('keeps today while the hour is still ahead', () => {
    const times = reminderOccurrences({
      reminder: reminder({ hour: 21 }),
      now: WED_10AM,
      days: 1,
    });
    expect(times[0].getDate()).toBe(9);
  });

  it('treats no days chosen as every day', () => {
    const times = reminderOccurrences({
      reminder: reminder({ hour: 21, days: [] }),
      now: WED_10AM,
      days: 6,
    });
    expect(times).toHaveLength(7);
  });

  it('honours the days that were chosen', () => {
    // Friday only.
    const times = reminderOccurrences({
      reminder: reminder({ hour: 21, days: [5] }),
      now: WED_10AM,
      days: 13,
    });
    expect(times.length).toBeGreaterThan(0);
    for (const at of times) expect(at.getDay()).toBe(5);
  });

  it('says nothing at all while it is switched off', () => {
    expect(
      reminderOccurrences({
        reminder: reminder({ enabled: false }),
        now: WED_10AM,
        days: 7,
      }),
    ).toEqual([]);
  });

  it('runsOn agrees with the days it was given', () => {
    const friday = new Date(2026, 8, 11, 12);
    expect(runsOn(reminder({ days: [] }), friday)).toBe(true);
    expect(runsOn(reminder({ days: [5] }), friday)).toBe(true);
    expect(runsOn(reminder({ days: [1] }), friday)).toBe(false);
  });
});

describe('the ceiling that protects the prayer alerts', () => {
  it('never writes more than the budget, however many reminders there are', () => {
    // iOS keeps the 64 soonest and drops the rest. Prayers, their
    // pre-reminders and the second-time alerts already spend most of
    // that, so a dhikr reminder must never be the reason a Fajr alert
    // did not arrive.
    const many = Array.from({ length: MAX_DHIKR_REMINDERS }, (_, i) =>
      reminder({ id: `r${i}`, hour: 11 + (i % 10) }),
    );
    const due = dhikrSchedule({ reminders: many, now: WED_10AM, days: 6 });
    expect(due.length).toBeLessThanOrEqual(DHIKR_PENDING_LIMIT);
  });

  it('spends the budget on the soonest, in order', () => {
    const due = dhikrSchedule({
      reminders: [
        reminder({ id: 'late', hour: 22 }),
        reminder({ id: 'soon', hour: 11 }),
      ],
      now: WED_10AM,
      days: 1,
    });
    expect(due[0].reminder.id).toBe('soon');
    for (let i = 1; i < due.length; i++) {
      expect(due[i].at.getTime()).toBeGreaterThanOrEqual(due[i - 1].at.getTime());
    }
  });
});

describe('what a reminder says', () => {
  it('shows a preset’s words and what they mean', () => {
    const { title, body } = reminderText(reminder({ dhikr: 'astaghfirullah' }));
    expect(title.length).toBeGreaterThan(0);
    expect(body).toMatch(/[؀-ۿ]/);
  });

  it('says exactly what the user wrote, and invents nothing', () => {
    // The asymmetry is deliberate: the app vouches for a preset and does
    // not vouch for words it did not choose.
    const { title, body } = reminderText(
      reminder({ dhikr: null, title: 'Call mum', body: 'and then some dhikr' }),
    );
    expect(title).toBe('Call mum');
    expect(body).toBe('and then some dhikr');
  });
});

describe('a list loaded from disk', () => {
  it('drops what is not a reminder', () => {
    expect(coerceDhikrReminders(null)).toEqual([]);
    expect(coerceDhikrReminders([1, 'x', {}, { id: '' }])).toEqual([]);
    // No dhikr and no words of its own is not a reminder either.
    expect(coerceDhikrReminders([{ id: 'a', dhikr: 'nope' }])).toEqual([]);
  });

  it('clamps a time that would never fire', () => {
    const [one] = coerceDhikrReminders([
      { id: 'a', dhikr: 'lailaha', hour: 'nine', minute: 999 },
    ]);
    expect(one.hour).toBe(9);
    expect(one.minute).toBe(59);
  });

  it('keeps only weekdays, sorted, without repeats', () => {
    const [one] = coerceDhikrReminders([
      { id: 'a', dhikr: 'lailaha', days: [6, 1, 1, 9, -2, 'x'] },
    ]);
    expect(one.days).toEqual([1, 6]);
  });

  it('sends a sound it does not recognise back to the default', () => {
    // The room left for per-reminder audio: an older build meets a newer
    // blob and plays the ordinary sound rather than nothing.
    const [one] = coerceDhikrReminders([
      { id: 'a', dhikr: 'lailaha', sound: 'file:whatever' },
    ]);
    expect(one.sound).toBe('default');
  });

  it('treats a reminder written before the switch existed as on', () => {
    const [one] = coerceDhikrReminders([{ id: 'a', dhikr: 'lailaha' }]);
    expect(one.enabled).toBe(true);
  });

  it('refuses to hold more than the cap, or the same id twice', () => {
    const many = Array.from({ length: MAX_DHIKR_REMINDERS + 5 }, (_, i) => ({
      id: `r${i}`,
      dhikr: 'lailaha',
    }));
    expect(coerceDhikrReminders(many)).toHaveLength(MAX_DHIKR_REMINDERS);
    expect(
      coerceDhikrReminders([
        { id: 'same', dhikr: 'lailaha' },
        { id: 'same', dhikr: 'salahonprophet' },
      ]),
    ).toHaveLength(1);
  });
});

describe('editing the list', () => {
  it('adds, updates and removes without touching the array it was given', () => {
    const before: DhikrReminder[] = [reminder()];
    const added = addDhikrReminder(before, { ...reminder(), id: undefined } as never);
    expect(before).toHaveLength(1);
    expect(added).toHaveLength(2);
    expect(added[1].id).not.toBe(added[0].id);

    const updated = updateDhikrReminder(before, 'r1', { hour: 17 });
    expect(before[0].hour).toBe(9);
    expect(updated[0].hour).toBe(17);

    expect(removeDhikrReminder(before, 'r1')).toEqual([]);
    expect(before).toHaveLength(1);
  });

  it('stops adding at the cap rather than growing past it', () => {
    const full = Array.from({ length: MAX_DHIKR_REMINDERS }, (_, i) =>
      reminder({ id: `r${i}` }),
    );
    expect(addDhikrReminder(full, reminder())).toHaveLength(
      MAX_DHIKR_REMINDERS,
    );
  });
});

describe('the fingerprint the resync watches', () => {
  it('changes for every edit that changes when or what', () => {
    const base = reminder();
    const print = dhikrFingerprint([base]);
    for (const patch of [
      { hour: 10 },
      { minute: 30 },
      { days: [5] },
      { sound: 'silent' as const },
      { dhikr: 'lailaha' as const },
      { enabled: false },
    ]) {
      expect(dhikrFingerprint([{ ...base, ...patch }])).not.toBe(print);
    }
  });

  it('changes when a custom reminder’s words change', () => {
    const custom = reminder({ dhikr: null, title: 'a', body: 'b' });
    expect(dhikrFingerprint([{ ...custom, body: 'c' }])).not.toBe(
      dhikrFingerprint([custom]),
    );
  });
});

describe('where a tapped reminder lands', () => {
  beforeEach(() => {
    mockActive = null;
  });

  it('opens the counter, already on those words', () => {
    // A reminder to say something that does not offer to count it is a
    // reminder to go looking for the counter.
    return notificationRoute({
      data: { route: ROUTE_DHIKR, dhikr: 'astaghfirullah' },
    } as never).then(url => {
      expect(url).toBe('mihrab://tasbih');
      expect(mockActive).toBe('astaghfirullah');
    });
  });

  it('opens the counter untouched for words the app did not choose', async () => {
    const url = await notificationRoute({
      data: { route: ROUTE_DHIKR },
    } as never);
    expect(url).toBe('mihrab://tasbih');
    expect(mockActive).toBeNull();
  });
});
