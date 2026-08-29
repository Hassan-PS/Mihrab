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
 * They now place 4×2 (~210dp). That is still past the thresholds that make
 * them worth a separate entry — the prayer card gets its header and full
 * list at ROWS_MIN_HEIGHT_DP (165dp), the log card its date line and
 * full-height chips past COMPACT_MAX_HEIGHT_DP (145dp) — but it is below
 * the graph's 265dp.
 *
 * Which is why the previews are in this test too. A preview showing a graph
 * the placed card will not draw is worse than no second entry at all: the
 * person picked that entry FOR the thing in the picture, and the card they
 * get is missing it with no hint that a drag would bring it back. So the
 * graph came out of both previews, and the picker descriptions stopped
 * promising it and now say where it is.
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
  ])('the %s preview has no practice graph in it', (_label, file) => {
    const preview = xml('layout', file);
    // The drawable is deliberately still in the tree — see the comment in
    // prayer_widget_tall_preview.xml — but no preview may draw it while the
    // entries place two rows.
    expect(preview).not.toMatch(/android:src="@drawable\/widget_preview_graph"/);
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
