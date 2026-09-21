/**
 * The one component that reads the word-timing hook and publishes it to
 * `activeWordStore`. Renders nothing; re-renders four times a second while
 * recitation plays, which is the whole point — that cost lands here, once,
 * instead of on every line of every mounted page.
 */
import { useEffect } from 'react';
import { useActiveWordIndex } from './useWordTiming';
import { publishActiveWord } from './activeWordStore';
import { isWordReaderBusy } from './wordReader';

export function ActiveWordProbe(): null {
  const word = useActiveWordIndex();
  const surah = word?.surah ?? -1;
  const ayah = word?.ayah ?? -1;
  const index = word?.wordIndex ?? -1;
  useEffect(() => {
    // The word reader pauses the recitation while a finger holds a word,
    // and lights and clears its own. Nothing from here may touch that: not
    // the recited word going away when the pause lands, and not the poll
    // or two the recitation is still "playing" before it does, which would
    // paint the recited word over the held one.
    if (isWordReaderBusy()) return;
    publishActiveWord(word ? { surah, ayah, wordIndex: index } : null);
    // By value: the hook hands back a fresh object per poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah, ayah, index]);
  // The readers mount this only while the recitation plays, so the pause
  // the word reader asks for UNMOUNTS it — and that must not put out the
  // held word either.
  useEffect(
    () => () => {
      if (!isWordReaderBusy()) publishActiveWord(null);
    },
    [],
  );
  return null;
}
