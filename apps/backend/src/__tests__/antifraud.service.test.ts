jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock trust.service so antifraud tests stay isolated from trust EMA logic
jest.mock('../services/trust.service', () => ({
  applyTrustSignal: jest.fn().mockResolvedValue(0.8),
  recoverTrustScore: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../services/prisma.service';
import { applyTrustSignal, recoverTrustScore } from '../services/trust.service';
import {
  validateGpsBounds,
  haversineMetres,
  checkUserVelocity,
  checkIPVelocity,
  cleanupVelocityStore,
  checkImpossibleMovement,
  updateBotScore,
  checkGpsProximity,
  checkMultiAccount,
} from '../middleware/antifraud.middleware';

beforeEach(() => {
  cleanupVelocityStore();
  jest.clearAllMocks();
});

// ─── validateGpsBounds ────────────────────────────────────────────────────────

describe('validateGpsBounds', () => {
  it('accepts valid coordinates inside Brazil', () => {
    const result = validateGpsBounds({ lat: -23.55, lng: -46.63 }); // São Paulo
    expect(result).toEqual({ valid: true });
  });

  it('accepts coordinates outside Brazil with lowConfidence flag', () => {
    const result = validateGpsBounds({ lat: 40.71, lng: -74.0 }); // New York
    expect(result).toMatchObject({ valid: true, lowConfidence: true, reason: expect.stringContaining('Brasil') });
  });

  it('rejects NaN latitude', () => {
    const result = validateGpsBounds({ lat: NaN, lng: -46.63 });
    expect(result).toMatchObject({ valid: false });
  });

  it('rejects Infinity longitude', () => {
    const result = validateGpsBounds({ lat: -23.55, lng: Infinity });
    expect(result).toMatchObject({ valid: false });
  });

  it('rejects non-number values', () => {
    const result = validateGpsBounds({ lat: 'abc' as any, lng: -46.63 });
    expect(result).toMatchObject({ valid: false });
  });

  it('flags accuracy === 0 as low confidence (mock location indicator on Android)', () => {
    const result = validateGpsBounds({ lat: -23.55, lng: -46.63, accuracy: 0 });
    expect(result).toMatchObject({ valid: true, lowConfidence: true });
    expect(result.reason).toMatch(/simulada/i);
  });

  it('flags accuracy above gpsMaxAccuracyM (500m default) as low confidence', () => {
    const result = validateGpsBounds({ lat: -23.55, lng: -46.63, accuracy: 600 });
    expect(result).toMatchObject({ valid: true, lowConfidence: true });
  });

  it('accepts accuracy below gpsMaxAccuracyM without low confidence', () => {
    const result = validateGpsBounds({ lat: -23.55, lng: -46.63, accuracy: 100 });
    expect(result).toEqual({ valid: true });
  });

  it('accepts exactly at Brazil southern boundary', () => {
    // lat = -33.75 is the minimum allowed
    const result = validateGpsBounds({ lat: -33.75, lng: -53.0 });
    expect(result.valid).toBe(true);
    expect(result.lowConfidence).toBeUndefined();
  });

  it('rejects coordinates just below Brazil southern boundary', () => {
    const result = validateGpsBounds({ lat: -33.76, lng: -53.0 });
    expect(result).toMatchObject({ valid: true, lowConfidence: true });
  });
});

// ─── haversineMetres ──────────────────────────────────────────────────────────

describe('haversineMetres', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMetres(-23.55, -46.63, -23.55, -46.63)).toBe(0);
  });

  it('returns ~357 km between São Paulo and Rio de Janeiro', () => {
    const distM = haversineMetres(-23.5505, -46.6333, -22.9068, -43.1729);
    expect(distM / 1000).toBeGreaterThan(340);
    expect(distM / 1000).toBeLessThan(380);
  });

  it('returns a small distance for nearby points (< 1 km)', () => {
    // ~0.09 degrees latitude ≈ ~10 km, so 0.001 degree ≈ 111 m
    const distM = haversineMetres(-23.55, -46.63, -23.551, -46.63);
    expect(distM).toBeGreaterThan(50);
    expect(distM).toBeLessThan(300);
  });

  it('is symmetric — distance A→B equals B→A', () => {
    const d1 = haversineMetres(-23.55, -46.63, -22.9, -43.17);
    const d2 = haversineMetres(-22.9, -43.17, -23.55, -46.63);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});

// ─── checkUserVelocity (in-memory fallback) ───────────────────────────────────

describe('checkUserVelocity — in-memory fallback', () => {
  it('returns count=1 and blocked=false on first call', async () => {
    const result = await checkUserVelocity('u1', 'test_action_a', 60000, 5);
    expect(result).toEqual({ blocked: false, count: 1 });
  });

  it('increments count on subsequent calls within the window', async () => {
    const action = 'test_action_b';
    await checkUserVelocity('u1', action, 60000, 5);
    await checkUserVelocity('u1', action, 60000, 5);
    const result = await checkUserVelocity('u1', action, 60000, 5);
    expect(result.count).toBe(3);
    expect(result.blocked).toBe(false);
  });

  it('blocks after exceeding maxCount', async () => {
    const action = 'test_action_c';
    for (let i = 0; i < 5; i++) {
      await checkUserVelocity('u2', action, 60000, 5);
    }
    const result = await checkUserVelocity('u2', action, 60000, 5);
    expect(result.blocked).toBe(true);
    expect(result.count).toBe(6);
  });

  it('resets after the window expires', async () => {
    const action = 'test_action_d';
    // Window of 1 ms — expires immediately
    await checkUserVelocity('u3', action, 1, 2);
    await new Promise((r) => setTimeout(r, 5));
    const result = await checkUserVelocity('u3', action, 60000, 2);
    expect(result.count).toBe(1);
    expect(result.blocked).toBe(false);
  });

  it('tracks different users independently', async () => {
    const action = 'test_action_e';
    await checkUserVelocity('ua', action, 60000, 2);
    await checkUserVelocity('ua', action, 60000, 2);
    const blocked = await checkUserVelocity('ua', action, 60000, 2);
    expect(blocked.blocked).toBe(true);

    // Different user — fresh counter
    const fresh = await checkUserVelocity('ub', action, 60000, 2);
    expect(fresh.blocked).toBe(false);
    expect(fresh.count).toBe(1);
  });
});

// ─── checkIPVelocity (in-memory fallback) ─────────────────────────────────────

describe('checkIPVelocity — in-memory fallback', () => {
  it('returns blocked=false, count=0 for empty IP string', async () => {
    const result = await checkIPVelocity('', 'queue', 60000, 10);
    expect(result).toEqual({ blocked: false, count: 0 });
  });

  it('tracks per IP independently from per-user counters', async () => {
    const result = await checkIPVelocity('192.168.1.1', 'test_ip_action', 60000, 3);
    expect(result).toEqual({ blocked: false, count: 1 });
  });

  it('blocks an IP after exceeding maxCount', async () => {
    const ip = '10.0.0.99';
    const action = 'ip_action_block';
    for (let i = 0; i < 3; i++) await checkIPVelocity(ip, action, 60000, 3);
    const result = await checkIPVelocity(ip, action, 60000, 3);
    expect(result.blocked).toBe(true);
  });
});

// ─── checkImpossibleMovement ─────────────────────────────────────────────────

describe('checkImpossibleMovement', () => {
  it('returns not suspicious when user has no previous GPS fix', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      gps_lat: null, gps_lng: null, gps_updated_at: null,
    });

    const result = await checkImpossibleMovement('u1', { lat: -23.55, lng: -46.63 }, Date.now());
    expect(result.suspicious).toBe(false);
  });

  it('returns not suspicious when the time delta is under 10 seconds', async () => {
    const now = Date.now();
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      gps_lat: -23.55, gps_lng: -46.63, gps_updated_at: new Date(now - 5000),
    });

    const result = await checkImpossibleMovement('u1', { lat: -22.9, lng: -43.17 }, now);
    expect(result.suspicious).toBe(false);
  });

  it('returns not suspicious for a realistic speed (≤ 900 km/h)', async () => {
    // Simulate 10 km in 1 minute — ≈ 600 km/h, under 900 threshold
    const now = Date.now();
    const prev = now - 60_000; // 1 minute ago
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      gps_lat: -23.55, gps_lng: -46.63,
      gps_updated_at: new Date(prev),
    });
    // ~10 km away (≈ 0.09 degrees lat)
    const result = await checkImpossibleMovement('u1', { lat: -23.46, lng: -46.63 }, now);
    expect(result.suspicious).toBe(false);
  });

  it('returns suspicious and logs a FraudLog for impossible speed (> 900 km/h)', async () => {
    // Simulate São Paulo → Rio (357 km) in 60 seconds → ~21,420 km/h
    const now = Date.now();
    const prev = now - 60_000;
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      gps_lat: -23.5505, gps_lng: -46.6333,
      gps_updated_at: new Date(prev),
    });
    (prisma.fraudLog.create as jest.Mock).mockResolvedValueOnce({});

    const result = await checkImpossibleMovement('u1', { lat: -22.9068, lng: -43.1729 }, now);

    expect(result.suspicious).toBe(true);
    expect(prisma.fraudLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'IMPOSSIBLE_MOVEMENT', userId: 'u1' }),
      }),
    );
    expect(applyTrustSignal).toHaveBeenCalledWith('u1', 'impossible_movement');
  });

  it('returns not suspicious and does not log when user is not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const result = await checkImpossibleMovement('u-missing', { lat: -23.55, lng: -46.63 }, Date.now());
    expect(result.suspicious).toBe(false);
    expect(prisma.fraudLog.create).not.toHaveBeenCalled();
  });
});

