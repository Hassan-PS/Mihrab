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

/**
 * ── READING THE SOURCE, AND WHY ───────────────────────────────────────
 *
 * What follows asserts against the text of the flow's files rather than
 * rendering them. That is a real limitation and it is the repo's existing
 * idiom for this class of contract: these are statements about what the
 * code is ALLOWED to write, and the failure mode being guarded is a write
 * that is missing, unconditional, or split from its pair — all of which
 * are visible in the source and none of which a happy-path render would
 * catch. A render harness for six screens with four native permission
 * surfaces between them would pin less and break more.
 */
const read = (rel: string): string =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', rel),
    'utf8',
  ) as string;

const ALERTS = 'src/onboarding/screens/AlertsScreen.tsx';
const SALAM = 'src/onboarding/screens/SalamScreen.tsx';
const MADHAB = 'src/onboarding/screens/MadhabScreen.tsx';
const LOCATION = 'src/onboarding/screens/LocationScreen.tsx';
const PERSONALISE = 'src/onboarding/screens/PersonaliseScreen.tsx';
const FLOW = 'src/onboarding/OnboardingFlow.tsx';

describe('the alerts screen acts on the answer', () => {
  const src = read(ALERTS);

  it('writes notificationsEnabled, and only when granted', () => {
    // An UNCONDITIONAL write is the same bug wearing the opposite mask: a
    // settings key claiming we may notify while the OS forbids it, which
    // reads as ON in Settings while nothing ever arrives.
    expect(src).toMatch(/if \(await requestNotificationPermission\(\)\)/);
    expect(src).toMatch(/updateSettings\(\{ notificationsEnabled: true \}\)/);
    expect(src.match(/notificationsEnabled: true/g)).toHaveLength(1);
    expect(src.indexOf('requestNotificationPermission()')).toBeLessThan(
      src.indexOf('notificationsEnabled: true'),
    );
  });

  it('does not ask for the permission its own way', () => {
    // The divergence WAS the bug: Settings asked properly and read the
    // answer, onboarding asked differently and discarded it. Reading the
    // CURRENT state with getNotificationSettings is a different act and
    // stays allowed.
    expect(src).not.toMatch(/notifee\.requestPermission/);
    expect(src).not.toMatch(/PermissionsAndroid/);
  });

  it('calls itself granted only when the app switch is on too', () => {
    // The OS permission outlives the in-app switch: someone who turned
    // alerts off in Settings and re-runs setup still holds it. A face that
    // read the OS alone would show the adhan list as if alerts were on,
    // while the shelf — which reads the switch — hid its alert rows.
    expect(src).toMatch(/osGranted && settings\.notificationsEnabled/);
    // …and the face is derived, never a stored answer that can go stale.
    expect(src).not.toMatch(/setAnswer|setFace/);
  });

  it('folds the exact-alarm grant in rather than branching the step list', () => {
    expect(src).toMatch(/openAlarmPermissionSettings/);
    // The step list may still EXPLAIN why the platform branch went away;
    // what it may not do is declare the step again.
    expect(read('src/onboarding/steps.ts')).not.toMatch(/'exactAlarms'/);
  });
});

describe('the salam screen', () => {
  const src = read(SALAM);

  it('honours Reduce Motion, which its docblock promised', () => {
    // The comment claimed the animation "finishes in 1ms" for these
    // users. Nothing read the setting; it ran at full length for
    // everyone, including the people who had asked for the opposite.
    expect(src).toMatch(/isReduceMotion\(\)/);
    expect(src).toMatch(/opacity\.setValue\(1\)/);
  });

  it('writes languagePicked with the language, never alone', () => {
    // `languagePicked` is what stops the app following the phone. A
    // language written without it is a choice the next launch discards.
    expect(src).toMatch(/language: lang, languagePicked: true/);
  });
});

describe('the school screen', () => {
  const src = read(MADHAB);

  it('writes madhab and school in one call', () => {
    // `selectedMadhab()` falls back to Custom when the stored school no
    // longer describes the stored madhab, so writing one without the
    // other silently discards the answer the user just gave.
    expect(src).toMatch(/madhab,\s*\n\s*school: asrSchoolFor\(madhab\)/);
  });

  it('derives the school rather than hard-coding the Hanafi 1', () => {
    expect(src).toMatch(/asrSchoolFor/);
    expect(src).not.toMatch(/school: 1/);
  });

  it('turns the Maliki second times back off on a change of mind', () => {
    // Otherwise somebody who picked Mālikī and then Shāfiʿī is left with
    // a setting whose control they can no longer see. Sliced to `pick`,
    // where the write is a three-way: on arriving at Mālikī it defaults
    // on, a Mālikī re-picking their own school keeps what they had, and
    // every other school writes it off.
    const pick = src.slice(src.indexOf('const pick ='), src.indexOf('const pickUnsure ='));
    expect(pick).toMatch(/malikiSecondTimesEnabled:\s*\n\s*madhab === 'maliki'/);
    expect(pick).toMatch(/\? settings\.malikiSecondTimesEnabled/);
    expect(pick).toMatch(/: true\s*\n\s*: false/);
  });

  it('is honest about what "not sure" means', () => {
    expect(src).toMatch(/madhab: null,\s*\n\s*school: 0/);
    expect(src).toMatch(/unsureNote/);
  });
});

describe('the location screen', () => {
  const src = read(LOCATION);

  it('has no skip control', () => {
    // App Store guideline 5.1.1(iv): a location pre-permission screen
    // must lead to the prompt with no exit or delay affordance. The
    // manual city path inside LocationSetup is the escape hatch. This is
    // a compliance contract and exactly what a redesign loses quietly.
    expect(src).not.toMatch(/QuietAction/);
    expect(src).not.toMatch(/onboarding\.skip/);
    expect(src).not.toMatch(/onboarding\.notNow/);
  });
});

describe('the personalisation shelf', () => {
  const src = read(PERSONALISE);

  it('writes both adhkar keys from one switch', () => {
    // One habit, one switch. Morning without evening is half a feature
    // and a row whose label lies.
    expect(src).toMatch(
      /morningDuaReminderEnabled: v,\s*\n\s*eveningDuaReminderEnabled: v/,
    );
  });

  it('skips without writing anything', () => {
    // The contract that makes an optional shelf safe to offer: the Skip
    // control advances and does nothing else.
    const skip = src.slice(
      src.indexOf('onboarding-personalise-skip'),
      src.indexOf('footer='),
    );
    expect(skip).toMatch(/onPress=\{onAdvance\}/);
    expect(skip).not.toMatch(/updateSettings/);
  });

  it('offers nothing that needs a permission the user refused', () => {
    // The adhan list and the advance reminder are meaningless to
    // somebody who just declined notifications.
    expect(src).toMatch(/const alertsOn = settings\.notificationsEnabled/);
  });
});

describe('the flow', () => {
  const src = read(FLOW);

  it('writes onboardingComplete only at the end', () => {
    expect(src.match(/onboardingComplete: true/g)).toHaveLength(1);
    // …and only from `finish`, which only the last screen calls.
    const finish = src.slice(
      src.indexOf('const finish ='),
      src.indexOf('const advance ='),
    );
    expect(finish).toMatch(/onboardingComplete: true/);
    expect(src).toMatch(/onFinish=\{finish\}/);
  });

  it('intercepts hardware back instead of dismissing', () => {
    // Leaving should be a decision — Skip, Not now, or Start — not a
    // gesture that drops the user onto a possibly-broken Home.
    expect(src).toMatch(/hardwareBackPress/);
    expect(src).toMatch(/if \(index === 0\) return true/);
  });
});
