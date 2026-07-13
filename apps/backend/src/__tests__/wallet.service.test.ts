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
        data: expect.objectContaining({ real_balance: 30, bonus_balance: 0 }),
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
          real_balance: 50,   // unchanged — all deducted from bonus
          bonus_balance: 10,  // 30 - 20
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
          real_balance: 30,  // 50 - 20 (real deduction = 30 - 10 bonus)
          bonus_balance: 0,  // 10 bonus fully consumed
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

  it('routes winnings to bonus_balance when rollover is active', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ rollover_remaining: 100 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({ ...mockWallet, bonus_balance: 80 });
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await creditWin('w1', 30);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bonus_balance: { increment: 30 } },
      })
    );
  });

  it('routes winnings to real_balance once rollover is cleared', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ rollover_remaining: 0 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({ ...mockWallet, real_balance: 180 });
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await creditWin('w1', 80);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { real_balance: { increment: 80 } },
      })
    );
  });
});

describe('rollover mechanics', () => {
  it('decrements rollover_remaining when bet uses bonus funds', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
      ...mockWallet,
      real_balance: 50,
      bonus_balance: 30,
      rollover_remaining: 100,
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 20);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bonus_balance: 10,        // 30 - 20
          real_balance: 50,
          rollover_remaining: 80,   // 100 - 20
        }),
      })
    );
  });

  it('clears rollover immediately when bonus is already 0 going into the bet', async () => {
    // Regression: bonus ran out on an earlier bet (e.g. stale data from before
    // this invariant existed) but rollover_remaining was left stuck > 0. Since
    // rollover only exists to protect bonus funds, the very next bet must drop
    // it to 0 outright rather than grinding it down proportionally to wagers.
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
      ...mockWallet,
      real_balance: 100,
      bonus_balance: 0,
      rollover_remaining: 60,
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 25);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          real_balance: 75,        // 100 - 25
          bonus_balance: 0,
          rollover_remaining: 0,   // forced to 0 — bonus was already gone
        }),
      })
    );
  });

  it('clears rollover when a single bet covers the remaining requirement', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
      ...mockWallet,
      real_balance: 50,
      bonus_balance: 40,
      rollover_remaining: 15,
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 20); // bet > rollover_remaining

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rollover_remaining: 0,
          // rolloverJustCleared → remaining bonus (40-20=20) converts to real
          real_balance: 50 + 20,   // real unchanged by bet + converted bonus
          bonus_balance: 0,
        }),
      })
    );
  });

  it('converts remaining bonus to real when rollover clears mid-bet', async () => {
    // rollover_remaining=10, bet=30 with bonus=50
    // rolloverDeduction = min(10, 30) = 10 → clears
    // bonusDeduction = 30 (all from bonus since bonus >= bet)
    // newBonusBal before clear = 50 - 30 = 20 → converted to real
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
      ...mockWallet,
      real_balance: 100,
      bonus_balance: 50,
      rollover_remaining: 10,
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 30);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rollover_remaining: 0,
          bonus_balance: 0,
          real_balance: 100 + 20,  // 100 (unchanged) + 20 (converted bonus residual)
        }),
      })
    );
  });

  it('does not touch rollover_remaining when no rollover is active', async () => {
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
      ...mockWallet,
      real_balance: 50,
      bonus_balance: 0,
      rollover_remaining: 0,
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 20);

    const updateCall = (prisma.wallet.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('rollover_remaining');
  });

  it('clears rollover when bonus is exhausted by a bet (no bonus left to protect)', async () => {
    // Player has bonus=10, rollover=50. This bet exhausts the bonus.
    // Since there is nothing left to protect, rollover should be dropped immediately.
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
      ...mockWallet,
      real_balance: 100,
      bonus_balance: 10,
      rollover_remaining: 50,
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 10); // uses all bonus

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bonus_balance: 0,
          rollover_remaining: 0, // cleared because bonus is gone
          real_balance: 100,     // real unchanged (bonus covered the bet)
        }),
      })
    );
  });

  it('partial rollover: caps deduction at rollover_remaining, not the bet amount', async () => {
    // rollover_remaining=5, bet=50 → rolloverDeduction = min(5, 50) = 5
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
      ...mockWallet,
      real_balance: 200,
      bonus_balance: 0,
      rollover_remaining: 5,
    });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', 50);

    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rollover_remaining: 0 }),
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
