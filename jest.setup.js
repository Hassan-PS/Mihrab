/* eslint-env jest */
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(success =>
      success({ coords: { latitude: 51.5, longitude: -0.12 } }),
    ),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('adhan', () => {
  const t = new Date(2026, 3, 9, 5, 0, 0);
  const mk = () => ({ madhab: 'shafi' });
  const names = [
    'Tehran',
    'Karachi',
    'NorthAmerica',
    'MuslimWorldLeague',
    'UmmAlQura',
    'Egyptian',
    'Dubai',
    'Kuwait',
    'Qatar',
    'Singapore',
    'Turkey',
    'MoonsightingCommittee',
  ];
  const CM = {};
  names.forEach(n => {
    CM[n] = mk;
  });
  return {
    Coordinates: function Coordinates() {},
    Madhab: { Hanafi: 'hanafi', Shafi: 'shafi' },
    CalculationMethod: CM,
    PrayerTimes: function PrayerTimes() {
      this.fajr = t;
      this.sunrise = t;
      this.dhuhr = t;
      this.asr = t;
      this.maghrib = t;
      this.isha = t;
    },
  };
});

jest.mock('react-native-sensors', () => ({
  magnetometer: {
    subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
  },
  setUpdateIntervalForType: jest.fn(),
  SensorTypes: { magnetometer: 'magnetometer' },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    cancelTriggerNotifications: jest.fn(() => Promise.resolve()),
    createChannel: jest.fn(() => Promise.resolve()),
    createTriggerNotification: jest.fn(() => Promise.resolve()),
  },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AlarmType: {
    SET_EXACT_AND_ALLOW_WHILE_IDLE: 3,
  },
}));
