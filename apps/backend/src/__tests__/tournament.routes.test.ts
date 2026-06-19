jest.mock('../utils/logger', () => ({
  logger:      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  matchLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Tournament service is mocked so we test routing/controller logic in isolation
jest.mock('../services/tournament.service', () => ({
  createTournament:           jest.fn(),
  startTournament:            jest.fn(),
  cancelAndRefundTournament:  jest.fn().mockResolvedValue(undefined),
  emergencyCancelTournament:  jest.fn().mockResolvedValue(undefined),
  advanceTournamentBracket:   jest.fn(),
  setTournamentIo:            jest.fn(),
}));

import supertest from 'supertest';
import app from '../app';
import { prisma } from '../services/prisma.service';
import { signAccessToken } from '../utils/jwt';

const request = supertest(app);

function makeToken(userId = 'u1') {
  return signAccessToken({ userId, phone: '+5511999999999' });
}

// Seed the auth middleware's user lookup for one request
function mockUser(userId = 'u1') {
  (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
    id: userId,
    phone: '+5511999999999',
    is_banned: false,
  });
}

const OPEN_TOURNAMENT = {
  id: 'tr1',
  name: 'Test Cup',
  mode: 'ARENA_1V1',
  variant: 'CARROCA',
  status: 'OPEN',
  entry_fee: 5,
  prize_pool: 18,
  max_players: 4,
  current_players: 2,
  current_round: 0,
  starts_at: new Date('2026-07-01T00:00:00Z'),
  finished_at: null,
  is_in_person: false,
};

// ─── GET /tournaments ─────────────────────────────────────────────────────────

describe('GET /api/v1/game/tournaments', () => {
  it('returns 401 without a token', async () => {
    const res = await request.get('/api/v1/game/tournaments');
    expect(res.status).toBe(401);
  });

  it('returns the list of open/full tournaments', async () => {
    mockUser();
    (prisma.tournament.findMany as jest.Mock).mockResolvedValueOnce([OPEN_TOURNAMENT]);

    const res = await request
      .get('/api/v1/game/tournaments')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.tournaments).toHaveLength(1);
    expect(res.body.tournaments[0].id).toBe('tr1');
  });

  it('returns an empty list when no tournaments are available', async () => {
    mockUser();
    (prisma.tournament.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request
      .get('/api/v1/game/tournaments')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.tournaments).toHaveLength(0);
  });
});

// ─── GET /tournaments/my-active ───────────────────────────────────────────────

describe('GET /api/v1/game/tournaments/my-active', () => {
  it('returns null enrollment when the user is not in any tournament', async () => {
    mockUser();
    (prisma.tournamentPlayer.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const res = await request
      .get('/api/v1/game/tournaments/my-active')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.enrollment).toBeNull();
  });

  it('returns enrollment details when the user is registered', async () => {
    mockUser();
    (prisma.tournamentPlayer.findFirst as jest.Mock).mockResolvedValueOnce({
      tournament: OPEN_TOURNAMENT,
    });

    const res = await request
      .get('/api/v1/game/tournaments/my-active')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.enrollment).toMatchObject({
      tournamentId: 'tr1',
      tournamentName: 'Test Cup',
    });
    expect(res.body.enrollment).toHaveProperty('startsAt');
    expect(res.body.enrollment).toHaveProperty('entryFee');
  });
});

// ─── POST /tournaments/:id/join ───────────────────────────────────────────────

describe('POST /api/v1/game/tournaments/:id/join', () => {
  it('returns 401 without a token', async () => {
    const res = await request.post('/api/v1/game/tournaments/tr1/join');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the tournament does not exist', async () => {
    mockUser();
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async () => {
      const err = new Error('Tournament not found');
      (err as any).status = 404;
      throw err;
    });

    const res = await request
      .post('/api/v1/game/tournaments/missing/join')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when the tournament is not OPEN', async () => {
    mockUser();
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async () => {
      const err = new Error('Tournament not open');
      (err as any).status = 400;
      throw err;
    });

    const res = await request
      .post('/api/v1/game/tournaments/tr1/join')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not open/i);
  });

  it('returns 400 when the user has insufficient balance', async () => {
    mockUser();
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async () => {
      const err = new Error('Saldo insuficiente. O saldo bônus não pode ser usado para torneios.');
      (err as any).status = 400;
      throw err;
    });

    const res = await request
      .post('/api/v1/game/tournaments/tr1/join')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/saldo/i);
  });

  it('returns 200 with "Already enrolled" when the user tries to join again', async () => {
    mockUser();
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async () => {
      const err = new Error('Already enrolled');
      (err as any).status = 200;
      throw err;
    });
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ real_balance: 50 });
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(OPEN_TOURNAMENT);

    const res = await request
      .post('/api/v1/game/tournaments/tr1/join')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already enrolled/i);
  });

  it('joins successfully and returns updated balance + tournament', async () => {
    mockUser();
    // Transaction resolves without calling the callback — simulates a successful commit
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce(undefined);
    // Post-transaction: return updated wallet and tournament
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ real_balance: 45 });
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      ...OPEN_TOURNAMENT,
      current_players: 3,
    });

    const res = await request
      .post('/api/v1/game/tournaments/tr1/join')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/joined/i);
    expect(res.body.balance).toBe(45);
    expect(res.body.tournament).toMatchObject({ id: 'tr1', current_players: 3 });
  });
});

