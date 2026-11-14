import { readCache, writeCache } from './db.js';
import type { ApiErrorEnvelope, DataStatus } from '../shared/types.js';

export class SourceAdapterError extends Error {
  public readonly envelope: ApiErrorEnvelope;
  constructor(envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.name = 'SourceAdapterError';
    this.envelope = envelope;
  }
}

interface BreakerState {
  failures: number;
  openUntilMs: number;
}

const breakers = new Map<string, BreakerState>();
const MAX_FAILURES = 4;
const COOLDOWN_MS = 45_000;

export function getBreakerSnapshot(): Record<string, { failures: number; open: boolean }> {
  const now = Date.now();
  const out: Record<string, { failures: number; open: boolean }> = {};
  for (const [k, v] of breakers.entries()) {
    out[k] = { failures: v.failures, open: v.openUntilMs > now };
  }
  return out;
}

function recordSuccess(sourceId: string): void {
  breakers.set(sourceId, { failures: 0, openUntilMs: 0 });
}

function recordFailure(sourceId: string): void {
  const prev = breakers.get(sourceId) ?? { failures: 0, openUntilMs: 0 };
  const failures = prev.failures + 1;
  breakers.set(sourceId, {
    failures,
    openUntilMs: failures >= MAX_FAILURES ? Date.now() + COOLDOWN_MS : 0,
  });
}

function isBreakerOpen(sourceId: string): boolean {
  const state = breakers.get(sourceId);
  if (!state) return false;
  if (state.openUntilMs > Date.now()) return true;
  return false;
}

export interface FetchJsonOptions {
  sourceId: string;
  url: string;
  timeoutMs?: number;
  retries?: number;
}

export async function fetchWithRetry(
  url: string,
  sourceId: string,
  timeoutMs = 12_000,
  retries = 2
): Promise<Response> {
  if (isBreakerOpen(sourceId)) {
    throw new SourceAdapterError({
      code: 'CIRCUIT_OPEN',
      message: `Circuit breaker temporarily open for source ${sourceId} after repeated failures.`,
      source: sourceId,
      retryable: true,
    });
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MARS-PATH/1.0 (NASA Space Apps Prototype)',
          Accept: 'application/json, application/geo+json, text/plain, */*',
        },
      });
      clearTimeout(timer);
      if (res.ok) {
        recordSuccess(sourceId);
        return res;
      }
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || attempt === retries) {
        recordFailure(sourceId);
        throw new SourceAdapterError({
          code: `HTTP_${res.status}`,
          message: `Upstream ${sourceId} returned HTTP ${res.status}`,
          source: sourceId,
          retryable,
        });
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof SourceAdapterError) throw err;
      if (attempt === retries) {
        recordFailure(sourceId);
        throw new SourceAdapterError({
          code: 'UPSTREAM_FETCH_FAILED',
          message: err instanceof Error ? err.message : `Failed to fetch ${sourceId}`,
          source: sourceId,
          retryable: true,
        });
      }
    }
    const backoff = 250 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, backoff));
  }

  throw new SourceAdapterError({
    code: 'UPSTREAM_FETCH_FAILED',
    message: lastErr instanceof Error ? lastErr.message : `Failed to fetch ${sourceId}`,
    source: sourceId,
    retryable: true,
  });
}

export interface CachedFetchResult<T> {
  data: T;
  status: DataStatus;
  retrievedAt: string;
  stale: boolean;
}

const inflightRevalidations = new Map<string, Promise<unknown>>();

export async function fetchCachedJson<T>(
  cacheKey: string,
  sourceId: string,
  url: string,
  ttlSeconds: number,
  parse: (raw: unknown) => T,
  timeoutMs = 12_000
): Promise<CachedFetchResult<T>> {
  const cached = readCache<T>(cacheKey);
  if (cached.hit && cached.data !== null && cached.retrievedAt) {
    if (!cached.stale) {
      return {
        data: cached.data,
        status: 'CACHED',
        retrievedAt: cached.retrievedAt,
        stale: false,
      };
    }
    // Stale-while-revalidate: trigger background refresh and return stale cached payload honestly
    if (!inflightRevalidations.has(cacheKey)) {
      const job = (async () => {
        try {
          const res = await fetchWithRetry(url, sourceId, timeoutMs, 1);
          const raw = await res.json();
          const parsed = parse(raw);
          writeCache(cacheKey, sourceId, parsed, ttlSeconds);
        } catch {
          // Preserve stale cache on background error
        } finally {
          inflightRevalidations.delete(cacheKey);
        }
      })();
      inflightRevalidations.set(cacheKey, job);
    }
    return {
      data: cached.data,
      status: 'CACHED',
      retrievedAt: cached.retrievedAt,
      stale: true,
    };
  }

  const res = await fetchWithRetry(url, sourceId, timeoutMs, 2);
  const raw = await res.json();
  const parsed = parse(raw);
  const retrievedAt = new Date().toISOString();
  writeCache(cacheKey, sourceId, parsed, ttlSeconds, retrievedAt);
  return {
    data: parsed,
    status: 'LIVE',
    retrievedAt,
    stale: false,
  };
}
