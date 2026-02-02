// lib/cache.ts - Simple in-memory caching with TTL support

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Run cleanup every minute
    if (typeof window === 'undefined') {
      // Server-side only
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    }
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in cache with TTL (in seconds)
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Delete a value from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all entries matching a prefix
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  stats(): { size: number; keys: string[] } {
    this.cleanup();
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Stop cleanup interval (for testing)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const cache = new MemoryCache();

/**
 * Higher-order function to wrap an async function with caching
 *
 * @example
 * const getCachedUser = withCache(
 *   (userId: string) => fetchUser(userId),
 *   (userId) => `user:${userId}`,
 *   300 // 5 minutes TTL
 * );
 */
export function withCache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyFn: (...args: TArgs) => string,
  ttlSeconds: number = 300
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const key = keyFn(...args);

    // Check cache first
    const cached = cache.get<TResult>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn(...args);
    cache.set(key, result, ttlSeconds);
    return result;
  };
}

/**
 * Decorator-style caching for class methods
 *
 * @example
 * class UserService {
 *   @Cached('user', 300)
 *   async getUser(id: string) { ... }
 * }
 */
export function Cached(prefix: string, ttlSeconds: number = 300) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const key = `${prefix}:${propertyKey}:${JSON.stringify(args)}`;

      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      cache.set(key, result, ttlSeconds);
      return result;
    } as T;

    return descriptor;
  };
}

// Common cache key helpers
export const cacheKeys = {
  user: (userId: string) => `user:${userId}`,
  userCredits: (userId: string) => `credits:${userId}`,
  userSettings: (userId: string) => `settings:${userId}`,
  video: (videoId: string) => `video:${videoId}`,
  script: (scriptId: string) => `script:${scriptId}`,
  client: (clientId: string) => `client:${clientId}`,
  search: (query: string, userId: string) => `search:${userId}:${query}`,
};

// Default TTLs (in seconds)
export const TTL = {
  SHORT: 60,          // 1 minute
  MEDIUM: 300,        // 5 minutes
  LONG: 900,          // 15 minutes
  HOUR: 3600,         // 1 hour
  DAY: 86400,         // 24 hours
} as const;

export default cache;
