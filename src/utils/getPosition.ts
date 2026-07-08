import Geolocation from '@react-native-community/geolocation';

/**
 * Staged geolocation — task: "use GPS but also whatever the device has".
 *
 * The old path called `getCurrentPosition({ enableHighAccuracy: true })`
 * once. `enableHighAccuracy: true` forces a GPS lock, which is slow to
 * acquire and often *never* resolves indoors — the exact situation where a
 * user opens the app to check prayer times. Meanwhile the device usually
 * already knows roughly where it is from Wi-Fi / cell / a recent fused fix,
 * which is more than accurate enough for prayer times (they're identical
 * across a whole city).
 *
 * So we fire BOTH in parallel:
 *   • a fast, low-accuracy request (`enableHighAccuracy: false`) that the OS
 *     answers from Wi-Fi / cell / passive providers — resolves in ~1 s,
 *     works indoors, and on the Play build taps Google's network locator
 *     ("locate through Wi-Fi"); and
 *   • a precise GPS request that refines it a moment later.
 *
 * `onFix` may therefore be called up to twice (coarse then fine). Callers
 * de-dupe: a fine fix within ~1 km of the coarse one is a no-op for them.
 * `onError` fires only once BOTH requests have failed, so a coarse miss on a
 * de-Googled device (F-Droid, no network provider) still falls through to
 * GPS instead of erroring — keeping the flow cross-flavor safe.
 */
export type PositionStage = 'coarse' | 'fine';

export type PositionFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  stage: PositionStage;
};

export type PositionError = { code?: number; message?: string };

export type StagedPositionOptions = {
  /** Budget for the fast, low-accuracy fix. Default 8 s. */
  coarseTimeoutMs?: number;
  /** Budget for the precise GPS fix. Default 20 s. */
  fineTimeoutMs?: number;
  /** Accept a cached fix up to this old (ms) for either stage. Default 60 s. */
  maximumAge?: number;
};

export type StagedPositionHandle = { cancel: () => void };

export function getPositionStaged(
  onFix: (fix: PositionFix) => void,
  onError: (err: PositionError) => void,
  opts: StagedPositionOptions = {},
): StagedPositionHandle {
  const coarseTimeoutMs = opts.coarseTimeoutMs ?? 8_000;
  const fineTimeoutMs = opts.fineTimeoutMs ?? 20_000;
  const maximumAge = opts.maximumAge ?? 60_000;

  let cancelled = false;
  let delivered = false;
  let coarseDone = false;
  let fineDone = false;
  let lastError: PositionError | null = null;

  const settleErrorIfBothFailed = () => {
    if (cancelled || delivered) return;
    if (coarseDone && fineDone) {
      onError(lastError ?? { message: 'Location unavailable' });
    }
  };

  const deliver = (
    pos: { coords: { latitude: number; longitude: number; accuracy?: number } },
    stage: PositionStage,
  ) => {
    if (cancelled) return;
    delivered = true;
    onFix({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      stage,
    });
  };

  // Fast coarse fix — Wi-Fi / cell / passive. Usually first to land.
  Geolocation.getCurrentPosition(
    pos => {
      coarseDone = true;
      deliver(pos, 'coarse');
    },
    err => {
      coarseDone = true;
      lastError = { code: err?.code, message: err?.message };
      settleErrorIfBothFailed();
    },
    { enableHighAccuracy: false, timeout: coarseTimeoutMs, maximumAge },
  );

  // Precise GPS fix — refines the coarse one.
  Geolocation.getCurrentPosition(
    pos => {
      fineDone = true;
      deliver(pos, 'fine');
    },
    err => {
      fineDone = true;
      lastError = { code: err?.code, message: err?.message };
      settleErrorIfBothFailed();
    },
    { enableHighAccuracy: true, timeout: fineTimeoutMs, maximumAge },
  );

  return {
    cancel: () => {
      cancelled = true;
    },
  };
}
