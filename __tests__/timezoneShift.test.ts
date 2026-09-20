/**
 * THE MORNING MOROCCO WENT BACK TO GMT — issue #56.
 *
 * Reported by Yushi on 2026-09-20, the day the country abolished GMT+1:
 * Fajr was still being shown at 05:49 when Morocco had moved to 04:49, and
 * it stayed wrong for hours. His own follow-up is the diagnosis — the
 * ministry republished late, and then "the refresh just happened in the app
 * right now, which is 3 hours after the dataset update."
 *
 * Three hours, because the only thing that ever noticed was the dataset's
 * six-hourly `index.json` poll. Nothing in the app asked the question it
 * could have answered in the first millisecond from the device's own clock:
 * am I on a different offset from the one these times were stored under?
 *
 * Every prayer time this app stores is a wall-clock string, and a string is
 * a moment only under a rule. These pin the rule changing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deviceUtcOffsetMinutes,
  noticeTimezoneShift,
  pendingTimezoneShift,
  clearTimezoneShiftNotice,
  settleTimezoneShift,
  _resetTimezoneShiftForTests,
} from '../src/prayer/timezoneShift';
import { formatUtcOffset } from '../src/utils/utcOffset';

const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };

const mockDrop = jest.fn(async () => true);
jest.mock('../src/prayer/prayerStorage', () => ({
  dropStoredMonths: (...a: unknown[]) => mockDrop(...(a as [])),
}));

const mockHabous = jest.fn(async () => {});
const mockIfis = jest.fn(async () => {});
jest.mock('../src/providers/habousDataset', () => ({
  refetchHabousDatasetNow: (...a: unknown[]) => mockHabous(...(a as [])),
}));
jest.mock('../src/providers/islamiskaForbundetDataset', () => ({
  refetchIslamiskaForbundetDatasetNow: (...a: unknown[]) => mockIfis(...(a as [])),
}));

/** The device's own offset, which the test cannot change — so it is faked. */
function atOffset(minutes: number): Date {
  const d = new Date('2026-09-20T09:00:00Z');
  jest.spyOn(d, 'getTimezoneOffset').mockReturnValue(-minutes);
  return d;
}

const params = (over: Record<string, unknown> = {}) => ({
  provider: 'habous' as const,
  ...CASABLANCA,
  calculationMethod: 21,
  school: 0,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  mockDrop.mockClear();
  mockHabous.mockClear();
  mockIfis.mockClear();
  _resetTimezoneShiftForTests();
});

describe('reading an offset the way a person does', () => {
  it('is minutes EAST of UTC, not the sign Date gives you', () => {
    // `getTimezoneOffset` answers -60 for GMT+1. Inverting it once, in one
    // place, is the whole reason this function exists.
    expect(deviceUtcOffsetMinutes(atOffset(60))).toBe(60);
    expect(deviceUtcOffsetMinutes(atOffset(0))).toBe(0);
    expect(deviceUtcOffsetMinutes(atOffset(-300))).toBe(-300);
  });

  it('names it the way the announcements did', () => {
    // Morocco's own word for what it was restoring was GMT.
    expect(formatUtcOffset(60)).toBe('GMT+1');
    expect(formatUtcOffset(0)).toBe('GMT');
    expect(formatUtcOffset(-300)).toBe('GMT−5');
    expect(formatUtcOffset(330)).toBe('GMT+5:30');
    expect(formatUtcOffset(-210)).toBe('GMT−3:30');
  });
});

