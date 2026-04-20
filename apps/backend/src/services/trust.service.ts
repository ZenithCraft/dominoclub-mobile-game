/**
 * Trust Service — unified risk scoring for DominoClub users.
 *
 * trust_score: 1.0 = fully trusted, approaches 0 on repeated abuse signals.
 * The EMA-style decrement formula ensures diminishing returns:
 *   newScore = max(0, current + weight * (1 - current))
 * so a user at 0.1 is pushed down much less than a user at 0.9.
 *
 * Recovery: +0.01 per clean paid game, capped at 1.0.
 * This makes the model self-healing for false-positive victims.
 *
 * Known gaps (deferred):
 *  - Trust score is per-DB; not eventually consistent across multi-server setups
 *    unless Redis read-your-writes is guaranteed. Acceptable for current scale.
 *  - Recovery rate (0.01/game) may be too slow for users with a single false positive.
 *    An admin endpoint to manually restore trust_score is recommended (Milestone 5).
 */

import { prisma } from './prisma.service';
import { logger } from '../utils/logger';

export type TrustSignal =
  | 'bot_pattern'           // weight: -0.15 — suspicious move timing
  | 'integrity_fail'        // weight: -0.20 — failed attestation
  | 'multi_account_device'  // weight: -0.25 — same device on multiple accounts
  | 'multi_account_ip'      // weight: -0.05 — same IP on many accounts (soft; NAT is common)
  | 'impossible_movement'   // weight: -0.20 — GPS jump faster than physically possible
  | 'low_accuracy_gps'      // weight: -0.03 — GPS fix is unreliable
  | 'collusion_proximity'   // weight: -0.10 — matched opponent physically nearby
  | 'velocity_abuse'        // weight: -0.12 — exceeded rate limits
  | 'device_limit_exceeded' // weight: -0.08 — too many bound devices

const SIGNAL_WEIGHTS: Record<TrustSignal, number> = {
  bot_pattern:           -0.15,
  integrity_fail:        -0.20,
  multi_account_device:  -0.25,
  multi_account_ip:      -0.05,
  impossible_movement:   -0.20,
  low_accuracy_gps:      -0.03,
  collusion_proximity:   -0.10,
  velocity_abuse:        -0.12,
  device_limit_exceeded: -0.08,
};

export type TrustLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export function getTrustLevel(score: number): TrustLevel {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

/**
 * Apply a single trust signal to a user's trust_score.
 * Returns the new trust_score value.
 */
export async function applyTrustSignal(userId: string, signal: TrustSignal): Promise<number> {
  const weight = SIGNAL_WEIGHTS[signal];

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trust_score: true },
    });
    if (!user) return 1.0;

    // Asymptotic decay: negative signals scale with current score (larger drop when trust is high),
    // positive signals scale with remaining headroom (approaches 1 from below).
    const delta = weight < 0
      ? weight * user.trust_score        // negative: proportional to current (approaches 0)
      : weight * (1 - user.trust_score); // positive: proportional to headroom (approaches 1)
    const newScore = Math.max(0, Math.min(1, user.trust_score + delta));
    const rounded = Math.round(newScore * 10000) / 10000;

    await prisma.user.update({
      where: { id: userId },
      data: { trust_score: rounded },
    });

    const level = getTrustLevel(rounded);
    logger.warn('[Trust] Signal applied', { userId, signal, before: user.trust_score, after: rounded, level });

    return rounded;
  } catch (err: any) {
    logger.error('[Trust] Failed to apply signal', { userId, signal, message: err.message });
    return 1.0;
  }
}

/**
 * Increment trust_score by 0.01 after a clean paid game (no fraud signals).
 * Capped at 1.0.
 */
export async function recoverTrustScore(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trust_score: true },
    });
    if (!user || user.trust_score >= 1.0) return;

    const newScore = Math.min(1.0, Math.round((user.trust_score + 0.01) * 10000) / 10000);
    await prisma.user.update({
      where: { id: userId },
      data: { trust_score: newScore },
    });
    logger.debug('[Trust] Score recovered', { userId, after: newScore });
  } catch (err: any) {
    logger.error('[Trust] Recovery failed', { userId, message: err.message });
  }
}

/**
 * Fetch trust score and level without modifying it.
 */
export async function getUserTrustLevel(userId: string): Promise<{ score: number; level: TrustLevel }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trust_score: true },
    });
    const score = user?.trust_score ?? 1.0;
    return { score, level: getTrustLevel(score) };
  } catch {
    return { score: 1.0, level: 'HIGH' };
  }
}
