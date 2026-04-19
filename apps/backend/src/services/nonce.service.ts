/**
 * Nonce Service — server-issued single-use tokens for integrity attestation.
 *
 * Flow:
 *   1. Client calls GET /api/v1/game/integrity-nonce → receives { nonce, expiresAt }
 *   2. Client passes nonce to Play Integrity / App Attest token request
 *   3. Client sends { integrityToken, platform, nonce } in queue:join
 *   4. Server calls consumeNonce() — validates freshness and marks as used
 *
 * Storage: Redis when available; in-memory Map as fallback (single-server only).
 */

import { v4 as uuidv4 } from 'uuid';
import { getRedisClient, isRedisAvailable } from './redis.service';
import { logger } from '../utils/logger';
import { config } from '../config';

const NONCE_PREFIX = 'nonce:';

// In-memory fallback store: nonce → expiry timestamp (ms)
const inMemoryNonces = new Map<string, number>();

export async function issueNonce(): Promise<{ nonce: string; expiresAt: number }> {
  const nonce = uuidv4();
  const ttlMs = config.integrity.nonceTtlMs;
  const expiresAt = Date.now() + ttlMs;

  if (isRedisAvailable()) {
    try {
      await getRedisClient().set(`${NONCE_PREFIX}${nonce}`, '1', 'PX', ttlMs);
    } catch (err: any) {
      logger.warn('[Nonce] Redis set failed — using in-memory fallback', { message: err.message });
      inMemoryNonces.set(nonce, expiresAt);
    }
  } else {
    inMemoryNonces.set(nonce, expiresAt);
  }

  return { nonce, expiresAt };
}

/**
 * Validates that the nonce exists and has not expired, then deletes it (one-use).
 * Returns true if the nonce was valid, false if expired/unknown/already used.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  if (!nonce) return false;

  if (isRedisAvailable()) {
    try {
      // DEL returns 1 if key existed, 0 if not — atomic consume
      const deleted = await getRedisClient().del(`${NONCE_PREFIX}${nonce}`);
      return deleted === 1;
    } catch (err: any) {
      logger.warn('[Nonce] Redis del failed — falling back to in-memory', { message: err.message });
      // fall through to in-memory check
    }
  }

  const expiresAt = inMemoryNonces.get(nonce);
  if (expiresAt === undefined) return false;
  inMemoryNonces.delete(nonce);
  return Date.now() <= expiresAt;
}

/**
 * Purge expired entries from the in-memory store.
 * Only relevant when Redis is unavailable. Call on a periodic interval.
 */
export function cleanupExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiresAt] of inMemoryNonces) {
    if (now > expiresAt) inMemoryNonces.delete(nonce);
  }
}
