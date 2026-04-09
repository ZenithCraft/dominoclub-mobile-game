import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/prisma.service';
import { logger } from '../utils/logger';
import { config } from '../config';

// ─── Request-level middleware ─────────────────────────────────────────────────

export async function antifraudMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip       = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || '';
  const deviceId = req.headers['x-device-id'] as string | undefined;

  // Block non-Brazilian IPs in production via Cloudflare country header
  const country = req.headers['cf-ipcountry'] as string | undefined;
  if (config.env === 'production' && country && country !== 'BR') {
    logger.warn('Blocked non-BR request', { ip, country });
    return res.status(403).json({ error: 'Serviço disponível apenas no Brasil' });
  }

  // Block requests from devices known to belong to banned users
  if (deviceId && config.env === 'production') {
    const bannedDevice = await prisma.user.findFirst({
      where: { device_id: deviceId, is_banned: true },
      select: { id: true },
    });
    if (bannedDevice) {
      logger.warn('Blocked request from banned device', { deviceId });
      return res.status(403).json({ error: 'Dispositivo bloqueado' });
    }
  }

  (req as any).clientIp = ip;
  (req as any).deviceId = deviceId;

  next();
}

// ─── Post-auth fingerprint check ──────────────────────────────────────────────

/**
 * Called after authentication to detect multi-account abuse.
 * Updates the user's IP and device_id, then checks for shared identifiers.
 */
export async function checkMultiAccount(userId: string, ip: string, deviceId?: string) {
  // Persist latest fingerprint on the user record
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(ip       ? { ip_address: ip }     : {}),
      ...(deviceId ? { device_id: deviceId } : {}),
    },
  }).catch(() => {}); // non-fatal if this fails

  if (!deviceId && !ip) return;

  const conflicts: { type: string; details: object }[] = [];

  // Same physical device used by a different account
  if (deviceId) {
    const sameDevice = await prisma.user.findMany({
      where: { device_id: deviceId, id: { not: userId } },
      select: { id: true, is_banned: true },
    });
    if (sameDevice.length > 0) {
      conflicts.push({
        type: 'MULTI_ACCOUNT_DEVICE',
        details: { ip, deviceId, conflictingUsers: sameDevice.map((u) => u.id) },
      });
    }
  }

  // 3+ different accounts from the same IP (shared NAT or household is tolerated)
  if (ip) {
    const sameIp = await prisma.user.findMany({
      where: { ip_address: ip, id: { not: userId } },
      select: { id: true },
    });
    if (sameIp.length >= 3) {
      conflicts.push({
        type: 'MULTI_ACCOUNT_IP',
        details: { ip, deviceId, sharedIpUsers: sameIp.map((u) => u.id) },
      });
    }
  }

  for (const c of conflicts) {
    await prisma.fraudLog.create({
      data: {
        userId,
        type: c.type as any,
        details: c.details,
        ip_address: ip,
        device_id: deviceId,
      },
    });
    logger.warn('[AntifrAud] Multi-account signal', { userId, type: c.type, ip, deviceId });
  }
}

// ─── GPS validation ───────────────────────────────────────────────────────────

// Approximate bounding box for Brazil (does not match the exact border but
// avoids the complexity of a polygon check while still being very effective)
const BRAZIL_LAT_MIN = -33.75;
const BRAZIL_LAT_MAX =   5.27;
const BRAZIL_LNG_MIN = -73.99;
const BRAZIL_LNG_MAX = -34.79;

export interface GpsCoords {
  lat: number;
  lng: number;
  accuracy?: number; // metres, optional — used for logging only
}

/**
 * Validates that GPS coordinates are within Brazil.
 * Returns `{ valid: false, reason }` for any out-of-bounds or malformed input.
 */
export function validateGpsBounds(coords: GpsCoords): { valid: boolean; reason?: string } {
  const { lat, lng } = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
    return { valid: false, reason: 'Coordenadas GPS inválidas' };
  }
  if (lat < BRAZIL_LAT_MIN || lat > BRAZIL_LAT_MAX || lng < BRAZIL_LNG_MIN || lng > BRAZIL_LNG_MAX) {
    return { valid: false, reason: 'Localização fora do Brasil' };
  }
  return { valid: true };
}

