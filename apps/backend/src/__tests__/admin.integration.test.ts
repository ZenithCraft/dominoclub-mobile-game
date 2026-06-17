jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/tournament.service', () => ({
  createTournament: jest.fn(),
  startTournament: jest.fn(),
  cancelAndRefundTournament: jest.fn().mockResolvedValue(undefined),
  emergencyCancelTournament: jest.fn().mockResolvedValue(undefined),
}));

import supertest from 'supertest';
import app from '../app';
import { prisma } from '../services/prisma.service';
import { config } from '../config';
import { createTournament, startTournament } from '../services/tournament.service';

const request = supertest(app);

async function getAdminToken() {
  const res = await request
    .post('/api/v1/admin/login')
    .send({ username: config.admin.username, password: config.admin.password });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('token');
  return res.body.token as string;
}

describe('Admin API — integration', () => {
  it('POST /admin/login returns 401 with invalid credentials', async () => {
    const res = await request
      .post('/api/v1/admin/login')
      .send({ username: 'nope', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /admin/stats requires auth', async () => {
    const res = await request.get('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });

  it('GET /admin/stats returns expected shape with computed revenue', async () => {
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    (prisma.game.count as jest.Mock).mockResolvedValueOnce(3);
    (prisma.transaction.count as jest.Mock)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(8);
    (prisma.transaction.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { amount: 500 } })
      .mockResolvedValueOnce({ _sum: { amount: -250 } })
      .mockResolvedValueOnce({ _sum: { amount: -100 } });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      { day: 'Mon', revenue: 10, games: 2 },
      { day: 'Tue', revenue: 20, games: 3 },
    ]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalUsers: 10,
      bannedUsers: 2,
      activeGames: 3,
      deposits24h: 4,
      withdrawals24h: 1,
      depositsAmount24h: 500,
      withdrawalsAmount24h: 250,
      totalTransactions24h: 8,
      revenueWeek: [
        { day: 'Mon', revenue: 10, games: 2 },
        { day: 'Tue', revenue: 20, games: 3 },
      ],
    });
    expect(typeof res.body.revenue24h).toBe('number');
  });

  it('GET /admin/users returns paginated users', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'u1',
        name: 'Alice',
        phone: '+5511999990001',
        cpf_verified: true,
        is_banned: false,
        ban_reason: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        bot_score: 0.1,
        wallet: { real_balance: 12.5, bonus_balance: 0 },
        _count: { gamePlayers: 3, fraudLogs: 0 },
      },
    ]);
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(1);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/users?page=1&search=Ali')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 1,
      page: 1,
      pages: 1,
    });
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).toHaveProperty('wallet');
  });

  it('PATCH /admin/users/:id/ban updates ban status', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      name: 'Alice',
      phone: '+5511999990001',
      is_banned: true,
      ban_reason: 'Teste',
    });

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/users/u1/ban')
      .set('Authorization', `Bearer ${token}`)
      .send({ banned: true, reason: 'Teste' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'u1', is_banned: true, ban_reason: 'Teste' });
  });

  it('GET /admin/games returns games with duration', async () => {
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'g1',
        mode: 'ARENA_1V1',
        variant: 'CARROCA',
        status: 'FINISHED',
        bet_amount: 2,
        prize_pool: 3.6,
        house_fee: 0.4,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        finished_at: new Date('2026-01-01T00:20:00.000Z'),
        winner: { id: 'u1', name: 'Alice' },
        players: [{ is_bot: false, user: { id: 'u1', name: 'Alice' } }],
      },
    ]);
    (prisma.game.count as jest.Mock).mockResolvedValueOnce(1);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/games?page=1&status=FINISHED')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.games).toHaveLength(1);
    expect(res.body.games[0].duration).toBe('20min');
  });

  it('GET /admin/games/:id/replay returns 404 when missing', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/games/g-missing/replay')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('GET /admin/transactions returns paginated + pending withdrawal totals', async () => {
    (prisma.transaction.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 't1',
        type: 'WITHDRAWAL',
        amount: -50,
        status: 'PENDING',
        pix_id: null,
        pix_key: 'key',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        wallet: { user: { id: 'u1', name: 'Alice', phone: '+5511999990001' } },
      },
    ]);
    (prisma.transaction.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.transaction.aggregate as jest.Mock).mockResolvedValueOnce({ _sum: { amount: -50 }, _count: 1 });

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/transactions?page=1&type=WITHDRAWAL&status=PENDING')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].amount).toBe(-50);
    expect(res.body.pendingWithdrawalsTotal).toBe(50);
    expect(res.body.pendingWithdrawalsCount).toBe(1);
  });

  it('PATCH /admin/transactions/:id/approve validates type/status and approves', async () => {
    const token = await getAdminToken();

    (prisma.transaction.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res404 = await request
      .patch('/api/v1/admin/transactions/t-missing/approve')
      .set('Authorization', `Bearer ${token}`);
    expect(res404.status).toBe(404);

    (prisma.transaction.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 't2',
      type: 'DEPOSIT',
      status: 'PENDING',
      amount: 10,
      walletId: 'w1',
      wallet: { id: 'w1' },
    });
    const resWrongType = await request
      .patch('/api/v1/admin/transactions/t2/approve')
      .set('Authorization', `Bearer ${token}`);
    expect(resWrongType.status).toBe(400);

    (prisma.transaction.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 't3',
      type: 'WITHDRAWAL',
      status: 'COMPLETED',
      amount: -10,
      walletId: 'w1',
      wallet: { id: 'w1' },
    });
    const resWrongStatus = await request
      .patch('/api/v1/admin/transactions/t3/approve')
      .set('Authorization', `Bearer ${token}`);
    expect(resWrongStatus.status).toBe(400);

    (prisma.transaction.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 't4',
      type: 'WITHDRAWAL',
      status: 'PENDING',
      amount: -10,
      walletId: 'w1',
      wallet: { id: 'w1' },
    });
    (prisma.transaction.update as jest.Mock).mockResolvedValueOnce({
      id: 't4',
      type: 'WITHDRAWAL',
      status: 'COMPLETED',
      amount: -10,
    });
    const resOk = await request
      .patch('/api/v1/admin/transactions/t4/approve')
      .set('Authorization', `Bearer ${token}`);
    expect(resOk.status).toBe(200);
    expect(resOk.body).toMatchObject({ id: 't4', status: 'COMPLETED' });
  });

  it('PATCH /admin/transactions/:id/reject refunds and marks failed', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 't5',
      type: 'WITHDRAWAL',
      status: 'PENDING',
      amount: 25,
      walletId: 'w1',
      wallet: { id: 'w1', user: { id: 'u1' } },
    });

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/transactions/t5/reject')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('GET /admin/tournaments returns paginated tournaments', async () => {
    (prisma.tournament.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tr1', name: 'T1', status: 'SCHEDULED', entry_fee: 2, starts_at: new Date(), _count: { players: 0, games: 0 } },
    ]);
    (prisma.tournament.count as jest.Mock).mockResolvedValueOnce(1);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/tournaments?page=1&status=SCHEDULED')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tournaments).toHaveLength(1);
    expect(res.body.pages).toBe(1);
  });

  it('POST /admin/tournaments validates required fields', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/tournaments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'T1' });
    expect(res.status).toBe(400);
  });

  it('POST /admin/tournaments creates tournament via service', async () => {
    (createTournament as jest.Mock).mockResolvedValueOnce({ id: 'tr2', name: 'T2' });

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/tournaments')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'T2', mode: 'ARENA_1V1', variant: 'CARROCA', entryFee: '2', maxPlayers: '16', startsAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'tr2', name: 'T2' });
    expect(createTournament).toHaveBeenCalledWith(expect.objectContaining({
      name: 'T2',
      entryFee: 2,
      maxPlayers: 16,
    }));
  });

  it('POST /admin/tournaments/:id/start calls service', async () => {
    (startTournament as jest.Mock).mockResolvedValueOnce(undefined);

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/tournaments/tr2/start')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(startTournament).toHaveBeenCalledWith('tr2');
  });

  it('POST /admin/tournaments/:id/cancel refunds players and cancels', async () => {
    const { cancelAndRefundTournament } = require('../services/tournament.service');
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'tr3', status: 'OPEN' });

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/tournaments/tr3/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(cancelAndRefundTournament).toHaveBeenCalledWith('tr3');
  });
});
