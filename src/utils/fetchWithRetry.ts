/**
 * Retries fetch on transient server / rate-limit responses.
 * Honors Retry-After when present (seconds only).
 */
export type FetchWithRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  retryStatuses?: number[];
};

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const sec = parseInt(header.trim(), 10);
  if (Number.isFinite(sec) && sec >= 0) {
    return Math.min(sec * 1000, 60_000);
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit | undefined,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 900;
  const retryStatuses = options.retryStatuses ?? [429, 503];

  let last: Response | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(input, init);
    last = res;

    const shouldRetry =
      retryStatuses.includes(res.status) && attempt < maxAttempts - 1;

    if (!shouldRetry) {
      return res;
    }

    const fromHeader = parseRetryAfterMs(res.headers.get('Retry-After'));
    const backoff = fromHeader ?? baseDelayMs * 2 ** attempt;
    await delay(Math.min(backoff, 30_000));
  }

  return last as Response;
}
