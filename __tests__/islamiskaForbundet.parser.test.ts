/**
 * Tests for the extracted parseIslamiskaForbundetHtml function — task #6.
 *
 * The parser was previously inline inside fetchIslamiskaForbundetTimes and
 * untestable without making real HTTP calls. Extracting it makes regression
 * fixtures cheap to add — when the bönetider page format changes (especially
 * each Ramadan), the provider-doctor subagent can save a real HTML response
 * under __tests__/fixtures/islamiskaForbundet/ and add a test here.
 */
import { parseIslamiskaForbundetHtml } from '../src/providers/islamiskaForbundet';
import { ProviderError } from '../src/providers/errors';

/** Build a synthetic table-row HTML response that mimics the widget structure. */
function buildSyntheticHtml(times: string[]): string {
  return `
    <html><head><title>Bönetider</title></head><body>
      <table class="bonetider-widget">
        <tr><td>Fajr</td><td>${times[0]}</td></tr>
        <tr><td>Soluppgång</td><td>${times[1]}</td></tr>
        <tr><td>Dhuhr</td><td>${times[2]}</td></tr>
        <tr><td>Asr</td><td>${times[3]}</td></tr>
        <tr><td>Maghrib</td><td>${times[4]}</td></tr>
        <tr><td>Isha</td><td>${times[5]}</td></tr>
      </table>
    </body></html>`;
}

describe('parseIslamiskaForbundetHtml: happy path', () => {
  test('parses a typical Stockholm response (winter ordering, computes Imsak fallback)', () => {
    const html = buildSyntheticHtml([
      '05:30',
      '07:45',
      '12:00',
      '14:30',
      '16:00',
      '17:30',
    ]);
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result).toEqual({
      Fajr: '05:30',
      Sunrise: '07:45',
      Dhuhr: '12:00',
      Asr: '14:30',
      Maghrib: '16:00',
      Isha: '17:30',
      // Task #7: Imsak fallback computed from Fajr − 10 when site response
      // doesn't include a Ramadan column.
      Imsak: '05:20',
    });
  });

  test('parses a midsummer response with Isha past midnight (Stockholm late May)', () => {
    const html = buildSyntheticHtml([
      '00:48',
      '04:55',
      '12:47',
      '16:54',
      '20:38',
      '23:52',
    ]);
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Isha).toBe('23:52');
  });

  test('parses Isha actually past midnight (e.g. 00:45)', () => {
    const html = buildSyntheticHtml([
      '01:30',
      '03:30',
      '12:50',
      '17:00',
      '21:50',
      '00:45',
    ]);
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Isha).toBe('00:45');
  });
});

describe('parseIslamiskaForbundetHtml: defensive parsing', () => {
  test('strips <script> blocks so embedded HH:MM literals do not poison extraction', () => {
    // A naive parser would pick up "00:00" and "99:99" from the script tag.
    const html = `
      <script>
        var ts = "00:00";
        var max = "99:99";
        var marker = "11:11";
      </script>
      ${buildSyntheticHtml(['05:30', '07:45', '12:00', '14:30', '16:00', '17:30'])}
    `;
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Fajr).toBe('05:30');
  });

  test('strips <style> blocks (CSS can include accidental HH:MM-like values)', () => {
    const html = `
      <style>
        .clock { content: "12:34"; }
      </style>
      ${buildSyntheticHtml(['05:30', '07:45', '12:00', '14:30', '16:00', '17:30'])}
    `;
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Fajr).toBe('05:30');
  });

  test('rejects invalid hour/minute ranges (defensive: 99:99 is not a real time)', () => {
    // Note: parser drops out-of-range values silently. So a response with
    // 99:99 noise plus 6 valid times still parses.
    const html = `
      <p>Junk: 99:99 88:00 25:00</p>
      ${buildSyntheticHtml(['05:30', '07:45', '12:00', '14:30', '16:00', '17:30'])}
    `;
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Fajr).toBe('05:30');
  });
});

describe('parseIslamiskaForbundetHtml: failure modes', () => {
  test('throws ProviderError(shape) when fewer than 6 times found', () => {
    const html = '<p>Maintenance — site offline. Back at 12:00.</p>';
    expect(() => parseIslamiskaForbundetHtml(html, 'Stockholm')).toThrow(
      ProviderError,
    );
    try {
      parseIslamiskaForbundetHtml(html, 'Stockholm');
    } catch (e) {
      expect((e as ProviderError).category).toBe('shape');
      expect((e as ProviderError).provider).toBe('islamiska_forbundet');
      expect((e as ProviderError).message).toMatch(/Stockholm/);
    }
  });

  test('throws ProviderError(shape) when prayer times are out of order', () => {
    // 6 times, but Sunrise is before Fajr — site layout changed.
    const html = buildSyntheticHtml([
      '05:30',
      '04:00', // Sunrise BEFORE Fajr — clearly wrong
      '12:00',
      '14:30',
      '16:00',
      '17:30',
    ]);
    expect(() => parseIslamiskaForbundetHtml(html, 'Stockholm')).toThrow(
      /out of order/i,
    );
  });

  test('throws ProviderError(shape) when Isha is on the wrong side of midnight (parse error)', () => {
    // Isha at 19:00 with Maghrib at 21:50 — clearly a parse error, not a wrap.
    // 19:00 is above the 06:00 wrap threshold so it stays as-is and fails order.
    const html = buildSyntheticHtml([
      '01:30',
      '03:30',
      '12:50',
      '17:00',
      '21:50',
      '19:00',
    ]);
    expect(() => parseIslamiskaForbundetHtml(html, 'Stockholm')).toThrow(
      /out of order/i,
    );
  });

  test('throws when given completely empty HTML', () => {
    expect(() => parseIslamiskaForbundetHtml('', 'Stockholm')).toThrow(
      ProviderError,
    );
  });

  test('error message includes the count of time-shaped tokens found', () => {
    const html = '<p>Only one time visible: 12:00.</p>';
    try {
      parseIslamiskaForbundetHtml(html, 'TestCity');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/Found 1 time-shaped tokens/);
    }
  });
});
