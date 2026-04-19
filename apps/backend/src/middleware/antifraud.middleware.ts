import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/prisma.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getRedisClient, isRedisAvailable } from '../services/redis.service';
import { applyTrustSignal, recoverTrustScore } from '../services/trust.service';

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
 * Updates the user's IP and device_id, maintains DeviceBind history,
 * then checks for shared identifiers.
 */
export async function checkMultiAccount(userId: string, ip: string, deviceId?: string, platform?: string) {
  // Persist latest fingerprint on the user record
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(ip       ? { ip_address: ip }     : {}),
      ...(deviceId ? { device_id: deviceId } : {}),
    },
  }).catch(() => {});

  // Maintain device binding history
  if (deviceId) {
    try {
      const bind = await prisma.deviceBind.upsert({
        where: { userId_device_id: { userId, device_id: deviceId } },
        update: { last_seen: new Date(), is_active: true, ...(platform ? { platform } : {}) },
        create: { userId, device_id: deviceId, platform: platform ?? null },
      });

      // Count active binds for this user
      const activeCount = await prisma.deviceBind.count({
        where: { userId, is_active: true },
      });

      if (activeCount > config.antifraud.maxDevicesPerAccount) {
        logger.warn('[AntifrAud] Device limit exceeded', { userId, activeCount });
        await prisma.fraudLog.create({
          data: {
            userId,
            type: 'DEVICE_LIMIT_EXCEEDED',
            reason_code: 'DEVICE_LIMIT_EXCEEDED:max_exceeded',
            details: { activeCount, maxAllowed: config.antifraud.maxDevicesPerAccount, deviceId },
          },
        }).catch(() => {});
        await applyTrustSignal(userId, 'device_limit_exceeded');
      }
    } catch (err: any) {
      logger.warn('[AntifrAud] DeviceBind upsert failed', { userId, message: err.message });
    }
  }

  if (!deviceId && !ip) return;

  const conflicts: { type: string; reason_code: string; details: object }[] = [];

  // Same physical device used by a different account
  if (deviceId) {
    const sameDevice = await prisma.user.findMany({
      where: { device_id: deviceId, id: { not: userId } },
      select: { id: true, is_banned: true },
    });
    if (sameDevice.length > 0) {
      conflicts.push({
        type: 'MULTI_ACCOUNT_DEVICE',
        reason_code: 'MULTI_ACCOUNT_DEVICE:shared_device',
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
        reason_code: 'MULTI_ACCOUNT_IP:shared_ip',
        details: { ip, deviceId, sharedIpUsers: sameIp.map((u) => u.id) },
      });
    }
  }

  for (const c of conflicts) {
    await prisma.fraudLog.create({
      data: {
        userId,
        type: c.type as any,
        reason_code: c.reason_code,
        details: c.details,
        ip_address: ip,
        device_id: deviceId,
      },
    });
    logger.warn('[AntifrAud] Multi-account signal', { userId, type: c.type, ip, deviceId });

    const signal = c.type === 'MULTI_ACCOUNT_DEVICE' ? 'multi_account_device' : 'multi_account_ip';
    await applyTrustSignal(userId, signal as any);
  }
}

// ─── GPS validation ───────────────────────────────────────────────────────────

const BRAZIL_LAT_MIN = -33.75;
const BRAZIL_LAT_MAX =   5.27;
const BRAZIL_LNG_MIN = -73.99;
const BRAZIL_LNG_MAX = -34.79;

export interface GpsCoords {
  lat: number;
  lng: number;
  accuracy?: number; // metres
}

export interface GpsValidationResult {
  valid: boolean;
  lowConfidence?: boolean;
  reason?: string;
}

/**
 * Validates that GPS coordinates are within Brazil.
 * Also evaluates accuracy: low-accuracy fixes are accepted but flagged.
 */
