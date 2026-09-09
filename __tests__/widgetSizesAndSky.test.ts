/**
 * The Android widgets are right at every size — and #31 cannot come back.
 *
 * Issue #31, as finally reported with the class name on the card:
 * ArrayIndexOutOfBoundsException on the Next-prayer, Prayer-times and
 * Prayer-times-(tall) widgets, on a phone with all three night marks on.
 * Nine rows (Sunrise, five prayers, three marks) indexed a highlight-box
 * array of eight. The four column arrays are pinned equal here, and the
 * binder indexes the boxes with `getOrNull`, so the lengths can never
 * again decide whether a card renders.
 *
 * The size story: every provider that decides anything from its size draws
 * ONE RemoteViews per size the launcher can show (WidgetSizing, Android 12's
 * size map), and nothing inside a render reads the options bundle for the
 * "current" size. Below 12 the single measured pair still applies.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const KT = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const read = (...p: string[]) => readFileSync(path.join(...p), 'utf8');
const kt = (name: string) => read(KT, `${name}.kt`);

const provider = kt('PrayerWidgetProvider');

function arrayLength(src: string, name: string): number {
  const m = new RegExp(`private val ${name} =\\s*intArrayOf\\(([\\s\\S]*?)\\)`).exec(src);
  expect(m).toBeTruthy();
  return m![1].split('\n').filter(l => /R\.id\./.test(l)).length;
}

describe('the column arrays — issue #31', () => {
  it('are all the same length', () => {
    const wrappers = arrayLength(provider, 'COL_WRAPPERS');
    const boxes = arrayLength(provider, 'COL_BOXES');
    const labels = arrayLength(provider, 'COL_LABELS');
    const times = arrayLength(provider, 'COL_TIMES');
    expect(new Set([wrappers, boxes, labels, times]).size).toBe(1);
    // Nine: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha and the three night marks.
    expect(labels).toBe(9);
  });

  it('every slot the arrays name exists in the list layout', () => {
    const list = read(RES, 'layout', 'prayer_widget.xml');
    for (let i = 0; i < 9; i++) {
      for (const suffix of ['', '_box', '_label', '_time']) {
        expect(list).toContain(`android:id="@+id/widget_col_${i}${suffix}"`);
      }
    }
  });

  it('indexes the boxes defensively anyway', () => {
    expect(provider).toMatch(/val box = COL_BOXES\.getOrNull\(i\)/);
    expect(provider).not.toMatch(/COL_BOXES\[i\]/);
  });

  it('sizes the strip’s times for six columns, not nine', () => {
    expect(provider).toMatch(/const val STRIP_COLUMNS = 6/);
    expect(provider).toMatch(/val slots = if \(layoutId == R\.layout\.prayer_widget\) COL_LABELS\.size else STRIP_COLUMNS/);
    expect(provider).toMatch(/val shown = displayRows\.take\(slots\)/);
  });
});

describe('one RemoteViews per size the launcher can show', () => {
  const sizing = kt('WidgetSizing');

  it('uses the platform size map on Android 12+', () => {
    expect(sizing).toMatch(/OPTION_APPWIDGET_SIZES/);
    expect(sizing).toMatch(/RemoteViews\(map\)/);
    expect(sizing).toMatch(/Build\.VERSION_CODES\.S/);
    // And the single measured pair below it.
    expect(sizing).toMatch(/PrayerWidgetProvider\.sizeDp\(context, mgr, appWidgetId\)/);
  });

  it.each([
    'PrayerWidgetProvider',
    'PrayerWidgetLogProvider',
    'PrayerWidgetStreakProvider',
    'PrayerWidgetReadingProvider',
    'PrayerWidgetSkyProvider',
  ])('%s draws through it', name => {
    expect(kt(name)).toMatch(/WidgetSizing\.responsive\(/);
  });

  it('no size-dependent provider reads the options for the "current" size inside a render', () => {
    for (const name of [
      'PrayerWidgetLogProvider',
      'PrayerWidgetStreakProvider',
      'PrayerWidgetReadingProvider',
      'PrayerWidgetSkyProvider',
    ]) {
      const src = kt(name);
      expect(src).not.toMatch(/PrayerWidgetProvider\.sizeDp\(/);
      expect(src).not.toMatch(/getAppWidgetOptions\(/);
    }
    // The prayer provider owns sizeDp for the pre-12 path and nothing else
    // in it calls it: selectLayout takes the size it is handed.
    const body = provider.slice(provider.indexOf('private fun selectLayout('));
    expect(body.slice(0, body.indexOf('private fun buildViews('))).not.toMatch(/getAppWidgetOptions/);
    expect(provider).toMatch(/private fun selectLayout\(\s*providerName: String\?,\s*width: Int,\s*height: Int,\s*\)/);
  });

  it('every render is handed both dimensions', () => {
    expect(provider).toMatch(/buildViews\(context, id, json, style, providerName, size\.widthDp, size\.heightDp\)/);
    expect(kt('PrayerWidgetLogProvider')).toMatch(/private fun buildViews\(base: Context, widthDp: Int, heightDp: Int\)/);
    expect(kt('PrayerWidgetStreakProvider')).toMatch(/fun buildViews\(base: Context, widthDp: Int, heightDp: Int\)/);
  });
});

describe('the Sky widget is the hero', () => {
  const painter = kt('SkyWidgetPainter');
  const sky = kt('PrayerWidgetSkyProvider');
  const model = read(ROOT, 'src', 'screens', 'home', 'skyModel.ts');

  it('paints the same keyframes as the app', () => {
    // Every hex in the JS model's keyframe table appears in the Kotlin one.
    const jsHex = new Set<string>();
    const table = model.slice(model.indexOf('const KEYS'), model.indexOf('/** The glow'));
    for (const m of table.matchAll(/#[0-9A-Fa-f]{6}/g)) jsHex.add(m[0].toUpperCase());
    const ktTable = painter.slice(painter.indexOf('private val KEYS'), painter.indexOf('/** The glow'));
    for (const hex of jsHex) expect(ktTable.toUpperCase()).toContain(hex);
    // And the same glows.
    for (const hex of ['#E6E9FF', '#FFD9A0', '#FFF3C4', '#FFC27A', '#F2B3A0']) {
      expect(model).toContain(hex);
      expect(painter).toContain(hex);
    }
  });

  it('switches its ink where the app does', () => {
    expect(model).toMatch(/INK_SWITCH_LUMINANCE = 0\.18/);
    expect(painter).toMatch(/INK_SWITCH_LUMINANCE = 0\.18/);
  });

  it('reads a wrapped Isha and a missing Sunrise the way the app does', () => {
    expect(painter).toMatch(/val wrapped = isha < maghrib/);
    expect(painter).toMatch(/val sunriseAt = sunrise \?: \(fajr \+ 90\)/);
    expect(painter).toMatch(/if \(wrapped && n < isha\) return Moment\(Passage\.DUSK/);
  });

  it('keeps its bodies out of the text and draws none on a sliver', () => {
    expect(painter).toMatch(/val cramped = room < 40f \* density/);
    expect(painter).toMatch(/val margin = MOON_DP \* density \/ 2f/);
  });

  it('is registered everywhere a widget has to be', () => {
    const manifest = read(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    expect(manifest).toContain('android:name=".PrayerWidgetSkyProvider"');
    expect(manifest).toContain('@xml/prayer_widget_sky_info');
    expect(provider).toMatch(/PrayerWidgetSkyProvider::class\.java,\s*\)/);
    expect(provider).toMatch(/draw\(context\) \{ PrayerWidgetSkyProvider\.requestUpdate\(context\) \}/);
    expect(sky).toMatch(/mihrab:\/\/today/);
  });

  it('places at 2×2 and resizes both ways', () => {
    const info = read(RES, 'xml', 'prayer_widget_sky_info.xml');
    expect(info).toMatch(/android:targetCellWidth="2"/);
    expect(info).toMatch(/android:targetCellHeight="2"/);
    expect(info).toMatch(/android:resizeMode="horizontal\|vertical"/);
    expect(info).toContain('@layout/prayer_widget_sky_preview');
  });

  it('has a name, a description and a preview line in every locale', () => {
    const dirs = readdirSync(RES).filter(d => /^values(-[a-z]{2})?$/.test(d));
    expect(dirs.length).toBe(13);
    for (const d of dirs) {
      const s = read(RES, d, 'strings.xml');
      for (const key of ['widget_name_sky', 'widget_description_sky', 'widget_preview_sky_next']) {
        expect(s).toMatch(new RegExp(`<string name="${key}">[^<]+</string>`));
      }
    }
  });
});
