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
    'PrayerWidgetHijriProvider',
    'PrayerWidgetTasbihProvider',
  ])('%s draws through it', name => {
    expect(kt(name)).toMatch(/WidgetSizing\.responsive\(/);
  });

  it('no size-dependent provider reads the options for the "current" size inside a render', () => {
    for (const name of [
      'PrayerWidgetLogProvider',
      'PrayerWidgetStreakProvider',
      'PrayerWidgetReadingProvider',
      'PrayerWidgetSkyProvider',
      'PrayerWidgetHijriProvider',
      'PrayerWidgetTasbihProvider',
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

  it('Hijri and Tasbih drop a line at a short size instead of clipping it', () => {
    const hijri = kt('PrayerWidgetHijriProvider');
    expect(hijri).toMatch(/const val SHORT_HEIGHT_DP = 52/);
    expect(hijri).toMatch(/const val NARROW_WIDTH_DP = 170/);
    expect(hijri).toMatch(/R\.id\.hijri_year, if \(short\) View\.GONE else View\.VISIBLE/);
    expect(hijri).toMatch(/nextMonth\.isEmpty\(\) \|\| short \|\| narrow/);
    // The layout's own floor stays below the threshold, so the short variant is reachable.
    expect(read(RES, 'xml', 'prayer_widget_hijri_info.xml')).toMatch(/android:minResizeHeight="40dp"/);
    const tasbih = kt('PrayerWidgetTasbihProvider');
    expect(tasbih).toMatch(/const val SHORT_HEIGHT_DP = 110/);
    expect(tasbih).toMatch(/R\.id\.tasbih_today, if \(short\) View\.GONE else View\.VISIBLE/);
    expect(read(RES, 'xml', 'prayer_widget_tasbih_info.xml')).toMatch(/android:minResizeHeight="100dp"/);
    // Size 0 is "unknown" and draws the full card — the pre-12 callers with no launcher to ask.
    for (const src of [hijri, tasbih]) expect(src).toMatch(/heightDp in 1 until SHORT_HEIGHT_DP/);
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

  /**
   * The widget's sun crosses the day once, exactly as the app's does.
   * Two ports of one drawing: if only one of them learns that the sun's
   * place comes from the day rather than the passage, the home screen and
   * the app disagree about where the sun is at four in the afternoon.
   */
  it('places the sun from the whole day, at the same span, as the app does', () => {
    for (const src of [model, painter]) {
      expect(src).toMatch(/X_RISE = 0\.12/);
      expect(src).toMatch(/X_SET = 0\.88/);
    }
    // The model solves the arc once and every passage that draws the sun
    // reads it; the port does the same with `sunX`/`sunY`.
    expect(model).toMatch(/const sun = sunAt\(moment\.daylight\);/);
    expect(model).toMatch(/y: Y_LOW - Math\.sin\(f \* Math\.PI\) \* \(Y_LOW - Y_HIGH\)/);
    expect(painter).toMatch(/val sunX = X_RISE \+ f \* \(X_SET - X_RISE\)/);
    expect(painter).toMatch(/val sunY = Y_LOW - sin\(f \* PI\)\.toFloat\(\) \* \(Y_LOW - Y_HIGH\)/);
    // And the day fraction is measured over the same span in both.
    expect(model).toMatch(/maghrib > sunrise \? \(n - sunrise\) \/ \(maghrib - sunrise\) : null/);
    expect(painter).toMatch(/if \(maghrib > sunriseAt\) \(n - sunriseAt\)\.toFloat\(\) \/ \(maghrib - sunriseAt\) else null/);
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

/**
 * "Can't load widget" — the launcher refuses whole layouts over one class.
 *
 * RemoteViews inflates only an allow-list of view classes; anything else
 * (a bare <View> spacer, <Space>, a Material widget) throws
 * "Class not allowed to be inflated" on the launcher side, where no
 * try/catch of ours can turn it into a Mihrab error card. The Sky widget
 * shipped once with a <View> spacer and showed exactly that. Every layout
 * a widget provider inflates — live and preview — is held to the list.
 */
describe('every widget layout inflates under RemoteViews', () => {
  // https://developer.android.com/reference/android/widget/RemoteViews (API 31+, without the
  // collection views this app does not use).
  const ALLOWED = new Set([
    'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout',
    'TextView', 'ImageView', 'ImageButton', 'Button', 'Chronometer', 'ProgressBar',
    'AnalogClock', 'TextClock', 'ViewFlipper', 'AdapterViewFlipper',
    'ListView', 'GridView', 'StackView',
  ]);
  const layoutDir = path.join(RES, 'layout');
  const layouts = readdirSync(layoutDir).filter(f => /^prayer_widget.*\.xml$/.test(f));

  it('covers the live and the preview layouts', () => {
    expect(layouts.length).toBeGreaterThanOrEqual(19);
    expect(layouts).toContain('prayer_widget_sky.xml');
    expect(layouts).toContain('prayer_widget_sky_preview.xml');
  });

  for (const f of layouts) {
    it(`${f} uses only allow-listed classes`, () => {
      const src = read(layoutDir, f);
      const classes = [...src.matchAll(/^\s*<([A-Za-z][A-Za-z0-9_.]*)/gm)].map(m => m[1]);
      expect(classes.length).toBeGreaterThan(0);
      const offenders = classes.filter(c => !ALLOWED.has(c));
      expect(offenders).toEqual([]);
    });
  }
});

/**
 * A throw in ANY provider's render is a Mihrab error card, not the
 * launcher's. Next-prayer and Sky catch their own; the rest go through
 * WidgetErrorCard.guard, and the guard itself never trusts the state it
 * is called in.
 */
describe('every provider degrades to a Mihrab error card', () => {
  const guarded = ['Streak', 'Reading', 'Hijri', 'Tasbih', 'Log'];
  for (const name of guarded) {
    it(`PrayerWidget${name}Provider.buildViews is guarded`, () => {
      const src = kt(`PrayerWidget${name}Provider`);
      expect(src).toMatch(/fun buildViews\([^)]*\): RemoteViews =\s*(\/\/[^\n]*\n\s*)*WidgetErrorCard\.guard\(base, R\.layout\.prayer_widget_[a-z]*, "[a-z]+"\) \{ render\(/);
      expect(src).toMatch(/private fun render\(base: Context/);
    });
  }

  it('Next-prayer and Sky put the class name on the card themselves', () => {
    expect(provider).toMatch(/widget_error\)\} \(\$\{e\.javaClass\.simpleName\}\)/);
    expect(kt('PrayerWidgetSkyProvider')).toMatch(/widget_error\)\} \(\$\{e\.javaClass\.simpleName\}\)/);
  });

  it('the guard shows the class name, not the message, and survives a broken context', () => {
    const src = kt('WidgetErrorCard');
    expect(src).toMatch(/catch \(e: Exception\)/);
    expect(src).not.toMatch(/catch \(e: Throwable\)/);
    expect(src).toMatch(/e\.javaClass\.simpleName/);
    expect(src).not.toMatch(/e\.message/);
    expect(src).toMatch(/try \{ PrayerWidgetProvider\.localized\(base\) \} catch/);
    expect(src).toMatch(/R\.id\.widget_placeholder, View\.VISIBLE/);
    expect(src).toMatch(/R\.id\.widget_content, View\.GONE/);
    expect(src).toMatch(/Log\.e\(PrayerWidgetProvider\.WIDGET_LOG_TAG/);
  });
});

/**
 * The launch burst is one redraw, not ten. The app pushes the same payload
 * several times in the first second; `setData` stores an unchanged payload
 * and redraws only when the last drawn one is over a minute old — and a
 * taken tap queue always forces the next redraw, so a projected tap never
 * outlives the app's verdict on it.
 */
describe('setData coalesces identical pushes', () => {
  const module = kt('PrayerWidgetModule');

  it('skips the fan-out for an unchanged payload drawn within the window', () => {
    expect(module).toMatch(/val unchanged = json == prefs\.getString\(PrayerWidgetProvider\.PREFS_KEY, null\)/);
    expect(module).toMatch(/in 0\.\.FANOUT_COALESCE_MS/);
    expect(module).toMatch(/if \(unchanged && drawnRecently\) \{\s*promise\.resolve\(null\)\s*return\s*\}/);
    expect(module).toMatch(/const val FANOUT_COALESCE_MS = 60_000L/);
  });

  it('still stores the payload and marks the draw when it does redraw', () => {
    expect(module).toMatch(/\.putString\(PrayerWidgetProvider\.PREFS_KEY, json\)[\s\S]*?\.putLong\(PREFS_LAST_FANOUT_MS, now\)[\s\S]*?PrayerWidgetProvider\.requestUpdate\(reactContext\)/);
  });

  it('a taken tap queue forces the next redraw', () => {
    expect(module).toMatch(/WidgetLogQueue\.take\(reactContext\)\s*if \(entries\.isNotEmpty\(\)\) forceNextFanout\(\)/);
    expect(module).toMatch(/WidgetTasbihQueue\.take\(reactContext\)\s*if \(entries\.isNotEmpty\(\)\) forceNextFanout\(\)/);
    expect(module).toMatch(/\.remove\(PREFS_LAST_FANOUT_MS\)/);
  });

  it('appearance and UI-hint changes are never coalesced', () => {
    const appearance = module.slice(
      module.indexOf('fun setAndroidWidgetAppearance'),
      module.indexOf('private fun forceNextFanout'),
    );
    expect(appearance).not.toMatch(/FANOUT_COALESCE_MS|PREFS_LAST_FANOUT_MS/);
    expect(appearance).toMatch(/PrayerWidgetProvider\.requestUpdate\(reactContext\)/);
  });
});
