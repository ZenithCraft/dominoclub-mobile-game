jest.mock('../utils/logger', () => ({
  logger:      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  matchLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../game/domino.engine', () => {
  const actual = jest.requireActual('../game/domino.engine');
  return {
    ...actual,
    initGame: jest.fn((gameId: string, variant: any, players: any[]) => {
    const u1Index = players.findIndex((p: any) => p.userId === 'u1');
    return {
      id: gameId,
      variant,
      players: players.map((p: any, idx: number) => ({
        ...p,
        hand: p.userId === 'u1' ? [[6, 6]] : [[0, 0]],
        connected: true,
        passedLastTurn: false,
        seat: p.seat ?? idx,
      })),
      board: [],
      boneyard: [],
      leftOpen: -1,
      rightOpen: -1,
      topOpen: undefined,
      bottomOpen: undefined,
      currentPlayerIndex: u1Index >= 0 ? u1Index : 0,
      turnCount: 0,
      consecutivePasses: 0,
      status: 'playing',
      winnerId: undefined,
      winnerTeam: undefined,
      matchWinnerTeam: undefined,
      matchScores: { 1: 0, 2: 0 },
      roundNumber: 1,
      targetScore: 1,   // one round = match over, so game:ended fires immediately after u1 plays
      turnStartedAt: Date.now(),
      firstPlayMade: false,
    };
  }),
  };
});

import http from 'http';
import { io as clientIo, Socket as ClientSocket } from 'socket.io-client';
import app from '../app';
import { createSocketServer } from '../socket';
import { prisma } from '../services/prisma.service';
import { signAccessToken } from '../utils/jwt';
import { config } from '../config';

function once<T = any>(socket: any, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: any) => {
      cleanup();
      resolve(payload);
    };
    const cleanup = () => {
      clearTimeout(t);
      socket.off(event, handler);
    };
    socket.on(event, handler);
  });
}

