/**
 * One Android back listener, answered by whichever screen knows the answer.
 *
 * `useAndroidSubScreenBack` takes an `intercept` and registers exactly one
 * `BackHandler` listener, deliberately: RN calls listeners in reverse
 * registration order, so a second listener added by a child component
 * would work only by an accident of mount order that nothing states and
 * nothing tests. The hook's own header says so.
 *
 * But the screen that OWNS the route is not always the screen that knows
 * what back should mean. `QuranSurahScreen` owns the route and registers
 * the listener; fullscreen — the mode that hides every control, including
 * the way out — belongs to `MushafSurahScreen` under it. Lifting that
 * state up would put a muṣḥaf concern back in the file the muṣḥaf was
 * split out of.
 *
 * So the child publishes an answer into a ref the parent holds, and the
 * parent's single listener asks it. `null` means "nothing to say", which
 * is also what an unmounted child leaves behind.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';

/** What a child publishes: true if it consumed the press. */
export type BackAnswer = (() => boolean) | null;

export type BackInterceptRef = RefObject<BackAnswer>;

/**
 * Publish `answer` for as long as this component is mounted.
 *
 * The ref is cleared on unmount rather than left holding a closure over a
 * dead component's state — a reader that has been popped must not be able
 * to swallow the next screen's back press.
 */
export function usePublishBackAnswer(
  ref: BackInterceptRef | undefined,
  answer: () => boolean,
): void {
  useEffect(() => {
    if (!ref) return undefined;
    ref.current = answer;
    return () => {
      ref.current = null;
    };
  }, [ref, answer]);
}

/** Ask the published answer, if there is one. */
export function askBackAnswer(ref: BackInterceptRef | undefined): boolean {
  return ref?.current?.() ?? false;
}
