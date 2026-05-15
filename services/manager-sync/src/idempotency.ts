/**
 * In-memory idempotency cache for SOAP requests.
 *
 * Single-instance proxy holds Map<key, result> with TTL. Retry-storms
 * (Next.js cron + 1C transient down) won't multi-write. 1С зберігає
 * власний `СинкЛог` registry — це primary guard на 1С-стороні.
 *
 * V2: коли horizontal scale — Redis або PG LISTEN.
 */

export interface IdempotencyStore {
  /**
   * Lookup cached result; returns null коли missing or expired.
   */
  get(key: string): unknown | null;
  /**
   * Store result with TTL.
   */
  set(key: string, result: unknown): void;
  /**
   * Remove expired entries (called automatically by get/set).
   */
  prune(): void;
  /**
   * Current size (after prune).
   */
  size(): number;
  /**
   * Reset (для тестів).
   */
  clear(): void;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface Entry {
  result: unknown;
  expiresAt: number;
}

export function createIdempotencyStore(
  options: { ttlMs?: number } = {},
): IdempotencyStore {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const store = new Map<string, Entry>();

  function prune(): void {
    const now = Date.now();
    for (const [k, entry] of store) {
      if (entry.expiresAt <= now) store.delete(k);
    }
  }

  return {
    get(key: string): unknown | null {
      prune();
      const hit = store.get(key);
      return hit ? hit.result : null;
    },
    set(key: string, result: unknown): void {
      prune();
      store.set(key, { result, expiresAt: Date.now() + ttl });
    },
    prune,
    size(): number {
      prune();
      return store.size;
    },
    clear(): void {
      store.clear();
    },
  };
}

// Module-level singleton для service runtime.
export const idempotencyCache = createIdempotencyStore();