describe('noticing', () => {
  it('says nothing on a device that has never stored an offset', async () => {
    // A first launch has no stale data to distrust, only an unknown past.
    expect(await noticeTimezoneShift(atOffset(60))).toBeNull();
    expect(pendingTimezoneShift()).toBeNull();
  });

  it('reports the shift the morning the country changes', async () => {
    await noticeTimezoneShift(atOffset(60));
    _resetTimezoneShiftForTests(); // a new launch, reading the stored offset

    const shift = await noticeTimezoneShift(atOffset(0));
    expect(shift).toMatchObject({ from: 60, to: 0 });
  });

  it('reports it exactly once, however many loads follow', async () => {
    await noticeTimezoneShift(atOffset(60));
    expect(await noticeTimezoneShift(atOffset(0))).toMatchObject({ from: 60 });
    expect(await noticeTimezoneShift(atOffset(0))).toBeNull();
    expect(await noticeTimezoneShift(atOffset(0))).toBeNull();
  });

  it('and remembers across the launch that follows', async () => {
    await noticeTimezoneShift(atOffset(60));
    await noticeTimezoneShift(atOffset(0));
    _resetTimezoneShiftForTests();
    // The rule has not moved again; the new one is what was stored.
    expect(await noticeTimezoneShift(atOffset(0))).toBeNull();
  });

  it('keeps the notice until it is read, not until the next load', async () => {
    await noticeTimezoneShift(atOffset(60));
    await noticeTimezoneShift(atOffset(0));
    expect(pendingTimezoneShift()).toMatchObject({ from: 60, to: 0 });
    await noticeTimezoneShift(atOffset(0));
    expect(pendingTimezoneShift()).toMatchObject({ from: 60, to: 0 });
    clearTimezoneShiftNotice();
    expect(pendingTimezoneShift()).toBeNull();
  });
});

describe('what a shift throws away', () => {
  /** The device's offset, which a test machine will not change for us. */
  const setOffset = (minutes: number) => {
    jest
      .spyOn(Date.prototype, 'getTimezoneOffset')
      .mockReturnValue(-minutes);
  };
  afterEach(() => jest.restoreAllMocks());

  it('drops this location and re-downloads the table it reads from', async () => {
    setOffset(60);
    await settleTimezoneShift(params()); // records +1, changes nothing
    expect(mockDrop).not.toHaveBeenCalled();

    setOffset(0); // 2026-09-20, Morocco
    const shift = await settleTimezoneShift(params());

    expect(shift).toMatchObject({ from: 60, to: 0 });
    expect(mockDrop).toHaveBeenCalledTimes(1);
    // The dataset above all: for Morocco it is consulted BEFORE the cache,
    // so an untouched city file means the refilled cache is never read.
    expect(mockHabous).toHaveBeenCalledWith(
      CASABLANCA.latitude,
      CASABLANCA.longitude,
    );
  });

  it('asks the right provider, and nothing of one with no table', async () => {
    setOffset(60);
    await settleTimezoneShift(params());
    setOffset(120);

    await settleTimezoneShift(
      params({ provider: 'islamiska_forbundet', ...STOCKHOLM }),
    );
    expect(mockIfis).toHaveBeenCalled();
    expect(mockHabous).not.toHaveBeenCalled();

    setOffset(180);
    await settleTimezoneShift(params({ provider: 'aladhan' }));
    // Nothing published to re-download; the cache drop is the whole of it.
    expect(mockIfis).toHaveBeenCalledTimes(1);
    expect(mockHabous).not.toHaveBeenCalled();
  });

  it('drops only the location being loaded, never the traveller\'s others', async () => {
    // A slot holds times in the local clock of ITS coordinates. Flying
    // Stockholm → Casablanca changes this device's offset and changes
    // nothing whatsoever about Stockholm's table; emptying every slot
    // would cost a traveller their whole offline year.
    setOffset(120);
    await settleTimezoneShift(params({ provider: 'aladhan', ...STOCKHOLM }));
    setOffset(0);
    await settleTimezoneShift(params());

    expect(mockDrop).toHaveBeenCalledTimes(1);
    expect(mockDrop).toHaveBeenCalledWith(expect.objectContaining(CASABLANCA));
  });

  it('does not fail a load when the invalidation cannot finish', async () => {
    // Offline when the clocks change: the download throws, the stored rows
    // still go, and the computed chain answers from the device's own clock
    // — which is by definition running under the new rule.
    mockHabous.mockRejectedValueOnce(new Error('offline'));
    setOffset(60);
    await settleTimezoneShift(params());
    setOffset(0);

    await expect(settleTimezoneShift(params())).resolves.toMatchObject({
      from: 60,
      to: 0,
    });
    expect(mockDrop).toHaveBeenCalled();
  });
});
