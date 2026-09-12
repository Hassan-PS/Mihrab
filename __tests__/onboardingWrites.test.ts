/**
 * What the first launch actually WRITES.
 *
 * Every one of these exists because nothing asserted it and the app was
 * wrong for months.
 *
 * THE BUG. The onboarding notifications step requested the OS permission
 * and then wrote no setting at all. `notificationsEnabled` defaults to
 * false, and `shownAlertMode` opens with `if (!notificationsEnabled)
 * return 'silent'`, so every prayer in the day resolved to silent. A
 * person installed a prayer app, pressed "Enable alerts", granted the
 * permission — and was never notified, with the OS listing Mihrab as a
 * permitted notifier the whole time.
 *
 * There were tests on the onboarding STEP LIST (featureModulesPart2)
 * and on locale parity. Nothing rendered the screen or looked at what it
 * stored, which is the gap this file closes: the asking is now one
 * module, and these pin what its answer is allowed to mean.
 */
const mockRequestPermission = jest.fn();
const mockAndroidRequest = jest.fn();

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: (...a: unknown[]) => mockRequestPermission(...(a as [])),
  },
  AuthorizationStatus: {
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
  },
}));

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: { OS: 'ios', Version: 17 },
  PermissionsAndroid: {
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' },
    request: (...a: unknown[]) => mockAndroidRequest(...(a as [])),
  },
}));

import { Platform } from 'react-native';
import { AuthorizationStatus } from '@notifee/react-native';
import { requestNotificationPermission } from '../src/notifications/requestNotificationAccess';

const setPlatform = (os: string, version: number) => {
  (Platform as unknown as { OS: string; Version: number }).OS = os;
  (Platform as unknown as { OS: string; Version: number }).Version = version;
};

beforeEach(() => {
  mockRequestPermission.mockReset();
  mockAndroidRequest.mockReset();
  setPlatform('ios', 17);
});

describe('asking to notify', () => {
  it('is yes when iOS authorises', async () => {
    mockRequestPermission.mockResolvedValue({
      authorizationStatus: AuthorizationStatus.AUTHORIZED,
    });
    await expect(requestNotificationPermission()).resolves.toBe(true);
  });

  it('is yes when iOS grants provisionally', async () => {
    // Apple's quiet trial mode: delivered to the notification centre
    // without interrupting. They still arrive, so we may still schedule.
    mockRequestPermission.mockResolvedValue({
      authorizationStatus: AuthorizationStatus.PROVISIONAL,
    });
    await expect(requestNotificationPermission()).resolves.toBe(true);
  });

  it('is NO when iOS denies', async () => {
    mockRequestPermission.mockResolvedValue({
      authorizationStatus: AuthorizationStatus.DENIED,
    });
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('is yes when Android 13+ grants POST_NOTIFICATIONS', async () => {
    setPlatform('android', 33);
    mockAndroidRequest.mockResolvedValue('granted');
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(mockAndroidRequest).toHaveBeenCalled();
  });

  it('is NO when Android 13+ denies', async () => {
    setPlatform('android', 33);
    mockAndroidRequest.mockResolvedValue('denied');
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('is yes on Android 12 and below without asking anything', async () => {
    // Notifications are granted at install time there; asking would be
    // a prompt that cannot appear, and answering "no" would turn alerts
    // off for every pre-13 device.
    setPlatform('android', 31);
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(mockAndroidRequest).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});

describe('the onboarding screen acts on the answer', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src/screens/OnboardingScreen.tsx'),
    'utf8',
  ) as string;

  /** Just the notifications arm of the step switch. */
  const branch = src.slice(
    src.indexOf("id === 'notifications'"),
    src.indexOf("id === 'exactAlarms'"),
  );

  it('writes notificationsEnabled, and only when granted', () => {
    // Sliced to the branch rather than matched as one literal line, so
    // that a comment between the guard and the write does not fail this
    // — but an UNCONDITIONAL write still does. That is the same bug
    // wearing the opposite mask: a settings key claiming we may notify
    // while the OS forbids it, which reads as ON in Settings while
    // nothing ever arrives.
    expect(branch).toMatch(/if \(await requestNotificationPermission\(\)\)/);
    expect(branch).toMatch(
      /updateAllSettings\(\{ notificationsEnabled: true \}\)/,
    );
    // Exactly one write, and it is inside the guard.
    expect(branch.match(/notificationsEnabled: true/g)).toHaveLength(1);
    expect(branch.indexOf('requestNotificationPermission()')).toBeLessThan(
      branch.indexOf('notificationsEnabled: true'),
    );
  });

  it('does not ask for the permission its own way', () => {
    // The divergence WAS the bug: Settings asked properly and read the
    // answer, onboarding asked differently and discarded it.
    expect(src).not.toMatch(/notifee\.requestPermission/);
    expect(src).not.toMatch(/PermissionsAndroid/);
  });

  it('honours Reduce Motion in the salam, which its docblock promised', () => {
    // The comment claimed the animation "finishes in 1ms" for these
    // users. Nothing read the setting; it ran at full length for
    // everyone, including the people who had asked for the opposite.
    expect(src).toMatch(/isReduceMotion\(\)/);
    expect(src).toMatch(/opacity\.setValue\(1\)/);
  });
});
