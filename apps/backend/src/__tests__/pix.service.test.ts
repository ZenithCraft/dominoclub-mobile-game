jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Stub axios so createPixCharge never hits a real HTTP endpoint
jest.mock('axios', () => ({
  create: jest.fn(() => ({ post: jest.fn().mockResolvedValue({ data: { charge: { brCode: 'mock-br-code' } } }) })),
  post:   jest.fn(),
}));

import { prisma } from '../services/prisma.service';
import { processWithdrawal, createPixCharge, confirmPixDeposit } from '../services/pix.service';

// ─── processWithdrawal — KYC gate ────────────────────────────────────────────

describe('processWithdrawal — KYC gate', () => {
  it('throws when kyc_document_status is null (never submitted)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ kyc_document_status: null });

    await expect(processWithdrawal('u1', 50, 'pix@key.com')).rejects.toThrow(/KYC/i);
    expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
  });

  it('throws when kyc_document_status is PENDING', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ kyc_document_status: 'PENDING' });

    await expect(processWithdrawal('u1', 50, 'pix@key.com')).rejects.toThrow(/KYC/i);
  });

  it('throws when kyc_document_status is REJECTED', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ kyc_document_status: 'REJECTED' });

    await expect(processWithdrawal('u1', 50, 'pix@key.com')).rejects.toThrow(/KYC/i);
  });

  it('proceeds past KYC check when status is APPROVED', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ kyc_document_status: 'APPROVED' });
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'w1', userId: 'u1', real_balance: 200, rollover_remaining: 0,
    });
    (prisma.transaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx1' });
    (prisma.transaction.update as jest.Mock).mockResolvedValueOnce({});

    // NODE_ENV is 'test' (not 'production') so the mock branch executes
    const txId = await processWithdrawal('u1', 50, 'pix@key.com');
    expect(txId).toBe('tx1');
    expect(prisma.wallet.findUnique).toHaveBeenCalled();
  });

  it('throws Insufficient balance even when KYC is APPROVED', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ kyc_document_status: 'APPROVED' });
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'w1', userId: 'u1', real_balance: 10, rollover_remaining: 0,
    });

    await expect(processWithdrawal('u1', 50, 'pix@key.com')).rejects.toThrow(/balance/i);
  });

  it('throws rollover error when rollover_remaining > 0', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ kyc_document_status: 'APPROVED' });
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'w1', userId: 'u1', real_balance: 200, rollover_remaining: 50,
    });

    await expect(processWithdrawal('u1', 50, 'pix@key.com')).rejects.toThrow(/rollover/i);
  });
});

// ─── confirmPixDeposit — coupon bonus ────────────────────────────────────────

describe('confirmPixDeposit', () => {
  it('does nothing when no PENDING deposit matches the correlationID', async () => {
    (prisma.transaction.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(confirmPixDeposit('nonexistent-id')).resolves.toBeUndefined();
    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });

  it('credits real_balance and marks transaction COMPLETED', async () => {
    (prisma.transaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx1',
      walletId: 'w1',
      amount: 100,
      metadata: null,
      wallet: { userId: 'u1' },
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValueOnce({ id: 'w1', real_balance: 200 });
    (prisma.transaction.update as jest.Mock).mockResolvedValueOnce({});

    await confirmPixDeposit('corr-1');

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { real_balance: { increment: 100 } } }),
    );
    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('skips coupon when coupon is inactive', async () => {
    (prisma.transaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx2',
      walletId: 'w1',
      amount: 50,
      metadata: { couponCode: 'PROMO10' },
      wallet: { userId: 'u1' },
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValueOnce({ id: 'w1', real_balance: 150 });
    (prisma.transaction.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.coupon.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'c1', is_active: false });

    await confirmPixDeposit('corr-2');

    // Coupon inactive — no CouponRedemption or bonus wallet update
    expect(prisma.couponRedemption.create).not.toHaveBeenCalled();
  });

  it('applies coupon bonus when active and minimum deposit met', async () => {
    (prisma.transaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx3',
      walletId: 'w1',
      amount: 100,
      metadata: { couponCode: 'BONUS50' },
      wallet: { userId: 'u1' },
    });
    (prisma.wallet.update as jest.Mock)
      .mockResolvedValueOnce({ id: 'w1', real_balance: 200 })   // deposit update
      .mockResolvedValueOnce({ id: 'w1', real_balance: 200, bonus_balance: 50 }); // bonus update
    (prisma.transaction.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.coupon.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'c1',
      is_active: true,
      bonus_amount: 50,
      min_deposit_amount: 50,
      rollover_times: 3,
      max_players: null,
    });
    (prisma.couponRedemption.count as jest.Mock).mockResolvedValueOnce(0);
    (prisma.couponRedemption.create as jest.Mock).mockResolvedValueOnce({});
    (prisma.transaction.create as jest.Mock).mockResolvedValueOnce({});

    await confirmPixDeposit('corr-3');

    expect(prisma.couponRedemption.create).toHaveBeenCalled();
    expect(prisma.wallet.update).toHaveBeenCalledTimes(2);
  });
});
