/**
 * One slice of an ayah recording, played and stopped — the word reader's
 * player. A second player beside the recitation's queue on purpose; the
 * native modules say why. Absent on a build without it (tests, an older
 * native side), every call answers false.
 */
import { NativeModules } from 'react-native';

type WordPlayerNative = {
  play(path: string, startMs: number, endMs: number): Promise<boolean>;
  stop(): Promise<boolean>;
};

const native = (NativeModules as { WordPlayer?: WordPlayerNative }).WordPlayer;

export const wordPlayerAvailable = native != null;

export const WordPlayer = {
  /** Resolves true once the slice has been heard; false if it could not be, or was cut short. */
  play(path: string, startMs: number, endMs: number): Promise<boolean> {
    if (!native) return Promise.resolve(false);
    return native.play(path, startMs, endMs).catch(() => false);
  },
  stop(): Promise<void> {
    if (!native) return Promise.resolve();
    return native.stop().then(() => undefined, () => undefined);
  },
};
