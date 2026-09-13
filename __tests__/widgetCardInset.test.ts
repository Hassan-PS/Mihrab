/**
 * Android widgets draw a card, not a slab.
 *
 * Reported with a screenshot of two Mihrab widgets stacked on a Pixel home
 * screen: their backgrounds ran together into one block with a seam
 * through it. A widget's host view IS its cell — measured on a Pixel
 * launcher, a 4x1 got [50,966]–[1030,1227] and the next row began where
 * that one ended — so nothing separates two widgets except what they
 * decline to paint, and these painted every pixel of it. Being translucent
 * (88% by default) made it worse: any overlap composited twice and drew a
 * dark line.
 *
 * Measured on an emulator, before and after, same wallpaper and launcher:
 *
 *   before   card 981x261 at x 50..1030   two cards 30px apart
 *   after    card 949x229 at x 66..1014   two cards 62px apart
 *
 * 16px on each side at that density is the 6dp inset below, and the card
 * colour composited to exactly rgb(27,27,29) in BOTH builds — which is the
 * evidence that recolouring the shape reproduces the old fill exactly,
 * alpha included.
 *
 * Three things have to stay true for that to keep working, and each is a
 * different file, which is why they are pinned here rather than trusted:
 *   1. every live widget layout wraps its content in a shell + card,
 *   2. no provider calls `setBackgroundColor` on the root again — that
 *      REPLACES the drawable with a flat ColorDrawable and takes the
 *      rounding with it, which is how the slab happened in the first
 *      place,
 *   3. the card radius defers to the platform's on API 31+, so our corner
 *      lands under the launcher's mask instead of inside it.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ANDROID_RES = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'res',
);
const PROVIDER_DIR = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times',
);

const read = (...parts: string[]) =>
  readFileSync(path.join(...parts), 'utf8');

/** The layouts a provider actually inflates — previews are not placed. */
const LIVE_LAYOUTS = [
  'prayer_widget.xml',
  'prayer_widget_hijri.xml',
  'prayer_widget_log.xml',
  'prayer_widget_reading.xml',
  'prayer_widget_small.xml',
  'prayer_widget_streak.xml',
  'prayer_widget_strip.xml',
  'prayer_widget_tasbih.xml',
];

describe('the live widget layouts', () => {
  it('are the complete set the providers inflate', () => {
    const inflated = new Set<string>();
    for (const f of readdirSync(PROVIDER_DIR)) {
      if (!f.endsWith('.kt')) continue;
      const src = read(PROVIDER_DIR, f);
      for (const m of src.matchAll(/R\.layout\.(prayer_widget[a-z_]*)/g)) {
        inflated.add(`${m[1]}.xml`);
      }
    }
    // If a widget is added and not listed above, every assertion below
    // would silently skip it — so the list is checked, not assumed.
    expect([...inflated].sort()).toEqual([...LIVE_LAYOUTS].sort());
  });

  for (const name of LIVE_LAYOUTS) {
    describe(name, () => {
      const xml = () => read(ANDROID_RES, 'layout', name);

      it('is inset from the host view, so neighbours cannot touch', () => {
        expect(xml()).toContain('android:id="@+id/widget_shell"');
        expect(xml()).toContain('android:padding="@dimen/widget_card_inset"');
      });

      it('draws the rounded card behind its content', () => {
        expect(xml()).toContain('android:id="@+id/widget_card"');
        expect(xml()).toContain('android:src="@drawable/widget_card"');
      });

      it('no longer paints a flat colour edge to edge', () => {
        expect(xml()).not.toContain('android:background="#E01C1C1E"');
      });

      it('keeps widget_root, which providers still pad and make clickable', () => {
        expect(xml()).toContain('android:id="@+id/widget_root"');
      });
    });
  }
});

describe('the providers', () => {
  const providers = readdirSync(PROVIDER_DIR).filter(f => f.endsWith('.kt'));

  it('never call setBackgroundColor on a widget root again', () => {
    for (const f of providers) {
      if (f === 'WidgetCard.kt') continue; // its doc comment quotes the old call
      expect(read(PROVIDER_DIR, f)).not.toContain(
        'setInt(R.id.widget_root, "setBackgroundColor"',
      );
    }
  });

  it('paint the card through the one helper', () => {
    const painters = providers.filter(f =>
      read(PROVIDER_DIR, f).includes('WidgetCard.paint('),
    );
    // Six providers draw a card; PrayerWidgetProvider does it twice.
    expect(painters.length).toBeGreaterThanOrEqual(6);
  });

  it('recolour the shape rather than replacing it', () => {
    const helper = read(PROVIDER_DIR, 'WidgetCard.kt');
    expect(helper).toContain('"setColorFilter"');
    // Without this the shape paints at full opacity and the user's
    // background-strength setting silently stops working.
    expect(helper).toContain('"setImageAlpha"');
    expect(helper).toContain('Color.alpha(argb)');
  });
});

describe('the card geometry', () => {
  it('has an inset and a fallback radius for pre-Android-12', () => {
    const dimens = read(ANDROID_RES, 'values', 'dimens.xml');
    expect(dimens).toMatch(/name="widget_card_inset">\s*\d+dp/);
    expect(dimens).toMatch(/name="widget_card_radius">\s*\d+dp/);
  });

  it('defers to the platform radius on API 31+', () => {
    const v31 = read(ANDROID_RES, 'values-v31', 'dimens.xml');
    expect(v31).toContain(
      '@android:dimen/system_app_widget_background_radius',
    );
  });

  it('draws the card white, so the colour filter is an exact recolour', () => {
    const drawable = read(ANDROID_RES, 'drawable', 'widget_card.xml');
    expect(drawable).toContain('android:color="#FFFFFFFF"');
    expect(drawable).toContain('@dimen/widget_card_radius');
  });

  it('rounds the picker previews to match what gets placed', () => {
    for (const f of readdirSync(path.join(ANDROID_RES, 'layout'))) {
      if (!/^prayer_widget.*_preview\.xml$/.test(f)) continue;
      expect(read(ANDROID_RES, 'layout', f)).not.toContain(
        'android:background="#E01C1C1E"',
      );
    }
  });
});
