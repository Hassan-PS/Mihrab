/**
 * What size each picker entry places, and what its picture promises.
 *
 * The two "tall" entries are not second widgets — they are the same
 * providers under second names, so the picker can show a second preview at
 * a second size (Android renders one preview per provider, at the size
 * `targetCell*` names). They defaulted to 4×3, which is a third of a phone
 * screen, and 4×3 was chosen because 3 rows is where the practice graph
 * appears: GRID_MIN_HEIGHT_DP is 265dp and three launcher rows is ~321dp on
 * a 420dpi phone.
 *
 * They now place 4×2. That is past the thresholds that make them worth a
 * separate entry — the prayer card gets its header and full list at
 * ROWS_MIN_HEIGHT_DP (165dp), the log card its date line and full-height
 * chips past COMPACT_MAX_HEIGHT_DP (145dp) — and on an ordinary phone it
 * is past the graph's 265dp too.
 *
 * Which is why the previews are in this test. "Two rows is ~210dp" was
 * measured on a 420dpi emulator and taken for a fact about the widget; on
 * a 1080×2400 phone a launcher row is ~147dp, two rows is ~294dp, and the
 * placed card draws the practice graph. That was reported from a phone
 * against previews that had just had the graph removed on the 210dp
 * arithmetic. So both previews carry the graph — it is what the person
 * choosing this entry gets — and the layouts hand their slack to it, so a
 * grid dense enough to fall short of 265dp shrinks the graph instead of
 * clipping the times above it.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const xml = (dir: string, name: string) =>
  readFileSync(path.join(RES, dir, `${name}.xml`), 'utf8');

const cell = (info: string) => ({
  w: /android:targetCellWidth="(\d+)"/.exec(info)?.[1],
  h: /android:targetCellHeight="(\d+)"/.exec(info)?.[1],
});

describe('what each entry places', () => {
  it.each([
    ['prayer times, short', '4', '1', 'prayer_widget_info'],
    ['prayer times, tall', '4', '2', 'prayer_widget_tall_info'],
    ['log today, short', '4', '1', 'prayer_widget_log_info'],
    ['log today, tall', '4', '2', 'prayer_widget_log_tall_info'],
  ])('%s places %s×%s', (_label, w, h, file) => {
    expect(cell(xml('xml', file))).toEqual({ w, h });
  });

  it('the tall entries are still taller than the short ones', () => {
    // If these ever match, the second picker entry is a duplicate row that
    // places an identical card, and it should be deleted rather than kept.
    const short = Number(cell(xml('xml', 'prayer_widget_info')).h);
    const tall = Number(cell(xml('xml', 'prayer_widget_tall_info')).h);
    expect(tall).toBeGreaterThan(short);
  });

  it('every entry stays resizable to where the graph lives', () => {
    // 4×2 is the default, not a ceiling: a drag to three rows brings the
    // practice graph, and maxResizeHeight has to allow it.
    for (const f of ['prayer_widget_tall_info', 'prayer_widget_log_tall_info']) {
      const info = xml('xml', f);
      expect(info).toMatch(/android:resizeMode="horizontal\|vertical"/);
      expect(Number(/android:maxResizeHeight="(\d+)dp"/.exec(info)?.[1])).toBeGreaterThanOrEqual(321);
    }
  });
});

describe('the previews show what 4×2 actually draws', () => {
  it.each([
    ['prayer times', 'prayer_widget_tall_preview'],
    ['log today', 'prayer_widget_log_tall_preview'],
  ])('the %s preview draws the practice graph', (_label, file) => {
    const preview = xml('layout', file);
    // Two launcher rows is ~294dp on an ordinary 1080×2400 phone, past
    // GRID_MIN_HEIGHT_DP, so the placed card draws it. Reported from such
    // a phone, against a preview that had just dropped it.
    expect(preview).toMatch(/android:src="@drawable\/widget_preview_graph"/);
  });

  it.each([
    ['prayer times', 'prayer_widget_tall_preview'],
    ['log today', 'prayer_widget_log_tall_preview'],
  ])('and the %s preview draws the full card above it', (_label, file) => {
    const preview = xml('layout', file);
    // The header is the line 4×2 buys over 4×1 — a preview that shows the
    // graph but not the header is promising the wrong half.
    expect(preview).toMatch(/android:text="@string\/widget_preview_header"/);
  });
});

describe('the picker descriptions match the placement', () => {
  const LOCALES = [
    'values', 'values-ar', 'values-bn', 'values-de', 'values-es', 'values-fr',
    'values-hi', 'values-in', 'values-ru', 'values-sv', 'values-tr',
    'values-ur', 'values-zh',
  ];

  it.each(LOCALES)('%s says 4×2, in every language', locale => {
    const strings = xml(locale, 'strings');
    for (const name of ['widget_description_tall', 'widget_description_log_tall']) {
      const line = new RegExp(`<string name="${name}">([\\s\\S]*?)</string>`).exec(strings)?.[1];
      expect(line).toBeDefined();
      // × is ×. A description still reading 4×3 is a translation that
      // was left behind, which is the usual way this kind of change rots.
      expect(line).toContain('4\\u00d72');
      expect(line).not.toContain('4\\u00d73');
    }
  });
});
