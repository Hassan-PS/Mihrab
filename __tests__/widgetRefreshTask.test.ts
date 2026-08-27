/**
 * The refresh glyph on a widget goes and looks, rather than redrawing what
 * it already had.
 *
 * Asked for on 2026-08-27. The button used to broadcast an ordinary widget
 * update, which redrew the same stored payload — a defensible reading of
 * "refresh" and not the one anybody has. It is also the only way to sync
 * from outside the app: auto-sync runs while the app is open, and a widget
 * is what people look at instead of opening the app.
 */
const mockRunSyncNow = jest.fn();
const mockSyncIsReady = jest.fn();
const mockRepublish = jest.fn();

jest.mock('../src/sync/runSync', () => ({
  runSyncNow: (...args: unknown[]) => mockRunSyncNow(...args),
  syncIsReady: (...args: unknown[]) => mockSyncIsReady(...args),
}));

jest.mock('../src/widget/republishWidgetPayload', () => ({
  republishWidgetPayload: (...args: unknown[]) => mockRepublish(...args),
}));

import {
  resetWidgetRefreshThrottle,
  widgetRefreshTask,
  WIDGET_SYNC_MIN_GAP_MS,
} from '../src/widget/widgetRefreshTask';

beforeEach(() => {
  jest.clearAllMocks();
  resetWidgetRefreshThrottle();
  jest.useRealTimers();
  mockSyncIsReady.mockResolvedValue(true);
  mockRunSyncNow.mockResolvedValue({ ok: true, outcome: {}, at: 'now' });
  mockRepublish.mockResolvedValue(true);
});

it('syncs, then rebuilds the payload', async () => {
  const result = await widgetRefreshTask();

  expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  expect(mockRepublish).toHaveBeenCalledWith('widget-refresh');
  expect(result).toEqual({ synced: true, republished: true });
});

it('rebuilds even when there is nothing to sync with', async () => {
  // No folder, or no paired device. The card should still show the right
  // day — that half of "refresh" never depended on sync.
  mockSyncIsReady.mockResolvedValue(false);

  const result = await widgetRefreshTask();

  expect(mockRunSyncNow).not.toHaveBeenCalled();
  expect(mockRepublish).toHaveBeenCalledWith('widget-refresh');
  expect(result.synced).toBe(false);
});

it('rebuilds even when the round fails', async () => {
  // An unreachable folder must not cost the redraw as well.
  mockRunSyncNow.mockRejectedValue(new Error('folder gone'));

  const result = await widgetRefreshTask();

  expect(mockRepublish).toHaveBeenCalledWith('widget-refresh');
  expect(result.synced).toBe(false);
});

it('treats two quick presses as one', async () => {
  await widgetRefreshTask();
  await widgetRefreshTask();

  // The glyph is small and the card does not visibly change while a round
  // is in flight, so it gets tapped again; the second press must not spend
  // a second read of every peer's file for the same answer.
  expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  // But it still redraws, which is what the second press was asking for.
  expect(mockRepublish).toHaveBeenCalledTimes(2);
});

it('syncs again once the gap has passed', async () => {
  const realNow = Date.now;
  try {
    await widgetRefreshTask();
    const later = realNow() + WIDGET_SYNC_MIN_GAP_MS + 1;
    Date.now = () => later;
    await widgetRefreshTask();
    expect(mockRunSyncNow).toHaveBeenCalledTimes(2);
  } finally {
    Date.now = realNow;
  }
});

it('never throws — it is a HeadlessJS entry point', async () => {
  mockSyncIsReady.mockRejectedValue(new Error('storage locked'));
  mockRepublish.mockRejectedValue(new Error('no location'));

  // An unhandled rejection here is a crash in a process the user did not
  // open, from a button they tapped once.
  await expect(widgetRefreshTask()).resolves.toEqual({
    synced: false,
    republished: false,
  });
});