export function validateGpsBounds(coords: GpsCoords): GpsValidationResult {
  const { lat, lng, accuracy } = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
    return { valid: false, reason: 'Coordenadas GPS inválidas' };
  }
  if (lat < BRAZIL_LAT_MIN || lat > BRAZIL_LAT_MAX || lng < BRAZIL_LNG_MIN || lng > BRAZIL_LNG_MAX) {
    return { valid: false, reason: 'Localização fora do Brasil' };
  }

  // Accuracy of exactly 0 is a known mock-location indicator on Android
  if (accuracy !== undefined && accuracy === 0) {
    return { valid: true, lowConfidence: true, reason: 'GPS accuracy suspeita (possível localização simulada)' };
  }

  if (accuracy !== undefined && accuracy > config.antifraud.gpsMaxAccuracyM) {
    return { valid: true, lowConfidence: true, reason: `GPS de baixa precisão (${Math.round(accuracy)}m)` };
  }

  return { valid: true };
}

/**
 * Haversine distance between two points, in metres.
 */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Impossible movement detection ───────────────────────────────────────────

export interface MovementCheckResult {
  suspicious: boolean;
  reason?: string;
}

/**
 * Checks whether a new GPS fix represents a physically impossible movement
 * compared to the user's last recorded position.
 *
 * Returns suspicious=true and writes a FraudLog when speed exceeds the
 * configured impossibleSpeedKmh threshold (default: 900 km/h).
 *
 * Soft-flags (warn only) when speed exceeds suspiciousSpeedKmh (default: 250 km/h).
 */
export async function checkImpossibleMovement(
  userId: string,
  newCoords: GpsCoords,
  timestamp: number,
): Promise<MovementCheckResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gps_lat: true, gps_lng: true, gps_updated_at: true },
    });

    if (!user?.gps_lat || !user?.gps_lng || !user?.gps_updated_at) {
      return { suspicious: false };
    }

    const deltaMs = timestamp - user.gps_updated_at.getTime();
    if (deltaMs < 10_000) return { suspicious: false }; // too short to be meaningful

    const distM = haversineMetres(user.gps_lat, user.gps_lng, newCoords.lat, newCoords.lng);
    const deltaSeconds = deltaMs / 1000;
    const speedKmh = (distM / 1000) / (deltaSeconds / 3600);

    if (speedKmh > config.antifraud.impossibleSpeedKmh) {
      logger.warn('[AntifrAud] Impossible GPS movement', {
        userId, speedKmh: Math.round(speedKmh), distM: Math.round(distM), deltaSeconds: Math.round(deltaSeconds),
      });
      await prisma.fraudLog.create({
        data: {
          userId,
          type: 'IMPOSSIBLE_MOVEMENT',
          reason_code: 'IMPOSSIBLE_MOVEMENT:speed_exceeded',
          details: {
            speedKmh: Math.round(speedKmh),
            distanceM: Math.round(distM),
            deltaSeconds: Math.round(deltaSeconds),
            from: { lat: user.gps_lat, lng: user.gps_lng },
            to: { lat: newCoords.lat, lng: newCoords.lng },
          },
        },
      }).catch(() => {});
      await applyTrustSignal(userId, 'impossible_movement');
      return { suspicious: true, reason: 'Movimento GPS impossível detectado' };
    }

    if (speedKmh > config.antifraud.suspiciousSpeedKmh) {
      logger.warn('[AntifrAud] Suspicious GPS speed (soft signal)', {
        userId, speedKmh: Math.round(speedKmh),
      });
    }

    return { suspicious: false };
  } catch (err: any) {
    logger.error('[AntifrAud] checkImpossibleMovement failed', { userId, message: err.message });
    return { suspicious: false };
  }
}

/**
 * Persist the player's latest GPS fix on their User record.
 * Runs impossible movement check first; returns its result so callers can act.
 */
export async function updateUserGps(
  userId: string,
  coords: GpsCoords,
  timestamp?: number,
): Promise<MovementCheckResult> {
  const ts = timestamp ?? Date.now();
  const movementCheck = await checkImpossibleMovement(userId, coords, ts);

  await prisma.user.update({
    where: { id: userId },
    data: {
      gps_lat:        coords.lat,
      gps_lng:        coords.lng,
      gps_accuracy:   coords.accuracy ?? null,
      gps_updated_at: new Date(ts),
    },
  }).catch(() => {});

  return movementCheck;
}

// ─── GPS collusion proximity check ───────────────────────────────────────────

/**
 * After a match is created, check whether any two matched players are
 * suspiciously close to each other (collusion risk).
 *
 * Skips players whose GPS accuracy exceeds gpsMaxAccuracyM to avoid
 * false positives from inaccurate fixes.
 */
