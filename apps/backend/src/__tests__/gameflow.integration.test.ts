jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../services/prisma.service';
import { enqueue, matchmakingEvents, QueueEntry } from '../services/matchmaking.service';
import { config } from '../config';
import { deductBet, creditWin } from '../services/wallet.service';

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    userId: overrides.userId || 'u1',
    socketId: overrides.socketId || 's1',
    betAmount: overrides.betAmount ?? 10,
    mode: overrides.mode || 'ARENA_1V1',
    joinedAt: Date.now(),
    isBot: overrides.isBot,
  };
}

describe('Fluxo 1v1 — aposta → partida → prêmio', () => {
  it('deduz aposta de ambos e credita prêmio ao vencedor', async () => {
    (prisma.game.create as jest.Mock).mockResolvedValue({ id: 'g1' });

    const events: any[] = [];
    const once = new Promise<any>((resolve) => {
      matchmakingEvents.once('match_created', (e) => {
        events.push(e);
        resolve(e);
      });
    });

    enqueue(makeEntry({ userId: 'u1', betAmount: 20 }));
    enqueue(makeEntry({ userId: 'u2', betAmount: 20 }));

    const e = await once;
    const bet = e.betAmount as number;
    const prizePool = bet * 2 * (1 - config.game.houseEdgePercent / 100);
    const prizePerWinner = prizePool;

    (prisma.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'w1', real_balance: 100, bonus_balance: 0 })
      .mockResolvedValueOnce({ id: 'w2', real_balance: 80, bonus_balance: 0 });
    (prisma.wallet.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});

    await deductBet('w1', bet);
    await deductBet('w2', bet);
    await creditWin('w1', prizePerWinner);

    const betCalls = (prisma.transaction.create as jest.Mock).mock.calls.filter(
      (c: any) => c[0].data.type === 'BET'
    );
    const winCalls = (prisma.transaction.create as jest.Mock).mock.calls.filter(
      (c: any) => c[0].data.type === 'WIN'
    );

    expect(betCalls).toHaveLength(2);
    expect(winCalls).toHaveLength(1);
    expect(winCalls[0][0].data.amount).toBeCloseTo(prizePerWinner);
  });
});
