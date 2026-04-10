/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(() => Promise.resolve(true)),
  endConnection: jest.fn(() => Promise.resolve(true)),
  getProducts: jest.fn(() => Promise.resolve([])),
  requestPurchase: jest.fn(() => Promise.resolve(undefined)),
  finishTransaction: jest.fn(() => Promise.resolve(true)),
  flushFailedPurchasesCachedAsPendingAndroid: jest.fn(() =>
    Promise.resolve(true),
  ),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  ErrorCode: {
    E_USER_CANCELLED: 'E_USER_CANCELLED',
    E_ITEM_UNAVAILABLE: 'E_ITEM_UNAVAILABLE',
    E_NETWORK_ERROR: 'E_NETWORK_ERROR',
    E_IAP_NOT_AVAILABLE: 'E_IAP_NOT_AVAILABLE',
  },
}));

jest.mock('../src/context/PrayerSettingsContext', () => {
  const actual = jest.requireActual('../src/context/PrayerSettingsContext');
  const { DEFAULT_SETTINGS } = jest.requireActual('../src/settings/types');
  return {
    ...actual,
    usePrayerSettings: () => ({
      settings: {
        ...DEFAULT_SETTINGS,
        locationOnboardingComplete: true,
        locationMode: 'gps',
        dataProviderAuto: false,
      },
      hydrated: true,
      updateSettings: jest.fn(),
    }),
  };
});

jest.mock('../src/hooks/usePrayerDay', () => ({
  usePrayerDay: () => ({
    state: {
      phase: 'ready',
      latitude: 51.5074,
      longitude: -0.1278,
      today: {
        Fajr: '05:00',
        Sunrise: '06:15',
        Dhuhr: '12:05',
        Asr: '15:20',
        Maghrib: '18:10',
        Isha: '19:30',
      },
    },
    retry: jest.fn(),
  }),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
