/**
 * Typed wrapper for the MushafPageScaler native module (Android Kotlin +
 * iOS Swift) — v2.7.28. Produces high-quality downscaled copies of the
 * mushaf page PNGs at exact display size (see mushafRenderCache.ts).
 */
import { NativeModules } from 'react-native';

type MushafPageScalerModule = {
  /** Scale `srcPath` to `targetWidth` px wide, write PNG to `destPath`. */
  scaleToWidth(
    srcPath: string,
    destPath: string,
    targetWidth: number,
  ): Promise<string>;
};

export function getMushafPageScaler(): MushafPageScalerModule | null {
  const mod = NativeModules.MushafPageScaler as
    | MushafPageScalerModule
    | undefined;
  return mod ?? null;
}
