/**
 * ProviderError class + helper detector tests — task #6.
 */
import {
  ProviderError,
  isAbortOrTimeoutError,
  isNetworkError,
} from '../src/providers/errors';

describe('ProviderError', () => {
  test('preserves provider, category, message', () => {
    const e = new ProviderError('aladhan', 'timeout', 'AlAdhan request timed out');
    expect(e.provider).toBe('aladhan');
    expect(e.category).toBe('timeout');
    expect(e.message).toBe('AlAdhan request timed out');
    expect(e.name).toBe('ProviderError');
    expect(e instanceof Error).toBe(true);
    expect(e instanceof ProviderError).toBe(true);
  });

  test('attaches optional status, attempts, cause', () => {
    const cause = new Error('socket hangup');
    const e = new ProviderError('prayertimes_dev', 'server', 'Bad gateway', {
      status: 502,
      attempts: 3,
      cause,
    });
    expect(e.status).toBe(502);
    expect(e.attempts).toBe(3);
    expect(e.cause).toBe(cause);
  });

  test('all categories are valid', () => {
    const cats = [
      'network',
      'timeout',
      'unauthorized',
      'server',
      'shape',
      'unknown',
    ] as const;
    for (const c of cats) {
      const e = new ProviderError('aladhan', c, `test ${c}`);
      expect(e.category).toBe(c);
    }
  });
});

describe('isAbortOrTimeoutError', () => {
  test('matches AbortError by name', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(isAbortOrTimeoutError(e)).toBe(true);
  });

  test('matches TimeoutError by name', () => {
    const e = new Error('timed out');
    e.name = 'TimeoutError';
    expect(isAbortOrTimeoutError(e)).toBe(true);
  });

  test('matches by message contents', () => {
    expect(isAbortOrTimeoutError(new Error('Operation aborted'))).toBe(true);
    expect(isAbortOrTimeoutError(new Error('Request timed out'))).toBe(true);
    expect(isAbortOrTimeoutError(new Error('connection timeout'))).toBe(true);
  });

  test('does not match unrelated errors', () => {
    expect(isAbortOrTimeoutError(new Error('Bad JSON'))).toBe(false);
    expect(isAbortOrTimeoutError(new Error('404 Not Found'))).toBe(false);
    expect(isAbortOrTimeoutError(null)).toBe(false);
    expect(isAbortOrTimeoutError(undefined)).toBe(false);
  });
});

describe('isNetworkError', () => {
  test('matches React Native "Network request failed" TypeError', () => {
    const e = new TypeError('Network request failed');
    expect(isNetworkError(e)).toBe(true);
  });

  test('matches browser "Failed to fetch"', () => {
    const e = new TypeError('Failed to fetch');
    expect(isNetworkError(e)).toBe(true);
  });

  test('matches Safari "Load failed"', () => {
    const e = new TypeError('Load failed');
    expect(isNetworkError(e)).toBe(true);
  });

  test('does not match generic Error or other categories', () => {
    expect(isNetworkError(new Error('Network request failed'))).toBe(false); // wrong name
    expect(isNetworkError(new TypeError('Cannot read property'))).toBe(false); // wrong message
    expect(isNetworkError(null)).toBe(false);
  });
});
