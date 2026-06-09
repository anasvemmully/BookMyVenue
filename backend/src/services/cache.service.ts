import { getRedis } from "../config/redis";

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedis();
      if (!redis) return null;
      const value = await redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }
    } catch {
      // Ignored
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;
      await redis.del(key);
    } catch {
      // Ignored
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Ignored
    }
  }
}

export const cacheService = new CacheService();
