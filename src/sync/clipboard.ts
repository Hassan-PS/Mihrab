/**
 * The clipboard, through our own native module rather than the deprecated one.
 *
 * `Clipboard` from react-native still works in 0.83 and warns on every use
 * that it is going away; `@react-native-clipboard/clipboard` is the
 * replacement and is native code in node_modules, which the F-Droid recipe
 * would have to account for. `MihrabClipboard` is forty lines of app source
 * on each platform and neither problem applies. See the module comments.
 */
import { NativeModules } from 'react-native';

const Native = NativeModules.MihrabClipboard as
  | {
      setString(text: string): Promise<boolean>;
      getString(): Promise<string>;
    }
  | undefined;

export type CopyResult =
  /** Copied, and nothing said so — the app should confirm. */
  | 'copied-quietly'
  /** Copied, and the system already told the user. Saying it again is noise. */
  | 'copied-announced'
  | 'failed';

/**
 * Copy `text`, and say whether the user has already been told.
 *
 * Android 13 shows its own confirmation of every copy, so an app that also
 * shows one gives the user two for one action. iOS shows none. Rather than
 * branch on `Platform.OS` here — which is the sort of thing that goes stale
 * one API level later — each native module answers for its own platform.
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  if (!Native?.setString) return 'failed';
  try {
    const shouldConfirm = await Native.setString(text);
    return shouldConfirm ? 'copied-quietly' : 'copied-announced';
  } catch {
    return 'failed';
  }
}

/** What is on the clipboard, or an empty string. Never throws. */
export async function readClipboard(): Promise<string> {
  if (!Native?.getString) return '';
  try {
    return await Native.getString();
  } catch {
    return '';
  }
}

/** Whether the native side is linked at all. */
export function hasClipboard(): boolean {
  return Boolean(Native?.setString);
}
