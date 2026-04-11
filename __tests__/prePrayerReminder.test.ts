import {
  buildPrePrayerReminderEvents,
  buildUpcomingSalahEvents,
} from '../src/utils/prayerTimes';

describe('buildPrePrayerReminderEvents', () => {
  const today = {
    Fajr: '05:00',
    Sunrise: '06:30',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '18:00',
    Isha: '20:00',
  };

  it('returns reminders N minutes before each future prayer', () => {
    const now = new Date(2025, 5, 10, 10, 0, 0);
    const salah = buildUpcomingSalahEvents(today, undefined, now);
    const reminders = buildPrePrayerReminderEvents(salah, 10, now);
    const dhuhr = reminders.find(r => r.name === 'Dhuhr');
    expect(dhuhr).toBeDefined();
    expect(dhuhr!.at.getHours()).toBe(11);
    expect(dhuhr!.at.getMinutes()).toBe(50);
  });

  it('drops reminders that would already have fired', () => {
    const now = new Date(2025, 5, 10, 11, 55, 0);
    const salah = buildUpcomingSalahEvents(today, undefined, now);
    const reminders = buildPrePrayerReminderEvents(salah, 10, now);
    const dhuhr = reminders.find(r => r.name === 'Dhuhr');
    expect(dhuhr).toBeUndefined();
  });
});
