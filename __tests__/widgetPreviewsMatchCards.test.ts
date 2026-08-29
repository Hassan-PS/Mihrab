/**
 * The picker previews have to show the card you actually get.
 *
 * They are hand-maintained mock-ups — every one of them says "keep in step
 * by hand" at the top — so they drift silently, and the place they drift
 * is the one screen where someone decides whether to place the widget at
 * all. Four drifts were found by installing the release build on an
 * emulator and reading the picker:
 *
 *   1. The Log previews drew the due chip as "+". The card draws a hollow
 *      "✓" and has since the plus was deliberately dropped — the provider
 *      says why: "A hollow tick, not a plus… the empty and the done states
 *      are one glyph in two weights". The preview even contradicted its own
 *      footer, which read "Tap ✓ to log Asr on time" under a + chip.
 *   2. The prayer previews labelled sunrise "Shurūq". The card shows the
 *      localized name the payload carries — "Sunrise" in English.
 *   3. The 2×1 Next prayer preview clipped its own time to "16:5": the
 *      card autosizes that text and the preview hardcoded 36sp.
 *   4. Both tall previews had a dead band across the bottom third, left
 *      behind when the practice graph came out at 4×2.
 *
 * None of it is reachable from the app, so nothing else can catch it.
 */
import { readFileSync } from 'fs';
import path from 'path';

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const layout = (n: string) => readFileSync(path.join(RES, 'layout', `${n}.xml`), 'utf8');
const strings = (dir: string) => readFileSync(path.join(RES, dir, 'strings.xml'), 'utf8');
const provider = readFileSync(
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com',
    'prayer_times', 'PrayerWidgetLogProvider.kt'),
  'utf8',
);

const LOG_PREVIEWS = ['prayer_widget_log_preview', 'prayer_widget_log_tall_preview'];
const PRAYER_PREVIEWS = ['prayer_widget_strip_preview', 'prayer_widget_tall_preview'];
const TALL_PREVIEWS = ['prayer_widget_tall_preview', 'prayer_widget_log_tall_preview'];

describe('the log previews draw the chip the card draws', () => {
  it('the card draws a hollow tick', () => {
    // Pinning the source of truth, so this test fails loudly rather than
    // silently inverting if the card ever goes back to a plus.
    expect(provider).toMatch(/widget_log_chip_due\)\s*\n\s*views\.setTextViewText\(CHIPS\[i\], "✓"\)/);
  });

  it.each(LOG_PREVIEWS)('%s draws it too, and never a plus', name => {
    const xml = layout(name);
    expect(xml).toMatch(/android:text="✓"[^>]*widget_log_chip_due|widget_log_chip_due[^>]*android:text="✓"/);
    expect(xml).not.toMatch(/android:text="\+"/);
  });

  it('and the footer copy agrees with the glyph', () => {
    // "Tap ✓ …" under a + chip was the visible contradiction.
    expect(strings('values')).toMatch(/widget_log_tap_to_log">Tap ✓/);
  });
});

describe('the prayer previews name sunrise the way the card does', () => {
  it.each(PRAYER_PREVIEWS)('%s says Sunrise, not a transliteration', name => {
    const xml = layout(name);
    expect(xml).toMatch(/android:text="Sunrise"/);
    expect(xml).not.toMatch(/Shur/);
  });
});

describe('nothing in a preview is clipped by its own font size', () => {
  it('the 2x1 card autosizes its time, and so does its preview', () => {
    for (const name of ['prayer_widget_small', 'prayer_widget_small_preview']) {
      expect(layout(name)).toMatch(/android:autoSizeTextType="uniform"/);
    }
  });
});

describe('the 4x2 previews fill their box', () => {
  it.each(TALL_PREVIEWS)('%s gives the slack to a content row', name => {
    const xml = layout(name);
    // A weighted row inside the card, not a weighted spacer after the
    // footer — that spacer is what left the dead band.
    expect(xml).toMatch(/android:layout_height="0dp"\s*\n\s*android:layout_weight="1"\s*\n\s*android:orientation="horizontal"/);
    expect(xml).not.toMatch(/<TextView\s*\n\s*android:layout_width="match_parent"\s*\n\s*android:layout_height="0dp"\s*\n\s*android:layout_weight="1"\s*\/>/);
  });
});

describe('the mock data in a preview holds together', () => {
  it('the reading card names the same page twice', () => {
    // "Page 3 · Juz 1" sat two lines above "47 of 604 · 8% read".
    const s = strings('values');
    const pos = /widget_preview_reading_position">([^<]+)</.exec(s)?.[1] ?? '';
    const prog = /widget_preview_reading_progress">([^<]+)</.exec(s)?.[1] ?? '';
    const posPage = Number(/(\d+)/.exec(pos)?.[1]);
    const progPage = Number(/(\d+)/.exec(prog)?.[1]);
    expect(posPage).toBe(progPage);
  });

  it('and every locale moved with it', () => {
    const LOCALES = ['values', 'values-ar', 'values-bn', 'values-de', 'values-es',
      'values-fr', 'values-hi', 'values-in', 'values-ru', 'values-sv',
      'values-tr', 'values-ur', 'values-zh'];
    for (const l of LOCALES) {
      const pos = /widget_preview_reading_position">([^<]+)</.exec(strings(l))?.[1] ?? '';
      expect(pos).toMatch(/47/);
    }
  });
});