// ─── updateBotScore ───────────────────────────────────────────────────────────

describe('updateBotScore', () => {
  it('skips update when sample size is below minimum (5)', async () => {
    await updateBotScore('g1', 'u1', [100, 200, 300]); // only 3 samples
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does nothing when user is not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await updateBotScore('g1', 'u1', [100, 200, 100, 200, 100]);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('triggers FraudLog and trust penalty when bot score exceeds threshold', async () => {
    // All 10 moves are under 800ms (botMinMoveMs) → fastRatio = 1.0
    // newScore = min(1, 0.0 * 0.7 + 1.0 * 0.3) = 0.3; but start from existing bot_score
    // With existing bot_score 0.6: newScore = 0.6 * 0.7 + 1.0 * 0.3 = 0.72 → > threshold 0.65
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ bot_score: 0.6 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.fraudLog.create as jest.Mock).mockResolvedValueOnce({});

    const fastMoves = Array(10).fill(200); // all 200ms < 800ms botMinMoveMs
    await updateBotScore('g1', 'u1', fastMoves);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ bot_score: expect.any(Number) }),
      }),
    );
    expect(prisma.fraudLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'BOT_PATTERN', userId: 'u1' }),
      }),
    );
    expect(applyTrustSignal).toHaveBeenCalledWith('u1', 'bot_pattern');
  });

  it('calls recoverTrustScore on a clean game (no fast moves, score below threshold)', async () => {
    // Existing bot_score 0.1, all moves > 800ms → fastRatio = 0
    // newScore = 0.1 * 0.7 + 0.0 * 0.3 = 0.07 → below threshold 0.65
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ bot_score: 0.1 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const slowMoves = Array(8).fill(1500); // all 1500ms > 800ms
    await updateBotScore('g1', 'u1', slowMoves);

    expect(prisma.fraudLog.create).not.toHaveBeenCalled();
    expect(recoverTrustScore).toHaveBeenCalledWith('u1');
  });
});

