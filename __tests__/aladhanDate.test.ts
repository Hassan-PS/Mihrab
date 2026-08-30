/**
 * The date AlAdhan is asked for.
 *
 * Its path segment is DD-MM-YYYY. The app sent ISO `YYYY-MM-DD`, and AlAdhan
 * — which parses day-first and rejects nothing — read `2026-08-30` as day
 * 2026 of month 08 and answered for **30-08-2030**. Four years out on every
 * request, on the app's default provider, with `code: 200` and a response
 * that validates: there was no error anywhere to notice. For Morocco it was
 * also an hour out, because the wrong year sits on the wrong side of the
 * country's Ramadan clock change; that hour is what finally made it visible
 * against the ministry's published table.
 *
 * These tests exist so the ISO formatter — correct for cache keys, dataset
 * lookups and every neighbouring use, which is how it got here — cannot
 * drift back into the URL.
 */
import { formatAladhanDate } from '../src/providers/aladhan';
import { formatLocalDate } from '../src/utils/date';

describe('formatAladhanDate', () => {
  test('is day-first, zero-padded, four-digit year', () => {
    expect(formatAladhanDate(new Date(2026, 7, 30))).toBe('30-08-2026');
    expect(formatAladhanDate(new Date(2026, 0, 1))).toBe('01-01-2026');
    expect(formatAladhanDate(new Date(2024, 1, 29))).toBe('29-02-2024');
    expect(formatAladhanDate(new Date(2026, 11, 31))).toBe('31-12-2026');
  });

  test('is never the ISO form — that is the bug this replaced', () => {
    for (const d of [
      new Date(2026, 7, 30),
      new Date(2026, 0, 1),
      new Date(2027, 5, 15),
    ]) {
      expect(formatAladhanDate(d)).not.toBe(formatLocalDate(d));
      expect(formatAladhanDate(d)).not.toMatch(/^\d{4}-/);
    }
  });

  test('reads the date in local terms, like the rest of the app', () => {
    // 23:30 local on the 30th is still the 30th, whatever UTC thinks.
    expect(formatAladhanDate(new Date(2026, 7, 30, 23, 30))).toBe('30-08-2026');
    // …and 00:30 local on the 31st is the 31st.
    expect(formatAladhanDate(new Date(2026, 7, 31, 0, 30))).toBe('31-08-2026');
  });
});

describe('the request that goes out', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src/providers/aladhan.ts'),
    'utf-8',
  ) as string;
  const code = src
    .split('\n')
    .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');

  test('builds its path segment with the day-first formatter', () => {
    expect(code).toMatch(/const dateStr = formatAladhanDate\(params\.date\)/);
  });

  test('does not reach for the ISO formatter at all', () => {
    expect(code).not.toMatch(/formatLocalDate/);
  });
});
