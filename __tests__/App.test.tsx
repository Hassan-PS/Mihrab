/**
 * @format
 */

import React, { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/context/PrayerSettingsContext', () => {
  const actual = jest.requireActual('../src/context/PrayerSettingsContext');
  const { DEFAULT_SETTINGS } = jest.requireActual('../src/settings/types');
  return {
    ...actual,
    usePrayerSettings: () => ({
      settings: {
        ...DEFAULT_SETTINGS,
        locationOnboardingComplete: true,
        locationMode: 'automatic',
        dataProviderAuto: false,
      },
      hydrated: true,
      updateSettings: jest.fn(),
    }),
  };
});

jest.mock('../src/hooks/usePrayerDay', () => {
  const day = {
    Fajr: '05:00',
    Sunrise: '06:15',
    Dhuhr: '12:05',
    Asr: '15:20',
    Maghrib: '18:10',
    Isha: '19:30',
  };
  return {
    usePrayerDay: () => ({
      state: {
        phase: 'ready',
        latitude: 51.5074,
        longitude: -0.1278,
        today: day,
        tomorrow: day,
        week: [day, day, day, day, day, day, day],
      },
      retry: jest.fn(),
    }),
  };
});

test('renders correctly', async () => {
  await act(() => {
    ReactTestRenderer.create(<App />);
  });
});
