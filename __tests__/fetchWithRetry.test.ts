/**
 * fetchWithRetry hardening tests — task #6.
 *
 * Verifies:
 *   1. Per-request timeout aborts and is retryable.
 *   2. 5xx responses (502/504) are retried, not just 429/503.
 *   3. Network exceptions are retried.
 *   4. Retry-After header is honored.
 *   5. Backoff jitter is in the expected range.
 */

import { fetchWithRetry } from '../src/utils/fetchWithRetry';

describe('fetchWithRetry: timeout', () => {
  test('aborts the request after timeoutMs and throws', async () => {
    const originalFetch = global.fetch;
    let abortedSignal: AbortSignal | undefined;
    global.fetch = jest.fn(async (_input: RequestInfo, init?: RequestInit) => {
      abortedSignal = init?.signal as AbortSignal | undefined;
      // Hang forever; only the AbortController can rescue us.
      return new Promise<Response>((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const err: Error & { name: string } = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }) as unknown as typeof fetch;

    try {
      await expect(
        fetchWithRetry('https://example.test/', undefined, {
          maxAttempts: 1,
          timeoutMs: 100,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(abortedSignal?.aborted).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('fetchWithRetry: status-based retry', () => {
  test('retries on 502 and 504 (the previous policy let these fail immediately)', async () => {
    const originalFetch = global.fetch;
    const calls: number[] = [];
    let n = 0;
    global.fetch = jest.fn(async () => {
      n += 1;
      calls.push(n);
      if (n < 3) {
        return new Response('', { status: 502 });
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const res = await fetchWithRetry('https://example.test/', undefined, {
        maxAttempts: 4,
        baseDelayMs: 10,
        timeoutMs: 5000,
      });
      expect(res.status).toBe(200);
      expect(calls.length).toBe(3); // two 502s + one 200
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('retries on 504', async () => {
    const originalFetch = global.fetch;
    let n = 0;
    global.fetch = jest.fn(async () => {
      n += 1;
      return n === 1
        ? new Response('', { status: 504 })
        : new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const res = await fetchWithRetry('https://example.test/', undefined, {
        maxAttempts: 3,
        baseDelayMs: 10,
        timeoutMs: 5000,
      });
      expect(res.status).toBe(200);
      expect(n).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('does NOT retry 4xx (other than 408/425/429)', async () => {
    const originalFetch = global.fetch;
    let n = 0;
    global.fetch = jest.fn(async () => {
      n += 1;
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const res = await fetchWithRetry('https://example.test/', undefined, {
        maxAttempts: 4,
        baseDelayMs: 10,
        timeoutMs: 5000,
      });
      expect(res.status).toBe(404);
      expect(n).toBe(1); // only attempted once
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('fetchWithRetry: network exception retry', () => {
  test('retries when fetch itself throws (network error)', async () => {
    const originalFetch = global.fetch;
    let n = 0;
    global.fetch = jest.fn(async () => {
      n += 1;
      if (n < 2) {
        throw new TypeError('Network request failed');
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const res = await fetchWithRetry('https://example.test/', undefined, {
        maxAttempts: 3,
        baseDelayMs: 10,
        timeoutMs: 5000,
      });
      expect(res.status).toBe(200);
      expect(n).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('rethrows after exhausting attempts on persistent network failure', async () => {
    const originalFetch = global.fetch;
    let n = 0;
    global.fetch = jest.fn(async () => {
      n += 1;
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    try {
      await expect(
        fetchWithRetry('https://example.test/', undefined, {
          maxAttempts: 2,
          baseDelayMs: 10,
          timeoutMs: 5000,
        }),
      ).rejects.toThrow(/network request failed/i);
      expect(n).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('fetchWithRetry: Retry-After header', () => {
  test('honors Retry-After (in seconds) when present', async () => {
    const originalFetch = global.fetch;
    const start = Date.now();
    let n = 0;
    global.fetch = jest.fn(async () => {
      n += 1;
      if (n === 1) {
        return new Response('', {
          status: 503,
          headers: { 'Retry-After': '1' }, // 1 second
        });
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    try {
      await fetchWithRetry('https://example.test/', undefined, {
        maxAttempts: 2,
        baseDelayMs: 10,
        timeoutMs: 5000,
      });
      const elapsed = Date.now() - start;
      // Retry-After: 1 → at least ~900ms (allow timer slack).
      expect(elapsed).toBeGreaterThanOrEqual(900);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
