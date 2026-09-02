/**
 * Two prepared datasets, two server records.
 *
 * Sweden (Islamiska Förbundet) and Morocco (Habous) are built by different
 * jobs on different cadences and cover different windows — most of a year
 * ahead against a couple of weeks. Both used to write their `index.json`
 * snapshot into one slot, so the statistics panel reported whichever had
 * polled last under a heading that named neither: a phone in Stockholm
 * showing eleven days of coverage, which is the Moroccan number and looks
 * like a broken Swedish server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  nextHabousServerRunAfter,
  nextServerRunAfter,
} from '../src/config/datasets';
import {
  getDataStatus,
  recordDataSource,
  recordServerIndex,
  _resetDataStatusMemoForTests,
} from '../src/prayer/dataStatus';

const KEY = 'mihrab.dataStatus.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  _resetDataStatusMemoForTests();
});

const SWEDEN = {
  builtAt: '2026-08-17T03:17:00.000Z',
  serverStatus: 'ok' as const,
  minCoverageDays: 331,
  deadCities: 0,
};
const MOROCCO = {
  builtAt: '2026-08-21T04:41:00.000Z',
  serverStatus: 'ok' as const,
  minCoverageDays: 11,
  deadCities: 0,
};

describe('the two servers are recorded apart', () => {
  it('keeps both snapshots', async () => {
    await recordServerIndex('ifis', SWEDEN, new Date('2026-08-21T12:00:00Z'));
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T13:00:00Z'));

    const s = await getDataStatus();
    expect(s.servers.ifis.minCoverageDays).toBe(331);
    expect(s.servers.habous.minCoverageDays).toBe(11);
    expect(s.servers.ifis.builtAt).toBe(SWEDEN.builtAt);
    expect(s.servers.habous.builtAt).toBe(MOROCCO.builtAt);
  });

  it('the later poll does not overwrite the other one', async () => {
    // The bug, in one assertion: Morocco polling after Sweden used to leave
    // Sweden reading 11 days.
    await recordServerIndex('ifis', SWEDEN, new Date('2026-08-21T12:00:00Z'));
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T13:00:00Z'));
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T19:00:00Z'));

    const s = await getDataStatus();
    expect(s.servers.ifis.minCoverageDays).toBe(331);
    expect(s.servers.ifis.nextCheckDue).toBe('2026-08-21T12:00:00.000Z');
    expect(s.servers.habous.nextCheckDue).toBe('2026-08-21T19:00:00.000Z');
  });

  it('leaves the fetch source alone', async () => {
    await recordDataSource('cdn');
    await recordServerIndex('habous', MOROCCO, new Date('2026-08-21T13:00:00Z'));
    expect((await getDataStatus()).lastSource).toBe('cdn');
  });

  it('starts a dataset that has never answered at unknown', async () => {
    await recordServerIndex('ifis', SWEDEN, new Date('2026-08-21T12:00:00Z'));
    const s = await getDataStatus();
    expect(s.servers.habous.status).toBe('unknown');
    expect(s.servers.habous.minCoverageDays).toBeNull();
  });
});

describe('a blob written before the split', () => {
  it('drops the server fields rather than attributing them to a guess', async () => {
    // Nothing in the old shape says which server wrote it, and the whole
    // point of the split is not to show one server's number under the
    // other's name. The fetch source survives; the next poll refills the
    // rest, minutes later, on the screen that shows them.
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        lastSource: 'cdn',
        lastSourceAt: '2026-08-20T09:00:00.000Z',
        serverBuiltAt: '2026-08-19T04:41:00.000Z',
        serverStatus: 'ok',
        serverMinCoverageDays: 11,
        serverDeadCities: 0,
        serverCheckedAt: '2026-08-20T09:00:00.000Z',
        nextServerCheckDue: '2026-08-20T15:00:00.000Z',
      }),
    );
    _resetDataStatusMemoForTests();

    const s = await getDataStatus();
    expect(s.lastSource).toBe('cdn');
    expect(s.lastSourceAt).toBe('2026-08-20T09:00:00.000Z');
    expect(s.servers.ifis.minCoverageDays).toBeNull();
    expect(s.servers.habous.minCoverageDays).toBeNull();
    expect(s.servers.ifis.status).toBe('unknown');
  });

  it('survives a corrupt blob', async () => {
    await AsyncStorage.setItem(KEY, '{not json');
    _resetDataStatusMemoForTests();
    const s = await getDataStatus();
    expect(s.lastSource).toBeNull();
    expect(s.servers.habous.status).toBe('unknown');
  });
});

describe('and they are expected at different times', () => {
  // Sweden walks a horizon once a week; Morocco can only see the Hijri month
  // its ministry's page is currently showing, so it accumulates daily. The
  // panel showed Sweden's Monday against both, which is the shared slot's
  // mistake wearing a different hat.
  it('Sweden is weekly, on the Monday', () => {
    const next = nextServerRunAfter(new Date('2026-08-21T09:00:00Z'));
    expect(next.getUTCDay()).toBe(1);
    expect(next.toISOString()).toBe('2026-08-24T03:17:00.000Z');
  });

  it('Morocco is the next 04:41, today or tomorrow', () => {
    expect(nextHabousServerRunAfter(new Date('2026-08-21T04:00:00Z')).toISOString())
      .toBe('2026-08-21T04:41:00.000Z');
    expect(nextHabousServerRunAfter(new Date('2026-08-21T09:00:00Z')).toISOString())
      .toBe('2026-08-22T04:41:00.000Z');
  });

  it('and rolls the month, not just the day number', () => {
    expect(nextHabousServerRunAfter(new Date('2026-08-31T23:00:00Z')).toISOString())
      .toBe('2026-09-01T04:41:00.000Z');
  });
});