export async function checkGpsProximity(playerUserIds: string[], gameId: string): Promise<void> {
  const thresholdM = config.antifraud.gpsCollusionDistanceM;

  const users = await prisma.user.findMany({
    where: { id: { in: playerUserIds }, gps_lat: { not: null }, gps_lng: { not: null } },
    select: { id: true, gps_lat: true, gps_lng: true, gps_accuracy: true },
  });

  // Exclude low-accuracy fixes from collusion checks to reduce false positives
  const reliableUsers = users.filter(
    (u) => u.gps_accuracy == null || u.gps_accuracy <= config.antifraud.gpsMaxAccuracyM
  );

  for (let i = 0; i < reliableUsers.length; i++) {
    for (let j = i + 1; j < reliableUsers.length; j++) {
      const a = reliableUsers[i];
      const b = reliableUsers[j];
      if (a.gps_lat == null || b.gps_lat == null) continue;

      const distM = haversineMetres(a.gps_lat, a.gps_lng!, b.gps_lat, b.gps_lng!);
      if (distM <= thresholdM) {
        logger.warn('[AntifrAud] Collusion proximity detected', {
          gameId, userA: a.id, userB: b.id, distanceMetres: Math.round(distM), thresholdM,
        });

        for (const suspect of [a, b]) {
          await prisma.fraudLog.create({
            data: {
              userId: suspect.id,
              type: 'COLLUSION_SUSPECTED',
              reason_code: 'COLLUSION_SUSPECTED:proximity',
              details: {
                gameId,
                nearbyUserId: suspect.id === a.id ? b.id : a.id,
                distanceMetres: Math.round(distM),
              },
            },
          }).catch(() => {});
          await applyTrustSignal(suspect.id, 'collusion_proximity');
        }
      }
    }
  }
}

// ─── Per-user velocity checks ─────────────────────────────────────────────────

// In-memory fallback store when Redis is unavailable
const velocityStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check and increment a per-user action counter within a sliding window.
 * Returns blocked=true if the user has exceeded maxCount within windowMs.
 *
 * Uses Redis INCR+PEXPIRE when available; falls back to an in-memory map.
 * The in-memory fallback is not shared across instances — use Redis in production.
 */
export async function checkUserVelocity(
  userId: string,
  action: string,
  windowMs: number,
  maxCount: number,
): Promise<{ blocked: boolean; count: number }> {
  const key = `velocity:${action}:${userId}`;

  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      const count = await redis.incr(key);
      if (count === 1) {
        // Key was just created — set expiry
        await redis.pexpire(key, windowMs);
      }
      return { blocked: count > maxCount, count };
    } catch (err: any) {
      logger.warn('[AntifrAud] Redis velocity check failed — using in-memory', { message: err.message });
    }
  }

  // In-memory fallback
  const now = Date.now();
  const entry = velocityStore.get(key);
  if (!entry || now > entry.resetAt) {
    velocityStore.set(key, { count: 1, resetAt: now + windowMs });
    return { blocked: false, count: 1 };
  }
  entry.count += 1;
  return { blocked: entry.count > maxCount, count: entry.count };
}

/**
 * Purge stale entries from the in-memory velocity store.
 * Only relevant when Redis is unavailable.
 */
export function cleanupVelocityStore(): void {
  const now = Date.now();
  for (const [key, entry] of velocityStore) {
    if (now > entry.resetAt) velocityStore.delete(key);
  }
}

// ─── Bot behaviour — move-timing analysis ────────────────────────────────────

/**
 * Called at the end of each game with the per-player move interval array.
 * Computes a fast-move ratio, applies EMA to bot_score, writes FraudLog when
 * the score crosses the threshold. Triggers trust recovery on clean games.
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
        reason_code: 'BOT_PATTERN:ema_threshold',
        details: {
          gameId, fastRatio, avgMoveMs: avgMs, sampleSize: moveIntervalsMs.length, botScore: newScore,
        },
      },
    }).catch(() => {});
    await applyTrustSignal(userId, 'bot_pattern');
  } else {
    logger.debug('[AntifrAud] Bot score updated', { userId, gameId, fastRatio, avgMs, newScore });
    // Clean game: recover trust slightly
    await recoverTrustScore(userId);
  }
}
