/**
 * A round finished on the widget is still a round finished.
 *
 * The Tasbih screen writes one to the practice log the moment the target is
 * reached; the widget's taps, replayed through the drain, did not. The
 * counter agreed with the widget while Home's Today summary and the practice
 * graph quietly disagreed with both — a completed set recorded nowhere.
 */
import { Platform } from 'react-native';

jest.mock('../src/native/PrayerWidget', () => ({
  getPrayerWidgetModule: jest.fn(),
}));
jest.mock('../src/practice/practiceStore', () => ({
  recordDhikrSet: jest.fn(async () => {}),
}));
jest.mock('../src/tasbih/tasbihStore', () => ({
  hydrateTasbihState: jest.fn(async () => {}),
  getTasbihState: jest.fn(() => ({ activeId: 'subhanallah' })),
  incrementTasbih: jest.fn(),
  resetTasbih: jest.fn(),
  setActiveTasbih: jest.fn(),
}));

import { syncWidgetTasbihQueue } from '../src/widget/syncWidgetTasbihQueue';
import { getPrayerWidgetModule } from '../src/native/PrayerWidget';
import { recordDhikrSet } from '../src/practice/practiceStore';
import { incrementTasbih } from '../src/tasbih/tasbihStore';

const NOW = 1_760_000_000_000;
const takeTasbihQueue = jest.fn();

/** `n` increments, all recent enough to survive the fourteen-day cutoff. */
function queueOf(n: number): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({ a: 'inc', t: NOW - (n - i) * 1000 })),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  (getPrayerWidgetModule as jest.Mock).mockReturnValue({ takeTasbihQueue });
  (incrementTasbih as jest.Mock).mockReturnValue({ count: 1, reachedTarget: false });
});

describe('syncWidgetTasbihQueue', () => {
  test('records one completed set per round the widget finished', async () => {
    takeTasbihQueue.mockResolvedValue(queueOf(5));
    // The third and fifth taps cross the target.
    let call = 0;
    (incrementTasbih as jest.Mock).mockImplementation(() => {
      call += 1;
      return { count: call, reachedTarget: call === 3 || call === 5 };
    });

    const result = await syncWidgetTasbihQueue(NOW);

    expect(result.applied).toBe(5);
    expect(recordDhikrSet).toHaveBeenCalledTimes(2);
  });

  test('records nothing when no round was completed', async () => {
    takeTasbihQueue.mockResolvedValue(queueOf(4));
    const result = await syncWidgetTasbihQueue(NOW);
    expect(result.applied).toBe(4);
    expect(recordDhikrSet).not.toHaveBeenCalled();
  });

  test('an empty queue is not an event', async () => {
    takeTasbihQueue.mockResolvedValue(null);
    const result = await syncWidgetTasbihQueue(NOW);
    expect(result.applied).toBe(0);
    expect(recordDhikrSet).not.toHaveBeenCalled();
  });

  test('taps older than the cutoff are dropped, and drop no sets with them', async () => {
    const old = NOW - 15 * 24 * 60 * 60 * 1000;
    takeTasbihQueue.mockResolvedValue(
      JSON.stringify([{ a: 'inc', t: old }, { a: 'inc', t: old }]),
    );
    const result = await syncWidgetTasbihQueue(NOW);
    expect(result.dropped).toBe(2);
    expect(result.applied).toBe(0);
    expect(incrementTasbih).not.toHaveBeenCalled();
    expect(recordDhikrSet).not.toHaveBeenCalled();
  });
});
