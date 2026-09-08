/**
 * The fullscreen muṣḥaf and the camera.
 *
 * The row across the status band assumed the camera was in the middle of
 * it; on phones with the lens in a corner the surah name went straight
 * under it, and the download strip — which padded by nothing on Android
 * in fullscreen — did the same. The cutout's own rectangles decide both
 * now (DisplayCutoutModule.kt → src/native/DisplayCutout.ts).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyTopCutout } from '../src/native/DisplayCutout';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const W = 411; // a Pixel's portrait width in dp

describe('classifyTopCutout', () => {
  it('finds no camera where there is no cutout', () => {
    expect(classifyTopCutout({ rects: [], windowWidth: W })).toEqual({ side: 'none', rect: null });
    expect(classifyTopCutout({ rects: [], windowWidth: 0 })).toEqual({ side: 'none', rect: null });
  });

  it('calls a punch-hole in the middle third centred', () => {
    const rect = { x: 190, y: 0, width: 30, height: 30 };
    expect(classifyTopCutout({ rects: [rect], windowWidth: W })).toEqual({ side: 'centre', rect });
  });

  it('tells a corner camera from a centred one', () => {
    const left = { x: 20, y: 0, width: 30, height: 30 };
    const right = { x: W - 50, y: 0, width: 30, height: 30 };
    expect(classifyTopCutout({ rects: [left], windowWidth: W }).side).toBe('left');
    expect(classifyTopCutout({ rects: [right], windowWidth: W }).side).toBe('right');
  });

  it('ignores cutouts that are not on the top edge', () => {
    // Landscape: the camera is on a side edge, tall and far from y = 0.
    const side = { x: 0, y: 190, width: 30, height: 30 };
    expect(classifyTopCutout({ rects: [side], windowWidth: 900 }).side).toBe('none');
  });

  it('prefers the module’s own window width but takes an override', () => {
    const rect = { x: 20, y: 0, width: 30, height: 30 };
    // 35 of 411 is the left third; 35 of 60 is the middle.
    expect(classifyTopCutout({ rects: [rect], windowWidth: W }).side).toBe('left');
    expect(classifyTopCutout({ rects: [rect], windowWidth: W }, 60).side).toBe('centre');
  });
});

describe('the fullscreen phone reader', () => {
  const phone = read('src/quran/MushafPhoneReader.tsx');
  const core = read('src/quran/mushafReaderCore.tsx');
  const reader = read('src/quran/MushafReader.tsx');

  it('puts the surah name on the side away from the camera', () => {
    expect(phone).toMatch(/classifyTopCutout\(cutout, width\)/);
    expect(phone).toMatch(/if \(side === 'left'\) \{\s*return \{ side: 'end'/);
    expect(phone).toMatch(/labelSide=\{label\.side\}/);
    expect(phone).toMatch(/labelMaxWidth=\{label\.maxWidth\}/);
    // The header honours the side and the cap.
    expect(core).toMatch(/labelSide !== 'start' && styles\.pageHeaderLabelEnd/);
    expect(core).toMatch(/labelMaxWidth != null && \{ maxWidth: labelMaxWidth \}/);
  });

  it('pads the download strip past the cutout in fullscreen on Android', () => {
    expect(reader).toMatch(/Math\.max\(cutout\.top, insets\.top\)/);
    expect(reader).not.toMatch(/Platform\.OS !== 'ios' \? 0 :/);
  });

  it('is registered natively', () => {
    expect(read('android/app/src/main/java/com/prayer_times/MainApplication.kt')).toMatch(
      /add\(DisplayCutoutPackage\(\)\)/,
    );
    expect(read('android/app/src/main/java/com/prayer_times/DisplayCutoutModule.kt')).toMatch(
      /rootWindowInsets\?\.displayCutout/,
    );
  });
});
