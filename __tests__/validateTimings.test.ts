import { validateTimings } from '../src/providers/validateTimings';

const VALID: Record<string, string> = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '19:30',
};

describe('validateTimings', () => {
  it('accepts a complete, well-formed timings map', () => {
    expect(() => validateTimings(VALID)).not.toThrow();
    expect(validateTimings(VALID)).toBe(VALID);
  });

  it.each(['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'])(
    'throws when %s is missing',
    key => {
      const bad = { ...VALID };
      delete bad[key];
      expect(() => validateTimings(bad)).toThrow(/Invalid prayer times/);
    },
  );

  it.each([
    ['Fajr', '5:00'],    // no leading zero
    ['Dhuhr', '12:0'],   // single minute digit
    ['Asr', ''],         // empty string
    ['Isha', 'sunset'],  // free text
  ])('throws when %s has value %j (not HH:MM)', (key, val) => {
    const bad = { ...VALID, [key]: val };
    expect(() => validateTimings(bad)).toThrow(/Invalid prayer times/);
  });

  it('accepts extra keys (e.g. Imsak) without complaint', () => {
    const withExtra = { ...VALID, Imsak: '04:30' };
    expect(() => validateTimings(withExtra)).not.toThrow();
  });
});
