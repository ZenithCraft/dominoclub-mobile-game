// Prisma is auto-mocked via moduleNameMapper → src/__mocks__/prisma.service.ts
jest.mock('../services/pix.service', () => ({
  createPixCharge: jest.fn(),
  processWithdrawal: jest.fn(),
}));

import { prisma } from '../services/prisma.service';
import { deductBet, creditWin, deposit, withdraw } from '../services/wallet.service';
import { createPixCharge, processWithdrawal } from '../services/pix.service';

const mockWallet = {
  id: 'w1',
  userId: 'u1',
  real_balance: 100,
  bonus_balance: 0,
  rollover_remaining: 0,
};

describe('deductBet', () => {
  it('deducts from real_balance when no bonus available', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 50, bonus_balance: 0 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 20);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ real_balance: { decrement: 20 }, bonus_balance: { decrement: 0 } }),
      })
    );
  });

  it('deducts from bonus_balance first when sufficient', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 50, bonus_balance: 30 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 20);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          real_balance: { decrement: 0 },  // all from bonus
          bonus_balance: { decrement: 20 },
        }),
      })
    );
  });

  it('splits bet between bonus and real when bonus is partial', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 50, bonus_balance: 10 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 30);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          real_balance: { decrement: 20 }, // 30 - 10 bonus
          bonus_balance: { decrement: 10 },
        }),
      })
    );
  });

  it('throws Insufficient balance when real_balance too low', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 5, bonus_balance: 0 });

    await expect(deductBet('w1', 20)).rejects.toThrow('Insufficient balance');
  });

  it('throws Wallet not found when wallet missing', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(deductBet('w1', 20)).rejects.toThrow('Wallet not found');
  });

  it('records a BET transaction', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 50, bonus_balance: 0 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 15);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'BET', amount: -15, status: 'COMPLETED' }),
      })
    );
  });
});

describe('creditWin', () => {
  it('increments real_balance by the prize amount', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ rollover_remaining: 0 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 150 });
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await creditWin('w1', 50);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { real_balance: { increment: 50 } },
      })
    );
  });

  it('records a WIN transaction', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ rollover_remaining: 0 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 150 });
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await creditWin('w1', 50);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'WIN', amount: 50, status: 'COMPLETED' }),
      })
    );
  });
});

describe('deposit', () => {
  it('throws when amount is below minimum', async () => {
    await expect(deposit('u1', 10)).rejects.toThrow('Minimum deposit is R$20');
  });

  it('delegates to createPixCharge for valid amounts', async () => {
    (createPixCharge as jest.Mock).mockResolvedValue({ qrCode: 'abc', txid: 'x1' });
    await deposit('u1', 50);
    expect(createPixCharge).toHaveBeenCalledWith('u1', 50, undefined);
  });
});

describe('withdraw', () => {
  it('throws when amount is below minimum', async () => {
    await expect(withdraw('u1', 10, 'pix@key')).rejects.toThrow('Minimum withdrawal is R$20');
  });

  it('delegates to processWithdrawal for valid amounts', async () => {
    (processWithdrawal as jest.Mock).mockResolvedValue({});
    await withdraw('u1', 50, 'pix@key');
    expect(processWithdrawal).toHaveBeenCalledWith('u1', 50, 'pix@key');
  });
});
