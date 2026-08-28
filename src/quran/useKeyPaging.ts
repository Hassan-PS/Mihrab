/**
 * Turn pages with a keyboard, where there is one.
 *
 * LEFT TURNS FORWARD — the mushaf is a right-to-left book, its pages
 * advance leftwards, and the "next" chevron on screen is the left one.
 *
 *   forward (next page):  ←  A  H
 *   back    (previous):   →  D  L
 *
 * Arrows, WASD and vim's HJKL, all saying the same direction: A and H are
 * "left" in their own convention, D and L are "right". Up and down are not
 * bound — a book does not move that way, and leaving them free lets them
 * scroll a page taller than the window. The mapping itself lives in
 * KeyCommands.swift; this side only hears "forward" and "back".
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
import type { MutableRefObject } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

/** Turn a page. `dir` is READING direction: +1 is the next page of the book. */
export type PageTurner = (dir: 1 | -1) => void;

/**
 * Where the reader currently on screen publishes its page turn.
 *
 * `null` means nobody has: the owner falls back to its own pager, which is
 * what image mode does.
 */
export type KeyPagingTarget = MutableRefObject<PageTurner | null>;

/**
 * Publish this reader's page turn to the one keyboard binding.
 *
 * THE BINDING IS NOT HERE. The Quran reader is `MushafReader`, and that is
 * where the keys are bound — once. In text mode it returns into
 * `MushafSpreadReader` (large screens) or `MushafPhoneReader` before it
 * reaches its own pager, so the pages the reader can see belong to one of
 * those; this is how they say so. Binding the keys in each of them instead
 * would mean two live subscriptions in text mode — a hook cannot be called
 * conditionally — and every press would turn two pages.
 *
 * The registration is cleared on unmount only if it is still ours, so a
 * reader being replaced cannot wipe its successor's.
 */
export function useRegisterKeyPaging(
  target: KeyPagingTarget | undefined,
  turn: PageTurner,
): void {
  useEffect(() => {
    if (!target) return undefined;
    target.current = turn;
    return () => {
      if (target.current === turn) target.current = null;
    };
  }, [target, turn]);
}

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
