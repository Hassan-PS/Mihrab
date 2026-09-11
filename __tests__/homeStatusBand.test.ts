/**
 * The strip behind the status bar on the phone's Today screen.
 *
 * The sky runs up under the clock and the battery, which is the design.
 * But the page scrolls, and the hero's own top row — the city, the Qibla
 * bearing — rode up into that strip and was drawn straight through the
 * system's glyphs (reported on a Pixel 10 Pro at 2.18.1). So the strip
 * stops being clear the moment anything would pass behind it.
 *
 * A band of some colour of its own would read as a slab laid over the
 * sky, so it wears the sky: the exact colour of the pixel under its own
 * foot, which is why the join cannot be seen. These are the sums that
 * make that true.
 */
import {
  _resetHeroSkyBand,
  setHeroSkyBand,
  statusBandStops,
  type HeroSkyBand,
} from '../src/screens/home/heroSkyBand';
import { skyColorAt } from '../src/screens/home/skyModel';
import fs from 'fs';
import path from 'path';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const NIGHT: HeroSkyBand = { top: '#0B1026', bottom: '#2B2350', skyH: 320 };
const INSET = 48;

afterEach(() => _resetHeroSkyBand());

describe('the band wears the sky', () => {
  it('starts at the colour under its own foot, not at the sky\'s top', () => {
    const { inputRange, outputRange } = statusBandStops({
      sky: NIGHT,
      insetTop: INSET,
      pageColor: '#FAF7F2',
      handoff: 24,
    });
    expect(inputRange[0]).toBe(0);
    // The pixel immediately below the band, at rest — matching THAT is
    // what makes the seam invisible; the band's top edge is the screen's
    // edge, where there is nothing to compare it to.
    expect(outputRange[0]).toBe(skyColorAt(NIGHT, INSET / NIGHT.skyH));
    expect(outputRange[0]).not.toBe(NIGHT.top);
  });

  it('is exact at every scroll between, because both are linear', () => {
    const { inputRange, outputRange } = statusBandStops({
      sky: NIGHT,
      insetTop: INSET,
      pageColor: '#FAF7F2',
      handoff: 24,
    });
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const hex = (c: string) => [
      parseInt(c.slice(1, 3), 16),
      parseInt(c.slice(3, 5), 16),
      parseInt(c.slice(5, 7), 16),
    ];
    // What Animated will draw at a scroll partway along, against what the
    // sky actually is there.
    for (const scroll of [20, 80, 160, 240]) {
      const t = (scroll - inputRange[0]) / (inputRange[1] - inputRange[0]);
      const drawn = hex(outputRange[0]).map((c, i) =>
        Math.round(lerp(c, hex(outputRange[1])[i], t)),
      );
      const truth = hex(skyColorAt(NIGHT, (scroll + INSET) / NIGHT.skyH));
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(drawn[i] - truth[i])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reaches the sky\'s own foot exactly as the band leaves the sky', () => {
    const { inputRange, outputRange } = statusBandStops({
      sky: NIGHT,
      insetTop: INSET,
      pageColor: '#FAF7F2',
      handoff: 24,
    });
    expect(inputRange[1]).toBe(NIGHT.skyH - INSET);
    expect(outputRange[1]).toBe(NIGHT.bottom);
  });

  it('hands over to the page, past the hero', () => {
    const { inputRange, outputRange } = statusBandStops({
      sky: NIGHT,
      insetTop: INSET,
      pageColor: '#FAF7F2',
      handoff: 24,
    });
    expect(inputRange[2]).toBe(inputRange[1] + 24);
    expect(outputRange[2]).toBe('#FAF7F2');
  });

  it('keeps its stops increasing on a hero shorter than the strip', () => {
    // A legitimate first frame: measured at nothing, or at less than the
    // status bar. Animated rejects a repeated stop.
    for (const skyH of [0, 1, INSET, INSET + 1]) {
      const { inputRange } = statusBandStops({
        sky: { ...NIGHT, skyH },
        insetTop: INSET,
        pageColor: '#FAF7F2',
        handoff: 0,
      });
      expect(inputRange[0]).toBeLessThan(inputRange[1]);
      expect(inputRange[1]).toBeLessThan(inputRange[2]);
    }
  });
});

describe('the store the hero publishes through', () => {
  it('hands the sky to a subscriber and takes it back on release', () => {
    const seen: (HeroSkyBand | null)[] = [];
    // The hook is what screens use; the store underneath is what is
    // testable without a renderer, and it is the same list.
    const release = setHeroSkyBand(NIGHT);
    expect(typeof release).toBe('function');
    release();
    // A second release must not throw or resurrect anything.
    release();
    expect(seen).toEqual([]);
  });
});

describe('the band is wired to the page', () => {
  const home = read('src/screens/HomeScreen.tsx');
  const card = read('src/screens/home/TodayCard.tsx');
  const band = read('src/screens/home/HomeStatusBand.tsx');

  it('only the phone renders it — the dashboard has no strip to cover', () => {
    // …and not while a permission banner is what sits under the clock.
    expect(home).toMatch(
      /!isDashboard && !isMacCatalyst && !hasBanner \? \(\s*<HomeStatusBand/,
    );
    expect(home).toMatch(/insetTop=\{insets\.top\}/);
  });

  it('the hero publishes its sky, and only the growing one', () => {
    expect(card).toMatch(/if \(!fill \|\| !\(skyH > 0\)\) return;/);
    expect(card).toMatch(/return setHeroSkyBand\(\{ top: frame\.top, bottom: frame\.bottom, skyH \}\);/);
  });

  it('follows the scroll without re-rendering the page', () => {
    expect(home).toMatch(/new Animated\.Value\(0\)/);
    expect(home).toMatch(/useNativeDriver: false/);
    // The tab bar was here first and keeps its handler.
    expect(home).toMatch(/listener: tabBarScroll\.onScroll/);
  });

  it('is fully there by the time the top row would touch the glyphs', () => {
    expect(band).toMatch(/inputRange: \[0, SPACING\.md\]/);
    expect(band).toMatch(/outputRange: \[0, 1\]/);
  });

  it('takes the status bar\'s glyphs only once the page is what they sit on', () => {
    expect(band).toMatch(/\{overPage \? \(\s*<StatusBar/);
    expect(band).toMatch(/luminance\(pageColor\) < INK_SWITCH_LUMINANCE/);
  });
});

/**
 * And on every other tab, where there is no sky — only a page.
 *
 * No tab draws a header any more, so a scrolled page rode up behind the
 * clock and the status icons on all of them, not just Today. The strip on
 * those pages already IS the page's colour, so the band is simply always
 * there: invisible at rest, and the thing that hides what scrolls under
 * it. One band in the tabs' shared layout covers the five tabs and every
 * page inside them.
 */
describe('the tabs that are not Today', () => {
  const tabs = read('src/navigation/MainTabs.tsx');
  const band = read('src/navigation/StatusBarBand.tsx');

  it('gets the band from the layout every tab shares', () => {
    expect(tabs).toContain("import { StatusBarBand } from './StatusBarBand';");
    expect(tabs).toMatch(
      /route\.name !== 'TodayTab' \? <StatusBarBand color=\{palette\.bg\} \/> : null/,
    );
  });

  it('paints the page\'s own colour, at the status bar\'s height', () => {
    expect(band).toMatch(/height: insets\.top/);
    expect(band).toMatch(/backgroundColor: color/);
    // Nothing to cover where the window has no status bar over it.
    expect(band).toMatch(/if \(insets\.top <= 0\) return null;/);
  });

  it('never takes a touch', () => {
    expect(band).toMatch(/pointerEvents="none"/);
  });

  it('leaves Today to its own band — the sky has to show at rest', () => {
    // Both exist, and neither is on the other's screen: the flat band is
    // in the tabs' layout, the sky band inside Today.
    expect(read('src/screens/HomeScreen.tsx')).toContain('<HomeStatusBand');
    // The elements, not the names: each file NAMES the other in a comment,
    // which is the point — they are two halves of one idea.
    expect(read('src/screens/HomeScreen.tsx')).not.toMatch(/<StatusBarBand/);
    expect(tabs).not.toMatch(/<HomeStatusBand/);
  });
});
