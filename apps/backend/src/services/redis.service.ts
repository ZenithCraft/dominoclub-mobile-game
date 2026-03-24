import { logger } from '../utils/logger';

// ─── Optional Redis client ─────────────────────────────────────────────────────
// Redis is optional: if REDIS_URL is not set the app runs with in-memory state
// (single-server mode). When REDIS_URL is set the Socket.io Redis adapter is
// enabled, allowing horizontal scaling across multiple backend instances.

let redisClient: any = null;
let redisSubscriber: any = null;
let redisAvailable = false;

export async function connectRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info('[Redis] REDIS_URL not set — running in single-server (in-memory) mode');
    return;
  }

  try {
    // Dynamic import so ioredis is truly optional — app won't crash if it's missing
    const { default: Redis } = await import('ioredis');

    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisSubscriber = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await redisClient.connect();
    await redisSubscriber.connect();

    redisAvailable = true;
    logger.info('[Redis] Connected', { url: url.replace(/:\/\/.*@/, '://***@') });

    redisClient.on('error', (err: Error) => {
      logger.error('[Redis] Client error', { message: err.message });
    });
  } catch (err: any) {
    logger.warn('[Redis] Failed to connect — falling back to in-memory mode', { message: err.message });
    redisClient = null;
    redisSubscriber = null;
    redisAvailable = false;
  }
}

export function getRedisClient() { return redisClient; }
export function getRedisSubscriber() { return redisSubscriber; }
export function isRedisAvailable() { return redisAvailable; }

export async function disconnectRedis(): Promise<void> {
  if (redisClient) await redisClient.quit().catch(() => {});
  if (redisSubscriber) await redisSubscriber.quit().catch(() => {});
}
