/**
 * The one component that reads the word-timing hook and publishes it to
 * `activeWordStore`. Renders nothing; re-renders four times a second while
 * recitation plays, which is the whole point — that cost lands here, once,
 * instead of on every line of every mounted page.
 */
import { useEffect } from 'react';
import { useActiveWordIndex } from './useWordTiming';
import { publishActiveWord } from './activeWordStore';

export function ActiveWordProbe(): null {
  const word = useActiveWordIndex();
  const surah = word?.surah ?? -1;
  const ayah = word?.ayah ?? -1;
  const index = word?.wordIndex ?? -1;
  useEffect(() => {
    publishActiveWord(word ? { surah, ayah, wordIndex: index } : null);
    // By value: the hook hands back a fresh object per poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah, ayah, index]);
  useEffect(() => () => publishActiveWord(null), []);
  return null;
}
