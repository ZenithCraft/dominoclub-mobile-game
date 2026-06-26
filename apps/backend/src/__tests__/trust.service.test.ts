jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../services/prisma.service';
import { getTrustLevel, applyTrustSignal, recoverTrustScore } from '../services/trust.service';

// ─── getTrustLevel ────────────────────────────────────────────────────────────

describe('getTrustLevel', () => {
  it('returns HIGH for score >= 0.75', () => {
    expect(getTrustLevel(1.0)).toBe('HIGH');
    expect(getTrustLevel(0.75)).toBe('HIGH');
  });

  it('returns MEDIUM for score in [0.45, 0.75)', () => {
    expect(getTrustLevel(0.74)).toBe('MEDIUM');
    expect(getTrustLevel(0.45)).toBe('MEDIUM');
  });

  it('returns LOW for score below 0.45', () => {
    expect(getTrustLevel(0.44)).toBe('LOW');
    expect(getTrustLevel(0.0)).toBe('LOW');
  });

  it('handles exact boundary values correctly', () => {
    // 0.75 → HIGH (inclusive lower bound)
    expect(getTrustLevel(0.75)).toBe('HIGH');
    // 0.749... → MEDIUM
    expect(getTrustLevel(0.7499)).toBe('MEDIUM');
    // 0.45 → MEDIUM (inclusive lower bound)
    expect(getTrustLevel(0.45)).toBe('MEDIUM');
    // 0.449... → LOW
    expect(getTrustLevel(0.4499)).toBe('LOW');
  });
});

// ─── applyTrustSignal ─────────────────────────────────────────────────────────

describe('applyTrustSignal', () => {
  it('applies asymptotic decay: negative signal proportional to current score', async () => {
    // score=1.0, signal=bot_pattern (weight=-0.15)
    // delta = -0.15 * 1.0 = -0.15 → newScore = 0.85
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 1.0 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const result = await applyTrustSignal('u1', 'bot_pattern');

    expect(result).toBeCloseTo(0.85, 3);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { trust_score: expect.any(Number) } }),
    );
  });

  it('drops less when score is already low (asymptotic approach to 0)', async () => {
    // score=0.3, signal=multi_account_device (weight=-0.25)
    // delta = -0.25 * 0.3 = -0.075 → newScore = 0.225
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 0.3 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const result = await applyTrustSignal('u1', 'multi_account_device');
    expect(result).toBeCloseTo(0.225, 3);
  });

  it('never pushes trust_score below 0', async () => {
    // Even the heaviest signal from score=0.0 should stay at 0
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 0.0 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const result = await applyTrustSignal('u1', 'multi_account_device');
    expect(result).toBe(0);
  });

  it('returns 1.0 without updating when user is not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const result = await applyTrustSignal('u-missing', 'bot_pattern');
    expect(result).toBe(1.0);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('applies multi_account_ip signal with -0.05 weight', async () => {
    // score=0.8, weight=-0.05 → delta = -0.05 * 0.8 = -0.04 → newScore ≈ 0.76
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 0.8 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const result = await applyTrustSignal('u1', 'multi_account_ip');
    expect(result).toBeCloseTo(0.76, 3);
  });

  it('applies impossible_movement signal with -0.20 weight', async () => {
    // score=1.0, weight=-0.20 → delta = -0.20 * 1.0 → newScore = 0.80
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 1.0 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const result = await applyTrustSignal('u1', 'impossible_movement');
    expect(result).toBeCloseTo(0.80, 3);
  });

  it('rounds to 4 decimal places', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 0.9999 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    const result = await applyTrustSignal('u1', 'low_accuracy_gps'); // weight=-0.03
    const decimal_places = result.toString().split('.')[1]?.length ?? 0;
    expect(decimal_places).toBeLessThanOrEqual(4);
  });

  it('returns 1.0 gracefully when an exception is thrown', async () => {
    (prisma.user.findUnique as jest.Mock).mockRejectedValueOnce(new Error('DB timeout'));

    const result = await applyTrustSignal('u1', 'bot_pattern');
    expect(result).toBe(1.0);
  });
});

// ─── recoverTrustScore ────────────────────────────────────────────────────────

describe('recoverTrustScore', () => {
  it('increments trust_score by 0.01 for a user below 1.0', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 0.8 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    await recoverTrustScore('u1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { trust_score: expect.closeTo(0.81, 3) },
      }),
    );
  });

  it('caps at 1.0 when score would exceed it', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 0.999 });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    await recoverTrustScore('u1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { trust_score: 1.0 } }),
    );
  });

  it('skips update when score is already 1.0', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ trust_score: 1.0 });

    await recoverTrustScore('u1');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does nothing when user is not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await recoverTrustScore('u-missing');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not throw when DB call fails', async () => {
    (prisma.user.findUnique as jest.Mock).mockRejectedValueOnce(new Error('connection lost'));

    await expect(recoverTrustScore('u1')).resolves.toBeUndefined();
  });
});
