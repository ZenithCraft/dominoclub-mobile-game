jest.mock('../utils/logger', () => ({
  logger:      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  matchLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Team assignment is forced by userId here (u1+u2 vs u3+u4) instead of relying
// on matchmaking's randomized split, so the test is deterministic regardless
// of how resolveTeamAssignments shuffles the group.
jest.mock('../game/domino.engine', () => {
  const actual = jest.requireActual('../game/domino.engine');
  return {
    ...actual,
    initGame: jest.fn((gameId: string, variant: any, players: any[]) => {
      const u1Index = players.findIndex((p: any) => p.userId === 'u1');
      const teamFor = (userId: string) => (userId === 'u1' || userId === 'u2' ? 1 : 2);
      return {
        id: gameId,
        variant,
        players: players.map((p: any, idx: number) => ({
          ...p,
          team: teamFor(p.userId),
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
        targetScore: 1, // one round = match over
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

describe('Socket.io — full flow 2v2 (bot substitution on disconnect)', () => {
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
    const allSockets = await ioServer.fetchSockets();
    for (const s of allSockets) s.disconnect(true);

    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('substitui jogador desconectado por bot em vez de encerrar a partida, e exclui o bot do prêmio', async () => {
    const userIds = ['u1', 'u2', 'u3', 'u4'];
    const walletsByUserId = new Map<string, any>(
      userIds.map((id, i) => [id, { id: `w${i + 1}`, userId: id, real_balance: 200, bonus_balance: 0, rollover_remaining: 0 }])
    );
    const walletsById = new Map<string, any>(
      [...walletsByUserId.values()].map((w) => [w.id, w])
    );

    (prisma.user.findUnique as jest.Mock).mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      if (userIds.includes(id)) return { id, name: id, avatar: null, is_banned: false };
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
          user: { id: p.userId, name: p.userId, avatar: null },
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

    const tokens = userIds.map((id) => signAccessToken({ userId: id, phone: `+551199999${id}` }));
    const sockets = userIds.map((_, i) =>
      clientIo(url, { auth: { token: tokens[i] }, transports: ['websocket', 'polling'] })
    );
    const [s1, s2, s3, s4] = sockets;

    const cleanupSockets = async (list: ClientSocket[]) => {
      await Promise.all(list.map((s) => new Promise<void>((resolve) => {
        if (!s.connected) return resolve();
        s.once('disconnect', () => resolve());
        s.disconnect();
      })));
    };

    try {
      await Promise.all(sockets.map((s) => once(s, 'connect')));

      const founds = sockets.map((s) => once<{ gameId: string }>(s, 'game:found'));
      sockets.forEach((s) => s.emit('queue:join', { mode: 'RECREATIONAL_2V2', betAmount: 20 }));

      const foundResults = await Promise.all(founds);
      const gameId = foundResults[0].gameId;
      foundResults.forEach((f) => expect(f.gameId).toBe(gameId));

      const states = sockets.map((s) => once(s, 'game:state'));
      sockets.forEach((s) => s.emit('game:join', { gameId }));
      await Promise.all(states);

      let forfeited = false;
      let botSubstituted = false;
      let replacedUserId: string | null = null;
      s1.on('game:forfeit', () => { forfeited = true; });
      s1.on('game:bot_substitution', (data: { replacedUserId: string }) => {
        botSubstituted = true;
        replacedUserId = data.replacedUserId;
      });

      // u2 (u1's teammate) disconnects mid-game — 2v2 should substitute a bot
      // immediately instead of starting the grace-period forfeit countdown.
      await new Promise<void>((resolve) => {
        s2.once('disconnect', () => resolve());
        s2.disconnect();
      });

      await new Promise((r) => setTimeout(r, 300));

      expect(botSubstituted).toBe(true);
      expect(replacedUserId).toBe('u2');
      expect(forfeited).toBe(false);

      // u1 (team 1, now paired with a bot) plays the winning tile.
      const ended1 = once(s1, 'game:ended');
      const ended3 = once(s3, 'game:ended');
      const ended4 = once(s4, 'game:ended');

      s1.emit('game:move', { gameId, tile: [6, 6], side: 'left', flipped: false });

      const [e1] = await Promise.all([ended1, ended3, ended4]) as any[];
      expect(e1.winnerTeam).toBe(1);

      // Only the surviving human on the winning team (u1) gets paid — the bot
      // that replaced u2 must never receive a WIN transaction/wallet credit.
      const txCalls = (prisma.transaction.create as jest.Mock).mock.calls.map((c: any) => c[0]?.data);
      const wins = txCalls.filter((d: any) => d?.type === 'WIN');
      expect(wins).toHaveLength(1);
      expect(wins[0].walletId).toBe('w1');

      await cleanupSockets([s1, s3, s4]);
    } finally {
      sockets.forEach((s) => { if (s.connected) s.disconnect(); });
    }
  }, 20000);
});