describe('Socket.io — full flow 1v1 + reconexão', () => {
  let server: http.Server;
  let url: string;
  let ioServer: any;

  beforeAll(async () => {
    (config as any).game = { ...config.game, disconnectGraceSeconds: 1, botInjectWaitSeconds: 60 };

    server = http.createServer(app);
    ioServer = createSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('fila → match → join → reconecta dentro do grace → joga → paga prêmio', async () => {

    const walletsByUserId = new Map<string, any>([
      ['u1', { id: 'w1', userId: 'u1', real_balance: 200, bonus_balance: 0, rollover_remaining: 0 }],
      ['u2', { id: 'w2', userId: 'u2', real_balance: 200, bonus_balance: 0, rollover_remaining: 0 }],
    ]);
    const walletsById = new Map<string, any>([
      ['w1', walletsByUserId.get('u1')],
      ['w2', walletsByUserId.get('u2')],
    ]);

    (prisma.user.findUnique as jest.Mock).mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      if (id === 'u1') return { id: 'u1', name: 'Alice', avatar: null, is_banned: false };
      if (id === 'u2') return { id: 'u2', name: 'Bob', avatar: null, is_banned: false };
      return null;
    });

    (prisma.wallet.findUnique as jest.Mock).mockImplementation(async (args: any) => {
      const userId = args?.where?.userId;
      const id = args?.where?.id;
      if (userId) return walletsByUserId.get(userId) ?? null;
      if (id) return walletsById.get(id) ?? null;
      return null;
    });

    (prisma.wallet.update as jest.Mock).mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      const userId = args?.where?.userId;
      const key = id ? id : walletsByUserId.get(userId)?.id;
      if (!key) return null;
      const w = walletsById.get(key);
      if (!w) return null;

      const inc = args?.data?.real_balance?.increment ?? 0;
      const dec = args?.data?.real_balance?.decrement ?? 0;
      const bonusDec = args?.data?.bonus_balance?.decrement ?? 0;
      const next = {
        ...w,
        real_balance: (w.real_balance ?? 0) + inc - dec,
        bonus_balance: (w.bonus_balance ?? 0) - bonusDec,
      };
      walletsById.set(key, next);
      walletsByUserId.set(next.userId, next);
      return next;
    });

    (prisma.transaction.create as jest.Mock).mockResolvedValue({});
    (prisma.game.update as jest.Mock).mockResolvedValue({});
    (prisma.gamePlayer.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    let createdGame: any = null;
    (prisma.game.create as jest.Mock).mockImplementation(async (args: any) => {
      const data = args?.data;
      createdGame = {
        id: data.id,
        mode: data.mode,
        variant: data.variant ?? 'CARROCA',
        status: data.status,
        bet_amount: data.bet_amount,
        prize_pool: data.prize_pool,
        house_fee: data.house_fee,
        tournamentId: data.tournamentId ?? null,
        players: (data.players?.create ?? []).map((p: any) => ({
          userId: p.userId,
          team: p.team,
          seat: p.seat,
          is_bot: p.is_bot ?? false,
          user: { id: p.userId, name: p.userId === 'u1' ? 'Alice' : 'Bob', avatar: null },
        })),
      };
      return { id: data.id };
    });

    (prisma.game.findUnique as jest.Mock).mockImplementation(async (args: any) => {
      if (!createdGame) return null;
      const id = args?.where?.id;
      if (id !== createdGame.id) return null;
      if (args?.include?.players) return createdGame;
      return {
        id: createdGame.id,
        mode: createdGame.mode,
        variant: createdGame.variant,
        bet_amount: createdGame.bet_amount,
        prize_pool: createdGame.prize_pool,
        house_fee: createdGame.house_fee,
        tournamentId: null,
      };
    });

    const token1 = signAccessToken({ userId: 'u1', phone: '+5511999990001' });
    const token2 = signAccessToken({ userId: 'u2', phone: '+5511999990002' });

    const s1 = clientIo(url, { auth: { token: token1 }, transports: ['websocket', 'polling'] });
    const s2 = clientIo(url, { auth: { token: token2 }, transports: ['websocket', 'polling'] });

    const cleanupSockets = async (sockets: ClientSocket[]) => {
      await Promise.all(sockets.map((s) => new Promise<void>((resolve) => {
        if (!s.connected) return resolve();
        s.once('disconnect', () => resolve());
        s.disconnect();
      })));
    };

    try {
      await Promise.all([once(s1, 'connect'), once(s2, 'connect')]);

      const gameFound1 = once<{ gameId: string }>(s1, 'game:found');
      const gameFound2 = once<{ gameId: string }>(s2, 'game:found');

      s1.emit('queue:join', { mode: 'ARENA_1V1', betAmount: 20 });
      s2.emit('queue:join', { mode: 'ARENA_1V1', betAmount: 20 });

      const [f1, f2] = await Promise.all([gameFound1, gameFound2]);
      expect(f1.gameId).toBe(f2.gameId);
      const gameId = f1.gameId;

      s1.emit('game:join', { gameId });
      s2.emit('game:join', { gameId });

      await Promise.all([once(s1, 'game:state'), once(s2, 'game:state')]);

      let forfeited = false;
      s1.on('game:forfeit', () => { forfeited = true; });

      await new Promise<void>((resolve) => {
        s2.once('disconnect', () => resolve());
        s2.disconnect();
      });

      await new Promise((r) => setTimeout(r, 250));

      const s2b = clientIo(url, { auth: { token: token2 }, transports: ['websocket', 'polling'] });
      await once(s2b, 'connect');
      s2b.emit('game:join', { gameId });
      await once(s2b, 'game:state');

      await new Promise((r) => setTimeout(r, 1100));
      expect(forfeited).toBe(false);

      const ended1 = once(s1, 'game:ended');
      const ended2 = once(s2b, 'game:ended');

      s1.emit('game:move', { gameId, tile: [6, 6], side: 'left', flipped: false });

      await Promise.all([ended1, ended2]);

      const txCalls = (prisma.transaction.create as jest.Mock).mock.calls.map((c: any) => c[0]?.data);
      const bets = txCalls.filter((d: any) => d?.type === 'BET');
      const wins = txCalls.filter((d: any) => d?.type === 'WIN');

      expect(bets).toHaveLength(2);
      expect(wins).toHaveLength(1);

      await cleanupSockets([s1, s2b]);
    } finally {
      if (s1.connected) s1.disconnect();
      if (s2.connected) s2.disconnect();
    }
  }, 15000);
});
