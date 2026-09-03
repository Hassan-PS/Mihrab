/**
 * The khatmah reminder has nothing to say to a reader who has read.
 *
 * It is scheduled a week ahead with stable per-day ids, so nothing
 * revisited today's once it was written: finish the portion at seven in
 * the morning and the nine-o'clock reminder still arrived to ask for it.
 * That is the one notification in the app that lands on the person who
 * kept the promise.
 */
import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  khatmahReminderDue,
  rescheduleKhatmahReminder,
} from '../src/notifications/khatmahReminder';
import {
  __resetQuranStateForTests,
  activeKhatmah,
  finishKhatmahPortion,
  getQuranState,
  startKhatmah,
} from '../src/quran/quranState';

const plan = () => activeKhatmah(getQuranState())!;

/** The ymd suffix of every reminder the sync scheduled. */
const scheduledDays = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls.map(c =>
    String(c[0].id).replace('khatmah-rem-', ''),
  );

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 5, 14, 8, 0, 0));
  jest.clearAllMocks();
  (notifee.getTriggerNotificationIds as jest.Mock).mockResolvedValue([]);
  // Both halves, or the plan comes back: the scheduler hydrates, and a
  // reset that leaves the previous test's plan in storage hands it straight
  // back on the next read.
  __resetQuranStateForTests();
  await AsyncStorage.clear();
});

afterEach(() => jest.useRealTimers());

describe('khatmahReminderDue', () => {
  it('is due while the day’s portion is unread', () => {
    startKhatmah(30);
    expect(khatmahReminderDue(plan(), Date.now())).toBe(true);
  });

  it('is not due once the day’s portion is finished', () => {
    startKhatmah(30);
    finishKhatmahPortion();
    expect(khatmahReminderDue(plan(), Date.now())).toBe(false);
  });

  it('is still due on the days after it, which are not read yet', () => {
    startKhatmah(30);
    finishKhatmahPortion();
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    expect(khatmahReminderDue(plan(), tomorrow)).toBe(true);
  });
});

describe('rescheduleKhatmahReminder', () => {
  const sync = () =>
    rescheduleKhatmahReminder({ enabled: true, hour: 21, minute: 0 });

  it('writes a week of reminders for a plan in progress', async () => {
    startKhatmah(30);
    await sync();
    expect(scheduledDays().length).toBe(7);
    expect(scheduledDays()[0]).toBe(ymd(new Date(2026, 5, 14)));
  });

  it('skips today once the portion is done, and keeps the rest', async () => {
    startKhatmah(30);
    finishKhatmahPortion();
    await sync();
    const days = scheduledDays();
    expect(days).not.toContain(ymd(new Date(2026, 5, 14)));
    expect(days).toContain(ymd(new Date(2026, 5, 15)));
    expect(days.length).toBe(6);
  });

  it('writes nothing at all without a plan', async () => {
    await sync();
    expect(scheduledDays()).toEqual([]);
  });

  it('writes nothing when the toggle is off', async () => {
    startKhatmah(30);
    await rescheduleKhatmahReminder({ enabled: false, hour: 21, minute: 0 });
    expect(scheduledDays()).toEqual([]);
  });

  it('clears the old window before writing the new one', async () => {
    (notifee.getTriggerNotificationIds as jest.Mock).mockResolvedValue([
      'khatmah-rem-2026-06-14',
      'ayah-of-day-2026-06-14',
    ]);
    startKhatmah(30);
    await sync();
    expect(notifee.cancelTriggerNotification).toHaveBeenCalledWith(
      'khatmah-rem-2026-06-14',
    );
    expect(notifee.cancelTriggerNotification).not.toHaveBeenCalledWith(
      'ayah-of-day-2026-06-14',
    );
  });
});
