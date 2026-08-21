/**
 * How far ahead the widget can see.
 *
 * The widget's payload is only ever written from the foreground — nothing
 * refreshes it in the background on any platform — so the length of this
 * window is how long the widget survives an app nobody opens. At seven days
 * that was invisible on a phone and was the whole bug on a Mac, where an app
 * installed from Homebrew sits closed for weeks: the window ran out, and the
 * provider had nothing true left to draw.
 *
 * These pin the JS half — that a long window survives into the payload intact
 * and in order. The Swift half (an exhausted window must report itself EMPTY
 * rather than draw a card with no prayer in it) lives in
 * PrayerWidgetExtension.swift and is out of jest's reach.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';
import { WIDGET_WINDOW_DAYS } from '../src/prayer/widgetDayWindow';
import type { TimingsMap } from '../src/types/prayer';

/** A day whose times drift a minute per day, so days are distinguishable. */
function day(i: number): TimingsMap {
  const mm = (base: number) => String(base + i).padStart(2, '0');
  return {
    Fajr: `05:${mm(0)}`,
    Sunrise: `06:${mm(10)}`,
    Dhuhr: `12:${mm(0)}`,
    Asr: `15:${mm(0)}`,
    Maghrib: `18:${mm(0)}`,
    Isha: `19:${mm(0)}`,
  };
}

const NOW = new Date(2026, 7, 18, 14, 0, 0);

describe('the widget window', () => {
  it('carries a full 30-day window into the payload', () => {
    const week = Array.from({ length: 30 }, (_, i) => day(i));
    const p = buildWidgetPayload(week[0], week[1], NOW, 'Stockholm', undefined, undefined, week);
    expect(p.days).toHaveLength(30);
  });

  it('keeps the days consecutive and in order', () => {
    const week = Array.from({ length: 30 }, (_, i) => day(i));
    const p = buildWidgetPayload(week[0], week[1], NOW, undefined, undefined, undefined, week);
    const keys = (p.days ?? []).map(d => d.dateKey);
    expect(keys[0]).toBe('2026-08-18');
    expect(keys[keys.length - 1]).toBe('2026-09-16');
    // Strictly increasing, one day apart, no repeats — the provider builds its
    // timeline boundaries from these and a duplicate or a gap would either
    // collapse entries or strand the highlight.
    const asDates = keys.map(k => new Date(`${k}T00:00:00`).getTime());
    for (let i = 1; i < asDates.length; i++) {
      expect(asDates[i] - asDates[i - 1]).toBe(86_400_000);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries each day its own times, not a repeat of today', () => {
    const week = Array.from({ length: 30 }, (_, i) => day(i));
    const p = buildWidgetPayload(week[0], week[1], NOW, undefined, undefined, undefined, week);
    const fajr = (p.days ?? []).map(d => d.rows.find(r => r.key === 'Fajr')?.time);
    expect(fajr[0]).toBe('05:00');
    expect(fajr[29]).toBe('05:29');
    expect(new Set(fajr).size).toBe(30);
  });

  it('still works when the window is short — a cold cache is not a crash', () => {
    // `cachedDaysFrom` stops at the first day the cache doesn't have, so a
    // fresh install legitimately ships fewer days than the full window. That
    // has to degrade to exactly the old behaviour, not to an empty payload.
    for (const n of [1, 2, 7]) {
      const week = Array.from({ length: n }, (_, i) => day(i));
      const p = buildWidgetPayload(week[0], week[1], NOW, undefined, undefined, undefined, week);
      expect(p.days).toHaveLength(n);
      expect(p.rows.length).toBeGreaterThan(0);
    }
  });

  it('the widget window is longer than the carousel week', () => {
    // The two numbers are deliberately different and easy to accidentally
    // re-unify; if they ever match again the Mac bug is back.
    //
    // They now live in two files: the carousel's week is a rendering concern
    // and stayed in the hook, while the widget's window moved to
    // prayer/widgetDayWindow.ts so the headless republish can share one
    // definition with it rather than keep a second copy in step by hand.
    const hook = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'hooks', 'usePrayerDay.ts'),
      'utf-8',
    );
    const weekDays = Number(/const WEEK_DAYS = (\d+)/.exec(hook)?.[1]);
    expect(weekDays).toBeGreaterThan(0);
    expect(WIDGET_WINDOW_DAYS).toBeGreaterThan(weekDays);
  });

  it('every day in the window carries its own label', () => {
    // The Android provider reads `days[i].dayLabel` for the header now,
    // because the top-level one is stamped when the payload is written and
    // never rolls — so from day two the card stated one date above a
    // different day's times. That fix depends on this field existing on
    // every entry, which makes it a contract rather than a convenience.
    const week = Array.from({ length: 30 }, (_, i) => day(i));
    const p = buildWidgetPayload(week[0], week[1], NOW, 'Stockholm', undefined, undefined, week);
    for (const d of p.days ?? []) {
      expect(typeof d.dayLabel).toBe('string');
      expect(d.dayLabel.length).toBeGreaterThan(0);
      expect(d.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // ...and they are distinct and in order, so the provider can match on one.
    const keys = (p.days ?? []).map(d => d.dateKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it('the widget is fed the long window, not the carousel week', () => {
    const home = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'),
      'utf-8',
    );
    expect(home).toMatch(/widget:\s*\{[\s\S]*state\.widgetWeek/);
  });
});
