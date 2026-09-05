/**
 * The other half: a journal write takes the pending alerts away.
 *
 * The builders skipping a logged prayer only helps at the next resync,
 * and the next resync may be hours after the alert. So logging a prayer
 * drops what is already scheduled — from a background notification
 * action too, where there is no screen and no prayer times, which is why
 * everything the cancel needs is encoded in the notification ids.
 */
const mockGetIds = jest.fn();
const mockCancel = jest.fn();
const mockCreate = jest.fn();

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    getTriggerNotificationIds: (...a: unknown[]) => mockGetIds(...a),
    cancelTriggerNotification: (...a: unknown[]) => mockCancel(...a),
    createTriggerNotification: (...a: unknown[]) => mockCreate(...a),
  },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
  TriggerType: { TIMESTAMP: 0 },
  AndroidCategory: {},
  AndroidVisibility: {},
  AuthorizationStatus: {},
  EventType: {},
  RepeatFrequency: {},
  AndroidLaunchActivityFlag: {},
}));

import {
  daruriEndId,
  parseDaruriEndId,
  parseDaruriStartId,
  dropDaruriAlertsForLogged,
} from '../src/notifications/prayerNotifications';

const AT = new Date(2026, 8, 4, 18, 40).getTime();
const MAGHRIB = new Date(2026, 8, 4, 19, 50).getTime();

beforeEach(() => {
  mockGetIds.mockReset();
  mockCancel.mockReset().mockResolvedValue(undefined);
  mockCreate.mockReset().mockResolvedValue(undefined);
});

describe('the ids carry what the canceller needs', () => {
  it('round-trip an end id and its prayers', () => {
    const id = daruriEndId(MAGHRIB, ['DhuhrDaruri', 'AsrDaruri']);
    expect(parseDaruriEndId(id)).toEqual({
      ms: MAGHRIB,
      keys: ['DhuhrDaruri', 'AsrDaruri'],
    });
  });

  it('do not confuse a boundary id with an end id', () => {
    expect(parseDaruriEndId(`pt-daruri-${AT}-AsrDaruri`)).toBeNull();
    expect(parseDaruriStartId(daruriEndId(MAGHRIB, ['AsrDaruri']))).toBeNull();
    expect(parseDaruriStartId(`pt-daruri-${AT}-AsrDaruri`)).toEqual({
      ms: AT,
      key: 'AsrDaruri',
    });
  });

  it('ignore ids belonging to anything else', () => {
    expect(parseDaruriStartId(`pt-${AT}-Asr`)).toBeNull();
    expect(parseDaruriEndId('eod-log-2026-09-04')).toBeNull();
  });
});

describe('logging a prayer', () => {
  it('cancels that prayer’s boundary alert', async () => {
    mockGetIds.mockResolvedValue([`pt-daruri-${AT}-AsrDaruri`]);
    await dropDaruriAlertsForLogged('2026-09-04', ['Asr']);
    expect(mockCancel).toHaveBeenCalledWith(`pt-daruri-${AT}-AsrDaruri`);
  });

  it('leaves another prayer’s alone', async () => {
    mockGetIds.mockResolvedValue([`pt-daruri-${AT}-DhuhrDaruri`]);
    await dropDaruriAlertsForLogged('2026-09-04', ['Asr']);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('leaves another DAY’s alone', async () => {
    mockGetIds.mockResolvedValue([`pt-daruri-${AT}-AsrDaruri`]);
    await dropDaruriAlertsForLogged('2026-09-05', ['Asr']);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('redraws a shared end alert without the logged prayer', async () => {
    const id = daruriEndId(MAGHRIB, ['DhuhrDaruri', 'AsrDaruri']);
    mockGetIds.mockResolvedValue([id]);
    await dropDaruriAlertsForLogged('2026-09-04', ['Dhuhr']);
    expect(mockCancel).toHaveBeenCalledWith(id);
    // Same instant, one fewer name — not simply dropped, which would
    // take Asr's warning away with Dhuhr's.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [notification, trigger] = mockCreate.mock.calls[0];
    expect(notification.id).toBe(daruriEndId(MAGHRIB, ['AsrDaruri']));
    expect(trigger.timestamp).toBe(MAGHRIB);
  });

  it('removes a shared end alert once both are logged', async () => {
    const id = daruriEndId(MAGHRIB, ['DhuhrDaruri', 'AsrDaruri']);
    mockGetIds.mockResolvedValue([id]);
    await dropDaruriAlertsForLogged('2026-09-04', ['Dhuhr', 'Asr']);
    expect(mockCancel).toHaveBeenCalledWith(id);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does nothing at all when nothing was logged', async () => {
    await dropDaruriAlertsForLogged('2026-09-04', []);
    expect(mockGetIds).not.toHaveBeenCalled();
  });
});
