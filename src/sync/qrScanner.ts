/**
 * Reading a pairing code off another device's screen.
 *
 * The two platforms do completely different work behind this: iOS decodes
 * QR codes inside the capture pipeline and needs no library at all, while
 * Android drives CameraX and hands frames to ZXing. Neither of those facts
 * belongs anywhere above this file — the caller gets a string or a reason.
 *
 * ── EVERY FAILURE IS NAMED ────────────────────────────────────────────
 *
 * "Nothing was scanned" covers four situations that need four different
 * things said to the user: they backed out, they refused the camera, the
 * camera was refused earlier and the prompt will not appear again, or the
 * device has no camera. Collapsing them into one message would leave
 * someone tapping a button that silently does nothing.
 */
import { NativeModules } from 'react-native';

const Native = NativeModules.ScanQr as
  | {
      isAvailable(): Promise<boolean>;
      scan(
        hint: string,
        cancel: string,
      ): Promise<{ text?: string; cancelled?: boolean }>;
    }
  | undefined;

export type ScanResult =
  | { ok: true; text: string }
  /** The user backed out. Not a failure, and nothing should be said. */
  | { ok: false; reason: 'cancelled' }
  /** They said no, or said no earlier — iOS will not ask twice. */
  | { ok: false; reason: 'denied' }
  /** No camera on this device, or this build has no scanner in it. */
  | { ok: false; reason: 'no-camera' }
  | { ok: false; reason: 'failed'; detail?: string };

/** Whether to offer the button at all. */
export function hasQrScanner(): boolean {
  return Boolean(Native?.scan);
}

/**
 * Whether this device has a camera.
 *
 * Asked rather than assumed: plenty of tablets do not, and Mac Catalyst may
 * or may not depending on the machine. A Scan button that opens a black
 * rectangle is worse than no Scan button.
 */
export async function cameraIsAvailable(): Promise<boolean> {
  if (!Native?.isAvailable) return false;
  try {
    return await Native.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Open the scanner and wait.
 *
 * `hint` and `cancel` are passed in rather than living in the native side's
 * own resources, because the app ships in thirteen languages and the only
 * part that knows which one is running is here.
 */
export async function scanQrCode(
  labels: { hint: string; cancel: string },
): Promise<ScanResult> {
  if (!Native?.scan) return { ok: false, reason: 'no-camera' };
  try {
    const result = await Native.scan(labels.hint, labels.cancel);
    if (result?.text) return { ok: true, text: result.text };
    return { ok: false, reason: 'cancelled' };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'denied') return { ok: false, reason: 'denied' };
    if (code === 'no_camera') return { ok: false, reason: 'no-camera' };
    return {
      ok: false,
      reason: 'failed',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