// ─── POST /tournaments/:id/leave ──────────────────────────────────────────────

describe('POST /api/v1/game/tournaments/:id/leave', () => {
  it('returns 401 without a token', async () => {
    const res = await request.post('/api/v1/game/tournaments/tr1/leave');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the tournament does not exist', async () => {
    mockUser();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request
      .post('/api/v1/game/tournaments/missing/leave')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 when the tournament is already IN_PROGRESS', async () => {
    mockUser();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      ...OPEN_TOURNAMENT,
      status: 'IN_PROGRESS',
    });

    const res = await request
      .post('/api/v1/game/tournaments/tr1/leave')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be left/i);
  });

  it('returns 400 when the tournament is FINISHED', async () => {
    mockUser();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      ...OPEN_TOURNAMENT,
      status: 'FINISHED',
    });

    const res = await request
      .post('/api/v1/game/tournaments/tr1/leave')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });

  it('returns 200 "Not enrolled" when the user was never registered', async () => {
    mockUser();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(OPEN_TOURNAMENT);
    (prisma.tournamentPlayer.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ real_balance: 50 });

    const res = await request
      .post('/api/v1/game/tournaments/tr1/leave')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/not enrolled/i);
  });

  it('leaves successfully, refunds the entry fee, and returns updated balance', async () => {
    mockUser();
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce(OPEN_TOURNAMENT)          // initial check
      .mockResolvedValueOnce({ ...OPEN_TOURNAMENT, current_players: 1 }); // final fetch
    (prisma.tournamentPlayer.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'tp1' });
    (prisma.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'w1', real_balance: 45 }) // before refund
      .mockResolvedValueOnce({ id: 'w1', real_balance: 50 }); // after refund

    const res = await request
      .post('/api/v1/game/tournaments/tr1/leave')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/left/i);
    expect(res.body.balance).toBe(50);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// ─── GET /tournaments/:id/bracket ─────────────────────────────────────────────

describe('GET /api/v1/game/tournaments/:id/bracket', () => {
  it('returns 401 without a token', async () => {
    const res = await request.get('/api/v1/game/tournaments/tr1/bracket');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the tournament does not exist', async () => {
    mockUser();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request
      .get('/api/v1/game/tournaments/missing/bracket')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns bracket with tournament, players, games, and myStatus', async () => {
    mockUser();
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      ...OPEN_TOURNAMENT,
      status: 'IN_PROGRESS',
      players: [
        {
          userId: 'u1',
          eliminated_at: null,
          final_position: null,
          prize_won: 0,
          user: { id: 'u1', name: 'Alice', avatar: null },
        },
        {
          userId: 'u2',
          eliminated_at: new Date('2026-06-19T10:00:00Z'),
          final_position: 2,
          prize_won: 0,
          user: { id: 'u2', name: 'Bob', avatar: null },
        },
      ],
      games: [],
    });

    const res = await request
      .get('/api/v1/game/tournaments/tr1/bracket')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tournament');
    expect(res.body).toHaveProperty('players');
    expect(res.body).toHaveProperty('games');
    expect(res.body.myStatus).toMatchObject({
      eliminated: false,
      finalPosition: null,
    });
  });

  it('correctly identifies an eliminated player in myStatus', async () => {
    // u1 is the authenticated user; they were eliminated
    mockUser('u1');
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      ...OPEN_TOURNAMENT,
      status: 'IN_PROGRESS',
      players: [
        {
          userId: 'u1',
          eliminated_at: new Date('2026-06-19T10:00:00Z'),
          final_position: 2,
          prize_won: 0,
          user: { id: 'u1', name: 'Alice', avatar: null },
        },
      ],
      games: [],
    });

    const res = await request
      .get('/api/v1/game/tournaments/tr1/bracket')
      .set('Authorization', `Bearer ${makeToken('u1')}`);

    expect(res.status).toBe(200);
    expect(res.body.myStatus).toMatchObject({
      eliminated: true,
      finalPosition: 2,
    });
  });

  it('returns myStatus with prizeWon for the winner', async () => {
    mockUser('u1');
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      ...OPEN_TOURNAMENT,
      status: 'FINISHED',
      players: [
        {
          userId: 'u1',
          eliminated_at: null,
          final_position: 1,
          prize_won: 18,
          user: { id: 'u1', name: 'Alice', avatar: null },
        },
      ],
      games: [],
    });

    const res = await request
      .get('/api/v1/game/tournaments/tr1/bracket')
      .set('Authorization', `Bearer ${makeToken('u1')}`);

    expect(res.status).toBe(200);
    expect(res.body.myStatus.prizeWon).toBe(18);
    expect(res.body.myStatus.finalPosition).toBe(1);
  });
});