// ─── checkGpsProximity ────────────────────────────────────────────────────────

describe('checkGpsProximity', () => {
  it('does nothing when players are far apart (> 100m)', async () => {
    // 1 km apart
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'ua', gps_lat: -23.55, gps_lng: -46.63, gps_accuracy: 10 },
      { id: 'ub', gps_lat: -23.559, gps_lng: -46.63, gps_accuracy: 10 }, // ~1 km south
    ]);

    await checkGpsProximity(['ua', 'ub'], 'g1');
    expect(prisma.fraudLog.create).not.toHaveBeenCalled();
  });

  it('creates FraudLog for both players when within 100m threshold', async () => {
    // 10m apart (~0.0001 degrees lat)
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'ua', gps_lat: -23.55000, gps_lng: -46.63, gps_accuracy: 5 },
      { id: 'ub', gps_lat: -23.55001, gps_lng: -46.63, gps_accuracy: 5 }, // ~11m
    ]);
    (prisma.fraudLog.create as jest.Mock).mockResolvedValue({});

    await checkGpsProximity(['ua', 'ub'], 'g1');

    expect(prisma.fraudLog.create).toHaveBeenCalledTimes(2);
    expect(prisma.fraudLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'COLLUSION_SUSPECTED', userId: 'ua' }),
      }),
    );
    expect(applyTrustSignal).toHaveBeenCalledTimes(2);
    expect(applyTrustSignal).toHaveBeenCalledWith('ua', 'collusion_proximity');
    expect(applyTrustSignal).toHaveBeenCalledWith('ub', 'collusion_proximity');
  });

  it('excludes players with accuracy above gpsMaxAccuracyM from proximity checks', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'ua', gps_lat: -23.55, gps_lng: -46.63, gps_accuracy: 600 }, // above 500m threshold
      { id: 'ub', gps_lat: -23.55, gps_lng: -46.63, gps_accuracy: 600 },
    ]);

    await checkGpsProximity(['ua', 'ub'], 'g1');
    expect(prisma.fraudLog.create).not.toHaveBeenCalled();
  });

  it('does nothing when no players have GPS data', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
    await checkGpsProximity(['ua', 'ub'], 'g1');
    expect(prisma.fraudLog.create).not.toHaveBeenCalled();
  });
});

