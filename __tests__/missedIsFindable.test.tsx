/**
 * `missed` is not only a verdict — it is how people note that a prayer is
 * owed and will be made up. So a day holding one has to be findable on the
 * graph afterwards, even when the rest of that day went well.
 *
 * And the ramp has to rank the statuses the way the user reads them: a
 * prayer prayed late is closer to kept than one made up days later.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  STATUS_WEIGHT,
  scoreByDay,
  upsertEntry,
  type JournalEntry,
} from '../src/journal/journal';
import {
  buildHeatmap,
  HEATMAP_WEEKS,
  PracticeHeatmap,
} from '../src/practice/PracticeHeatmap';
import { dayKey } from '../src/practice/practiceStore';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      accent: '#2E7D5B',
      text: '#111111',
      muted: '#777777',
      controlBg: '#EFEAE3',
      danger: '#B3261E',
      border: '#DDDDDD',
      card: '#FFFFFF',
      bg: '#FFFFFF',
      mode: 'light',
    },
  }),
}));

const NOW = new Date(2026, 4, 13, 12, 0, 0); // Wed 13 May 2026
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
type Renderer = ReactTestRenderer;

function squares(tree: Renderer) {
  return tree.root.findAll(
    n =>
      typeof n.props?.testID === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(n.props.testID),
  );
}

/**
 * The corner dot is the square's only child, and the only absolutely
 * positioned thing inside it — matched on that rather than on a testID so
 * the test is about what the user can see, not about a hook left for it.
 */
function hasMissedMark(tree: Renderer, key: string): boolean {
  const square = squares(tree).find(n => n.props.testID === key);
  if (!square) throw new Error(`no square for ${key}`);
  return (
    square.findAll(n =>
      JSON.stringify(n.props?.style ?? '').includes('"position":"absolute"'),
    ).length > 0
  );
}

async function render(
  scores: Map<string, { kept: number; logged: number; missed: number }>,
) {
  const rows = buildHeatmap(scores, new Set(), NOW, HEATMAP_WEEKS);
  let tree!: Renderer;
  await act(async () => {
    tree = create(<PracticeHeatmap rows={rows} weekdayLabels={LABELS} />);
  });
  return tree;
}

describe('the status ramp ranks the way a user reads it', () => {
  test('on-time beats late beats qadha beats missed', () => {
    expect(STATUS_WEIGHT['on-time']).toBeGreaterThan(STATUS_WEIGHT.late);
    expect(STATUS_WEIGHT.late).toBeGreaterThan(STATUS_WEIGHT.qadha);
    expect(STATUS_WEIGHT.qadha).toBeGreaterThan(STATUS_WEIGHT.missed);
  });

  test('missed is worth nothing, so it darkens nothing', () => {
    expect(STATUS_WEIGHT.missed).toBe(0);
  });

  test('a day of five late is a darker square than a day of five qadha', () => {
    let late: JournalEntry[] = [];
    let qadha: JournalEntry[] = [];
    for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const) {
      late = upsertEntry(late, '2026-05-11', p, 'late', NOW);
      qadha = upsertEntry(qadha, '2026-05-11', p, 'qadha', NOW);
    }
    const keptLate = scoreByDay(late).get('2026-05-11')!.kept;
    const keptQadha = scoreByDay(qadha).get('2026-05-11')!.kept;
    expect(keptLate).toBeGreaterThan(keptQadha);
  });

  test('neither is flattened to nothing — both mean the prayer was prayed', () => {
    expect(STATUS_WEIGHT.late).toBeGreaterThan(0);
    expect(STATUS_WEIGHT.qadha).toBeGreaterThan(0);
  });
});

describe('scoreByDay counts missed prayers separately', () => {
  test('counts them', () => {
    let entries = upsertEntry([], '2026-05-11', 'Fajr', 'missed', NOW);
    entries = upsertEntry(entries, '2026-05-11', 'Asr', 'missed', NOW);
    entries = upsertEntry(entries, '2026-05-11', 'Isha', 'on-time', NOW);
    const score = scoreByDay(entries).get('2026-05-11')!;
    expect(score.missed).toBe(2);
    expect(score.logged).toBe(3);
  });

  test('a day with none reports zero, not undefined', () => {
    const entries = upsertEntry([], '2026-05-11', 'Fajr', 'late', NOW);
    expect(scoreByDay(entries).get('2026-05-11')!.missed).toBe(0);
  });

  test('qadha is not counted as missed — it is the opposite', () => {
    const entries = upsertEntry([], '2026-05-11', 'Fajr', 'qadha', NOW);
    expect(scoreByDay(entries).get('2026-05-11')!.missed).toBe(0);
  });
});

describe('buildHeatmap carries the count to the square', () => {
  test('carries it', () => {
    const today = dayKey(NOW);
    const rows = buildHeatmap(
      new Map([[today, { kept: 4, logged: 5, missed: 1 }]]),
      new Set(),
      NOW,
    );
    expect(rows[2][HEATMAP_WEEKS - 1].missed).toBe(1);
  });

  test('a day with no score reports zero', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW);
    expect(rows[0][0].missed).toBe(0);
  });
});

describe('the mark on the graph', () => {
  test('a good day carrying ONE missed prayer is still marked', async () => {
    // The case the whole change is for: four on-time and one missed draws a
    // strong green square, and without the mark the day is unfindable.
    const day = '2026-05-11';
    const tree = await render(
      new Map([[day, { kept: 4, logged: 5, missed: 1 }]]),
    );
    expect(hasMissedMark(tree, day)).toBe(true);
  });

  test('a perfect day is not marked', async () => {
    const day = '2026-05-11';
    const tree = await render(
      new Map([[day, { kept: 5, logged: 5, missed: 0 }]]),
    );
    expect(hasMissedMark(tree, day)).toBe(false);
  });

  test('an untouched day is not marked', async () => {
    const tree = await render(new Map());
    expect(hasMissedMark(tree, '2026-05-11')).toBe(false);
  });

  test('a day of nothing but missed prayers is marked', async () => {
    const day = '2026-05-11';
    const tree = await render(
      new Map([[day, { kept: 0, logged: 5, missed: 5 }]]),
    );
    expect(hasMissedMark(tree, day)).toBe(true);
  });

  test('a day logged entirely as qadha is NOT marked', async () => {
    // Nothing is owed on it — it was made up.
    const day = '2026-05-11';
    const tree = await render(
      new Map([[day, { kept: 2.25, logged: 5, missed: 0 }]]),
    );
    expect(hasMissedMark(tree, day)).toBe(false);
  });

  test('the screen reader is told, not only the eye', async () => {
    const day = '2026-05-11';
    const tree = await render(
      new Map([[day, { kept: 4, logged: 5, missed: 1 }]]),
    );
    const square = squares(tree).find(n => n.props.testID === day)!;
    expect(String(square.props.accessibilityLabel)).toContain('issed');
  });

  test('a day without one says nothing about missing', async () => {
    const day = '2026-05-11';
    const tree = await render(
      new Map([[day, { kept: 5, logged: 5, missed: 0 }]]),
    );
    const square = squares(tree).find(n => n.props.testID === day)!;
    expect(String(square.props.accessibilityLabel)).not.toContain('issed');
  });
});
