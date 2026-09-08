/**
 * Where the camera is — the Android display cutout's bounding rectangles.
 *
 * The safe-area insets say how tall the cutout band is; they do not say
 * whether the lens is in the middle of it or in a corner, and the
 * fullscreen muṣḥaf lays its surah name out beside the lens. See
 * `DisplayCutoutModule.kt` and `useCutoutSide`.
 */
import { NativeModules, Platform, useWindowDimensions } from 'react-native';
import { useEffect, useState } from 'react';

export type CutoutRect = { x: number; y: number; width: number; height: number };

export type DisplayCutoutInfo = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  /** In dp, relative to the window. Empty where there is no cutout. */
  rects: CutoutRect[];
  windowWidth: number;
};

type DisplayCutoutNative = { getCutout(): Promise<DisplayCutoutInfo> };

const native = NativeModules.DisplayCutout as DisplayCutoutNative | undefined;

export const NO_CUTOUT: DisplayCutoutInfo = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  rects: [],
  windowWidth: 0,
};

export async function getDisplayCutout(): Promise<DisplayCutoutInfo> {
  if (Platform.OS !== 'android' || !native) return NO_CUTOUT;
  try {
    return await native.getCutout();
  } catch {
    return NO_CUTOUT;
  }
}

/** Which side of the status band the camera sits on. */
export type CutoutSide = 'none' | 'left' | 'centre' | 'right';

/**
 * Classify the cutout that touches the TOP edge of the window.
 *
 * Pure, for the tests: `windowWidth` is the width the rects are measured
 * against. A rect whose centre lies in the outer thirds is a corner
 * camera; the middle third is a centred one — a punch-hole 30 dp across
 * on a 411 dp window has plenty of room to be "roughly centred" without
 * being exactly so.
 */
export function classifyTopCutout(
  info: Pick<DisplayCutoutInfo, 'rects' | 'windowWidth'>,
  windowWidth = info.windowWidth,
): { side: CutoutSide; rect: CutoutRect | null } {
  if (!(windowWidth > 0)) return { side: 'none', rect: null };
  // The top-edge cutout: the rect nearest the top. Waterfall or side
  // cutouts (tall, at y well below 0) are not the camera.
  const top = info.rects
    .filter(r => r.y <= 1 && r.height > 0 && r.width > 0)
    .sort((a, b) => a.y - b.y)[0];
  if (!top) return { side: 'none', rect: null };
  const centre = top.x + top.width / 2;
  const side: CutoutSide =
    centre < windowWidth / 3 ? 'left' : centre > (windowWidth * 2) / 3 ? 'right' : 'centre';
  return { side, rect: top };
}

/**
 * The cutout, re-read when the window changes shape (a rotation moves the
 * camera to another edge). `NO_CUTOUT` until it has been read and on iOS,
 * where the island is always centred and the insets already say so.
 */
export function useDisplayCutout(): DisplayCutoutInfo {
  const { width, height } = useWindowDimensions();
  const [info, setInfo] = useState<DisplayCutoutInfo>(NO_CUTOUT);
  useEffect(() => {
    let live = true;
    void getDisplayCutout().then(next => {
      if (live) setInfo(next);
    });
    return () => {
      live = false;
    };
  }, [width, height]);
  return info;
}
