import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { invalidateReduceMotionCache, isReduceMotion } from '../theme/motion';

/**
 * Whether the person has asked the system for less motion — as a hook, so a
 * component can pick a spring or a snap at render time rather than awaiting
 * it inside an effect.
 *
 * Starts false and corrects itself on the first read; the window in which
 * that is wrong is one frame at launch, before anything has animated. Follows
 * the system's own change event so a toggle in Settings takes effect without
 * a relaunch.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void isReduceMotion().then(v => {
      if (alive) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      enabled => {
        invalidateReduceMotionCache();
        setReduce(enabled);
      },
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