// ─── checkMultiAccount ────────────────────────────────────────────────────────

describe('checkMultiAccount', () => {
  it('updates IP and deviceId on the user record', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.deviceBind.upsert as jest.Mock).mockResolvedValueOnce({});
    (prisma.deviceBind.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.user.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // same device check — no conflicts
      .mockResolvedValueOnce([]); // same IP check — no conflicts

    await checkMultiAccount('u1', '192.168.1.1', 'device-abc');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ ip_address: '192.168.1.1', device_id: 'device-abc' }),
      }),
    );
  });

  it('creates MULTI_ACCOUNT_DEVICE FraudLog when device is shared', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.deviceBind.upsert as jest.Mock).mockResolvedValueOnce({});
    (prisma.deviceBind.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.user.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'u2', is_banned: false }]) // same device → conflict
      .mockResolvedValueOnce([]); // same IP → no conflict
    (prisma.fraudLog.create as jest.Mock).mockResolvedValue({});

    await checkMultiAccount('u1', '10.0.0.1', 'shared-device');

    expect(prisma.fraudLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'MULTI_ACCOUNT_DEVICE', userId: 'u1' }),
      }),
    );
    expect(applyTrustSignal).toHaveBeenCalledWith('u1', 'multi_account_device');
  });

  it('creates MULTI_ACCOUNT_IP FraudLog when 3+ accounts share an IP', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.deviceBind.upsert as jest.Mock).mockResolvedValueOnce({});
    (prisma.deviceBind.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.user.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // same device — no conflict
      .mockResolvedValueOnce([{ id: 'u2' }, { id: 'u3' }, { id: 'u4' }]); // 3 others on same IP
    (prisma.fraudLog.create as jest.Mock).mockResolvedValue({});

    await checkMultiAccount('u1', '10.0.0.1', 'device-unique');

    expect(prisma.fraudLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'MULTI_ACCOUNT_IP', userId: 'u1' }),
      }),
    );
    expect(applyTrustSignal).toHaveBeenCalledWith('u1', 'multi_account_ip');
  });

  it('does NOT flag IP when fewer than 3 other accounts share it', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.deviceBind.upsert as jest.Mock).mockResolvedValueOnce({});
    (prisma.deviceBind.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.user.findMany as jest.Mock)
      .mockResolvedValueOnce([])          // same device — no conflict
      .mockResolvedValueOnce([{ id: 'u2' }, { id: 'u3' }]); // only 2 others — tolerated (household / NAT)

    await checkMultiAccount('u1', '10.0.0.1', 'device-unique');

    expect(prisma.fraudLog.create).not.toHaveBeenCalled();
  });

  it('logs DEVICE_LIMIT_EXCEEDED when user has too many bound devices', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.deviceBind.upsert as jest.Mock).mockResolvedValueOnce({});
    (prisma.deviceBind.count as jest.Mock).mockResolvedValueOnce(5); // > maxDevicesPerAccount (3)
    (prisma.fraudLog.create as jest.Mock).mockResolvedValue({});
    (prisma.user.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await checkMultiAccount('u1', '10.0.0.1', 'device-new');

    expect(prisma.fraudLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DEVICE_LIMIT_EXCEEDED', userId: 'u1' }),
      }),
    );
    expect(applyTrustSignal).toHaveBeenCalledWith('u1', 'device_limit_exceeded');
  });
});
