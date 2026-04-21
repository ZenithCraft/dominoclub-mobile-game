/**
 * Token Blacklist Service
 *
 * Stores invalidated access token JTIs so that tokens cannot be reused
 * after logout even within their remaining TTL (up to 15 minutes).
 *
 * Storage: Redis primary (SET with EX), in-memory Map fallback.
 * In-memory entries are cleaned up every 60 seconds by server.ts.
 */

import { getRedisClient, isRedisAvailable } from './redis.service';
import { logger } from '../utils/logger';

const PREFIX = 'blacklist:';
const inMemoryBlacklist = new Map<string, number>(); // jti → expiresAt (ms)

export async function blacklistToken(jti: string, expiresAt: number): Promise<void> {
  const ttlSeconds = Math.max(1, Math.ceil((expiresAt * 1000 - Date.now()) / 1000));

  if (isRedisAvailable()) {
    try {
      await getRedisClient().set(`${PREFIX}${jti}`, '1', 'EX', ttlSeconds);
      return;
    } catch (err: any) {
      logger.warn('[TokenBlacklist] Redis write failed — falling back to in-memory', { message: err.message });
    }
  }

  inMemoryBlacklist.set(jti, expiresAt * 1000);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  if (isRedisAvailable()) {
    try {
      const val = await getRedisClient().get(`${PREFIX}${jti}`);
      return val !== null;
    } catch (err: any) {
      logger.warn('[TokenBlacklist] Redis read failed — falling back to in-memory', { message: err.message });
    }
  }

  const exp = inMemoryBlacklist.get(jti);
  if (exp === undefined) return false;
  if (Date.now() > exp) {
    inMemoryBlacklist.delete(jti);
    return false;
  }
  return true;
}

export function cleanupBlacklist(): void {
  const now = Date.now();
  for (const [jti, exp] of inMemoryBlacklist) {
    if (now > exp) inMemoryBlacklist.delete(jti);
  }
}