/**
 * Haversine distance between two points, in metres.
 */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * After a match is created, check whether any two matched players are
 * suspiciously close to each other (collusion risk).
 *
 * Logs a COLLUSION_SUSPECTED FraudLog if the threshold is crossed.
 * Does not block the game — only flags for review.
 */
export async function checkGpsProximity(playerUserIds: string[], gameId: string): Promise<void> {
  const thresholdM = config.antifraud.gpsCollusionDistanceM;

  const users = await prisma.user.findMany({
    where: { id: { in: playerUserIds }, gps_lat: { not: null }, gps_lng: { not: null } },
    select: { id: true, gps_lat: true, gps_lng: true },
  });

  // Check every pair
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const a = users[i];
      const b = users[j];
      if (a.gps_lat == null || b.gps_lat == null) continue;

      const distM = haversineMetres(a.gps_lat, a.gps_lng!, b.gps_lat, b.gps_lng!);
      if (distM <= thresholdM) {
        logger.warn('[AntifrAud] Collusion proximity detected', {
          gameId,
          userA: a.id,
          userB: b.id,
          distanceMetres: Math.round(distM),
          thresholdM,
        });

        // Flag both players
        for (const suspect of [a, b]) {
          await prisma.fraudLog.create({
            data: {
              userId: suspect.id,
              type: 'COLLUSION_SUSPECTED',
              details: {
                gameId,
                nearbyUserId: suspect.id === a.id ? b.id : a.id,
                distanceMetres: Math.round(distM),
              },
            },
          }).catch(() => {});
        }
      }
    }
  }
}

/**
 * Persist the player's latest GPS fix on their User record.
 */
export async function updateUserGps(userId: string, coords: GpsCoords): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { gps_lat: coords.lat, gps_lng: coords.lng },
  }).catch(() => {});
}

// ─── Bot behaviour — move-timing analysis ────────────────────────────────────

/**
 * Called at the end of each game with the per-player move interval array.
 * Computes a fast-move ratio and applies an exponential moving average to
 * the player's persisted `bot_score`. Writes a FraudLog if the score
 * crosses the configured threshold.
 *
 * @param gameId          For logging / FraudLog context
 * @param userId          Player whose score to update
 * @param moveIntervalsMs Array of ms elapsed between consecutive moves
 */
export async function updateBotScore(
  gameId: string,
  userId: string,
  moveIntervalsMs: number[]
): Promise<void> {
  if (moveIntervalsMs.length < config.antifraud.botMinSampleSize) return;

  const fastMoves = moveIntervalsMs.filter((t) => t < config.antifraud.botMinMoveMs);
  const fastRatio = fastMoves.length / moveIntervalsMs.length;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bot_score: true },
  });
  if (!user) return;

  // Exponential moving average: new_score = 0.7 * old + 0.3 * observation
  const newScore = Math.min(1, user.bot_score * 0.7 + fastRatio * 0.3);

  await prisma.user.update({
    where: { id: userId },
    data: { bot_score: newScore },
  });

  const avgMs = Math.round(moveIntervalsMs.reduce((a, b) => a + b, 0) / moveIntervalsMs.length);

  if (newScore >= config.antifraud.botScoreLogThreshold) {
    logger.warn('[AntifrAud] Bot pattern detected', { userId, gameId, fastRatio, avgMs, newScore });
    await prisma.fraudLog.create({
      data: {
        userId,
        type: 'BOT_PATTERN',
        details: {
          gameId,
          fastRatio,
          avgMoveMs: avgMs,
          sampleSize: moveIntervalsMs.length,
          botScore: newScore,
        },
      },
    }).catch(() => {});
  } else {
    logger.debug('[AntifrAud] Bot score updated', { userId, gameId, fastRatio, avgMs, newScore });
  }
}
