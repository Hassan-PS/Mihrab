/**
 * Runtime mushaf font registration — v2.8.0.
 *
 * The font-rendered mushaf needs one font per page (QPC v2: one glyph = one
 * word), and all 604 are downloaded rather than bundled, so they cannot be
 * declared at build time. Both platforms can register a font file at runtime;
 * this is the typed wrapper plus the slot pool that keeps that bounded.
 *
 * ## Why slots
 *
 * React Native caches a typeface per `fontFamily` string and never evicts it.
 * If we addressed fonts as "QCF2001"…"QCF2604", reading the whole mushaf in
 * one sitting would pin 604 typefaces in memory. Instead a small ring of slot
 * families ("MihrabMushaf0"…) is reused: a slot is re-registered with a
 * different page's file when it is recycled, which releases the previous
 * typeface. Pages that are currently mounted are pinned so a slot can never be
 * repurposed out from under a page that is still on screen — that would show
 * another page's words in this page's shape.
 *
 * The pool is deliberately much larger than the pager's mounted window (5), so
 * fast swiping never has to wait on a re-registration, and a page swiped back
 * to is usually still resident.
 */
import { NativeModules, Platform } from 'react-native';

type MushafFontNative = {
  registerFont(family: string, path: string): Promise<string>;
  isValidFont(path: string): Promise<boolean>;
};

const native = (NativeModules as { MushafFont?: MushafFontNative }).MushafFont;

/** Whether the platform module is present (false in tests / old builds). */
export const mushafFontAvailable = native != null;

export const FONT_SLOT_COUNT = 24;

const slotFamily = (slot: number): string => `MihrabMushaf${slot}`;

type SlotState = {
  /** Page currently registered in this slot, or null when never used. */
  page: number | null;
  /** Monotonic counter for LRU. */
  used: number;
  /** Non-zero while a mounted page is drawing with this slot. */
  pins: number;
  /**
   * On iOS the family name comes from the font file itself, so the usable
   * `fontFamily` is whatever registration reported — not the slot name.
   */
  family: string;
  /**
   * False between claiming the slot and the platform accepting the file.
   * Drawing with the family before then would fall back to a system face and
   * render the page's private-use codepoints as tofu.
   */
  ready: boolean;
};

const slots: SlotState[] = Array.from({ length: FONT_SLOT_COUNT }, (_, i) => ({
  page: null,
  used: 0,
  pins: 0,
  family: slotFamily(i),
  ready: false,
}));

let clock = 0;
const byPage = new Map<number, number>(); // page → slot index
const inFlight = new Map<number, Promise<string | null>>();

function pickSlot(): number | null {
  let best: number | null = null;
  let bestUsed = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.pins > 0) continue;
    if (s.page == null) return i; // prefer a virgin slot
    if (s.used < bestUsed) {
      bestUsed = s.used;
      best = i;
    }
  }
  return best;
}

/**
 * Make `page`'s font available and return the `fontFamily` to draw it with.
 * Resolves `null` when the font cannot be registered (missing file, platform
 * module absent) so the caller can fall back to the image renderer.
 */
export async function acquirePageFont(
  page: number,
  path: string,
): Promise<string | null> {
  if (!native) return null;

  const pending = inFlight.get(page);
  if (pending) return pending;

  const existing = byPage.get(page);
  if (existing != null && slots[existing].page === page && slots[existing].ready) {
    slots[existing].used = ++clock;
    return Promise.resolve(slots[existing].family);
  }

  const slot = pickSlot();
  if (slot == null) {
    // Every slot pinned — impossible with 24 slots and a 5-page window, but
    // never block rendering on it.
    console.warn('mushafFont: no free slot for page', page);
    return Promise.resolve(null);
  }

  // Claim the slot NOW, before the first await. The reader loads three pages
  // at once; if the claim waited for registration to come back, every one of
  // them would pick the same free slot and the last registration would win —
  // and since all page fonts share the same codepoints, the losing pages
  // would silently draw ANOTHER page's words in their own line structure.
  const previous = slots[slot].page;
  if (previous != null) byPage.delete(previous);
  slots[slot] = {
    page,
    used: ++clock,
    pins: 0,
    family: slotFamily(slot),
    ready: false,
  };
  byPage.set(page, slot);

  const task = (async (): Promise<string | null> => {
    try {
      const family = await native.registerFont(slotFamily(slot), path);
      // Another page may have taken the slot while we waited (only possible
      // if this page unmounted); don't clobber its family in that case.
      if (slots[slot].page === page) {
        slots[slot].family = family || slotFamily(slot);
        slots[slot].ready = true;
        return slots[slot].family;
      }
      return null;
    } catch (e) {
      console.warn(`mushafFont: register failed for page ${page}`, e);
      if (slots[slot].page === page) {
        slots[slot].page = null;
        byPage.delete(page);
      }
      return null;
    } finally {
      inFlight.delete(page);
    }
  })();

  inFlight.set(page, task);
  return task;
}

/** Synchronous lookup — the family for a page whose font is already loaded. */
export function loadedPageFont(page: number): string | null {
  const slot = byPage.get(page);
  if (slot == null || slots[slot].page !== page || !slots[slot].ready) {
    return null;
  }
  slots[slot].used = ++clock;
  return slots[slot].family;
}

/** Keep `page`'s slot from being recycled while the page is mounted. */
export function pinPageFont(page: number): void {
  const slot = byPage.get(page);
  if (slot != null && slots[slot].page === page) slots[slot].pins += 1;
}

export function unpinPageFont(page: number): void {
  const slot = byPage.get(page);
  if (slot != null && slots[slot].page === page) {
    slots[slot].pins = Math.max(0, slots[slot].pins - 1);
  }
}

/** Does the platform consider this file a usable font? (download validation) */
export async function isValidFontFile(path: string): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isValidFont(path);
  } catch {
    return false;
  }
}

/** Test/diagnostics only. */
export function _resetFontSlots(): void {
  for (let i = 0; i < slots.length; i++) {
    slots[i] = {
      page: null,
      used: 0,
      pins: 0,
      family: slotFamily(i),
      ready: false,
    };
  }
  byPage.clear();
  inFlight.clear();
  clock = 0;
}

export const _fontSlotDebug = () => ({
  platform: Platform.OS,
  slots: slots.map(s => ({ page: s.page, pins: s.pins, family: s.family })),
});
