/**
 * Turn pages with a keyboard, where there is one.
 *
 * Arrows, WASD and vim's HJKL — three sets, because three sets of people
 * reach for three different things and none of them is wrong. Forward is
 * right/down/D/S/L/J; back is left/up/A/W/H/K.
 *
 * Mac and iPad only. Android has no equivalent binding and a phone has no
 * keyboard to press, so the native module simply is not there and this
 * hook does nothing — no platform check to keep in step with reality.
 *
 * The keys are declared on the app delegate, at the END of the responder
 * chain, so anything focused gets them first: typing "d" into the surah
 * search types a "d" rather than turning a page. That is the whole reason
 * this is native rather than a hidden `TextInput` with `onKeyPress`, which
 * on iOS never sees an arrow key at all.
 */
import { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

type KeyCommandsModule = Record<string, unknown>;

const Native = NativeModules.MihrabKeyCommands as
  | KeyCommandsModule
  | undefined;

/** Whether this build can page from a keyboard at all. */
export function hasKeyPaging(): boolean {
  return Boolean(Native);
}

/**
 * Call `onForward` / `onBack` when the reader presses a paging key.
 *
 * The handlers are read through a ref-free dependency list on purpose: a
 * reader that re-renders on every page would otherwise tear down and
 * rebuild the native subscription on every turn.
 */
export function useKeyPaging(
  onForward: () => void,
  onBack: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!Native || !enabled) return undefined;
    // The emitter is constructed per subscription rather than at module
    // scope: building one without a native module attached warns on every
    // platform that does not have this, including every phone.
    const emitter = new NativeEventEmitter(
      Native as unknown as ConstructorParameters<typeof NativeEventEmitter>[0],
    );
    const sub = emitter.addListener(
      'MihrabKeyCommand',
      (event: { action?: string }) => {
        if (event?.action === 'forward') onForward();
        else if (event?.action === 'back') onBack();
      },
    );
    return () => sub.remove();
  }, [onForward, onBack, enabled]);
}
