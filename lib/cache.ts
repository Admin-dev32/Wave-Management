export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LruTtlCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(private readonly maxEntries = 100) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }
}

export const sharedCache = new LruTtlCache<unknown>(200);

export function getCache<T>(key: string): T | undefined {
  return sharedCache.get(key) as T | undefined;
}

export function setCache<T>(key: string, value: T, ttlMs: number) {
  sharedCache.set(key, value, ttlMs);
}
