/**
 * Categorised provider error — task #6.
 *
 * All four prayer-time providers throw `ProviderError` so callers (usePrayerDay,
 * the eventual debug screen) can react to specific failure modes instead of
 * pattern-matching error message strings.
 *
 * Categories:
 *   • `network`      — fetch rejected (offline, DNS failure, connection reset).
 *   • `timeout`      — request didn't complete within the per-request timeout
 *                      (AbortController-driven).
 *   • `unauthorized` — 401/403 from the upstream API.
 *   • `server`       — 5xx after retries exhausted.
 *   • `shape`        — response was 2xx but the body didn't match the expected
 *                      structure or failed sanity checks (e.g., prayer order).
 *   • `unknown`      — everything else, including programming errors.
 */

export type ProviderErrorCategory =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'server'
  | 'shape'
  | 'unknown';

export class ProviderError extends Error {
  readonly category: ProviderErrorCategory;
  readonly provider: string;
  readonly status?: number;
  readonly attempts?: number;
  readonly cause?: unknown;

  constructor(
    provider: string,
    category: ProviderErrorCategory,
    message: string,
    extras: { status?: number; attempts?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.category = category;
    this.status = extras.status;
    this.attempts = extras.attempts;
    this.cause = extras.cause;
  }
}

/** Convenience: detect "timeout-like" errors regardless of platform. */
export function isAbortOrTimeoutError(e: unknown): boolean {
  if (!e) return false;
  const name = (e as { name?: string }).name ?? '';
  const message = ((e as { message?: string }).message ?? '').toLowerCase();
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    message.includes('aborted') ||
    message.includes('timed out') ||
    message.includes('timeout')
  );
}

/** Convenience: detect network-layer failures (TypeError 'Network request failed'). */
export function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const name = (e as { name?: string }).name ?? '';
  const message = ((e as { message?: string }).message ?? '').toLowerCase();
  return (
    name === 'TypeError' &&
    (message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('load failed'))
  );
}
