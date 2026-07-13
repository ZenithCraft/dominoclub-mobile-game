jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/tournament.service', () => ({
  createTournament: jest.fn(),
  startTournament: jest.fn(),
  cancelAndRefundTournament: jest.fn().mockResolvedValue(undefined),
  emergencyCancelTournament: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/kyc.service', () => ({
  approveKyc: jest.fn().mockResolvedValue(undefined),
  rejectKyc: jest.fn().mockResolvedValue(undefined),
  submitKycDocuments: jest.fn().mockResolvedValue(undefined),
  getKycStatus: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/runtime-config.service', () => ({
  getRuntimeConfig: jest.fn().mockResolvedValue({
    houseEdgePercent: 10,
    botInjectWaitSeconds: 30,
    turnTimeoutSeconds: 60,
    disconnectGraceSeconds: 15,
  }),
  invalidateRuntimeConfigCache: jest.fn(),
}));

jest.mock('../services/league.service', () => ({
  getLeaderboard: jest.fn().mockResolvedValue([
    { userId: 'u1', name: 'Alice', points: 100, rank: 'BRONZE' },
  ]),
  monthlyLeagueReset: jest.fn().mockResolvedValue(5),
  pointsToRank: jest.fn().mockReturnValue('BRONZE'),
}));

jest.mock('../services/push.service', () => ({
  sendPushToAll: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/email.service', () => ({
  emailService: { send: jest.fn().mockResolvedValue(undefined) },
}));

import supertest from 'supertest';
import app from '../app';
import { prisma } from '../services/prisma.service';
import { config } from '../config';
import { approveKyc, rejectKyc } from '../services/kyc.service';
import { emergencyCancelTournament } from '../services/tournament.service';
import { getLeaderboard, monthlyLeagueReset } from '../services/league.service';
import { getRuntimeConfig } from '../services/runtime-config.service';

const request = supertest(app);

async function getAdminToken(): Promise<string> {
  const res = await request
    .post('/api/v1/admin/login')
    .send({ username: config.admin.username, password: config.admin.password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

describe('Admin KYC', () => {
  it('GET /admin/kyc returns pending and rejected users', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'u1', name: 'Alice', phone: '+5511999990001', email: 'a@x.com',
        kyc_document_type: 'RG', kyc_document_status: 'PENDING',
        kyc_document_front_url: 'https://cdn/front.jpg',
        kyc_document_back_url: 'https://cdn/back.jpg',
        kyc_selfie_url: 'https://cdn/selfie.jpg',
        kyc_submitted_at: new Date('2026-06-01T10:00:00Z'),
        kyc_reviewed_at: null, kyc_review_notes: null,
      },
      {
        id: 'u2', name: 'Bob', phone: '+5511999990002', email: null,
        kyc_document_type: 'CNH', kyc_document_status: 'REJECTED',
        kyc_document_front_url: 'https://cdn/front2.jpg',
        kyc_document_back_url: null,
        kyc_selfie_url: 'https://cdn/selfie2.jpg',
        kyc_submitted_at: new Date('2026-06-02T10:00:00Z'),
        kyc_reviewed_at: new Date('2026-06-02T12:00:00Z'),
        kyc_review_notes: 'Documento ilegível',
      },
    ]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/kyc')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'u1', kyc_document_status: 'PENDING' });
    expect(res.body[1]).toMatchObject({ id: 'u2', kyc_document_status: 'REJECTED', kyc_review_notes: 'Documento ilegível' });
  });

  it('GET /admin/kyc returns 401 without auth', async () => {
    const res = await request.get('/api/v1/admin/kyc');
    expect(res.status).toBe(401);
  });

  it('PATCH /admin/kyc/:id/approve calls approveKyc and responds with message', async () => {
    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/kyc/u1/approve')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'KYC approved' });
    expect(approveKyc).toHaveBeenCalledWith('u1');
  });

  it('PATCH /admin/kyc/:id/reject returns 400 when notes are missing', async () => {
    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/kyc/u1/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(rejectKyc).not.toHaveBeenCalled();
  });

  it('PATCH /admin/kyc/:id/reject calls rejectKyc with notes', async () => {
    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/kyc/u1/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Foto borrada no documento' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'KYC rejected' });
    expect(rejectKyc).toHaveBeenCalledWith('u1', 'Foto borrada no documento');
  });
});

// ─── User details & trust ─────────────────────────────────────────────────────

describe('Admin user details & trust', () => {
  it('GET /admin/users/low-trust returns users with computed trust_level', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'u3', name: 'Carol', phone: '+5511999990003', is_banned: false,
        trust_score: 0.2, created_at: new Date(),
        wallet: { real_balance: 5 }, _count: { fraudLogs: 3 },
      },
      {
        id: 'u4', name: 'Dave', phone: '+5511999990004', is_banned: false,
        trust_score: 0.55, created_at: new Date(),
        wallet: { real_balance: 20 }, _count: { fraudLogs: 1 },
      },
    ]);
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(2);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/users/low-trust')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.users[0].trust_level).toBe('LOW');    // 0.2 < 0.45
    expect(res.body.users[1].trust_level).toBe('MEDIUM'); // 0.45 ≤ 0.55 < 0.75
  });

  it('GET /admin/users/:id/details returns 404 when user not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/users/missing-id/details')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('GET /admin/users/:id/details returns full profile', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'u1', name: 'Alice', phone: '+5511999990001', email: 'a@x.com',
      avatar: null, cpf: '12345678901', cpf_verified: true,
      is_banned: false, ban_reason: null, trust_score: 0.9, bot_score: 0.05,
      created_at: new Date(), date_of_birth: null,
      kyc_document_type: 'RG', kyc_document_status: 'APPROVED',
      kyc_document_front_url: 'url', kyc_document_back_url: 'url',
      kyc_selfie_url: 'url', kyc_submitted_at: new Date(),
      kyc_reviewed_at: new Date(), kyc_review_notes: null,
      league_points: 150, previous_rank: null, previous_rank_month: null,
      wallet: { real_balance: 50, bonus_balance: 0 },
    });
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w1' });
    (prisma.transaction.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { amount: 200 } })
      .mockResolvedValueOnce({ _sum: { amount: -50 } });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      { bet_amount: '2', games: 10, wins: 6 },
    ]);
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'g1', mode: 'ARENA_1V1', variant: 'CARROCA',
        bet_amount: 2, prize_pool: 3.6, winner_id: 'u1',
        finished_at: new Date(), tournamentId: null,
      },
    ]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/users/u1/details')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'u1',
      total_deposits: 200,
      total_withdrawals: -50, // withdrawals have negative amounts; controller returns raw sum
      current_rank: 'BRONZE',
    });
    expect(res.body.lobby_stats).toHaveLength(1);
    expect(res.body.lobby_stats[0]).toMatchObject({ bet_amount: 2, games: 10, wins: 6, win_rate: 0.6 });
    expect(res.body.recent_games[0].won).toBe(true);
  });

  it('PATCH /admin/users/:id/restore-trust returns 400 for out-of-range trust_score', async () => {
    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/users/u1/restore-trust')
      .set('Authorization', `Bearer ${token}`)
      .send({ trust_score: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('PATCH /admin/users/:id/restore-trust updates trust_score', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({
      id: 'u1', name: 'Alice', phone: '+5511999990001', trust_score: 1.0,
    });
    (prisma.fraudLog.create as jest.Mock).mockResolvedValueOnce({});

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/users/u1/restore-trust')
      .set('Authorization', `Bearer ${token}`)
      .send({ trust_score: 1.0, reason: 'Revisão manual' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'u1', trust_score: 1.0 });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ trust_score: 1.0 }) }),
    );
  });
});

// ─── Config ───────────────────────────────────────────────────────────────────

describe('Admin config', () => {
  it('GET /admin/config returns current runtime config', async () => {
    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ houseEdgePercent: 10 });
    expect(getRuntimeConfig).toHaveBeenCalled();
  });

  it('PATCH /admin/config rejects unknown keys', async () => {
    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ unknownKey: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown config keys/);
  });

  it('PATCH /admin/config rejects houseEdgePercent > 50', async () => {
    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ houseEdgePercent: 60 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot exceed 50/);
  });

  it('PATCH /admin/config updates valid keys', async () => {
    (prisma.systemConfig.upsert as jest.Mock).mockResolvedValue({});

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ houseEdgePercent: 15, turnTimeoutSeconds: 45 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ houseEdgePercent: 10 }); // from mock
    expect(prisma.systemConfig.upsert).toHaveBeenCalledTimes(2);
  });
});

// ─── Announcements ────────────────────────────────────────────────────────────

describe('Admin announcements', () => {
  const baseAnnouncement = {
    id: 'ann1', title: 'Promoção especial', body: 'Detalhes...',
    html: null, banner_url: null, countdown_end: null,
    max_shows: null, target_rank: null, is_active: true,
    created_at: new Date(), _count: { views: 42 },
  };

  it('GET /admin/announcements returns list', async () => {
    (prisma.announcement.findMany as jest.Mock).mockResolvedValueOnce([baseAnnouncement]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/announcements')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.announcements).toHaveLength(1);
    expect(res.body.announcements[0].title).toBe('Promoção especial');
  });

  it('POST /admin/announcements returns 400 when title is missing', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Sem título' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'title is required');
  });

  it('POST /admin/announcements creates an announcement', async () => {
    (prisma.announcement.create as jest.Mock).mockResolvedValueOnce(baseAnnouncement);

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Promoção especial', body: 'Detalhes...' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'ann1', title: 'Promoção especial' });
  });

  it('PATCH /admin/announcements/:id toggles is_active', async () => {
    (prisma.announcement.update as jest.Mock).mockResolvedValueOnce({ ...baseAnnouncement, is_active: false });

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/announcements/ann1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
    expect(prisma.announcement.update).toHaveBeenCalledWith({
      where: { id: 'ann1' },
      data: { is_active: false },
    });
  });

  it('DELETE /admin/announcements/:id deletes the announcement', async () => {
    (prisma.announcement.delete as jest.Mock).mockResolvedValueOnce({});

    const token = await getAdminToken();
    const res = await request
      .delete('/api/v1/admin/announcements/ann1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: 'ann1' } });
  });
});

// ─── Pair blocks ──────────────────────────────────────────────────────────────

describe('Admin pair blocks', () => {
  it('GET /admin/pair-blocks returns paginated blocks enriched with user info', async () => {
    (prisma.pairBlock.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'pb1', userAId: 'u1', userBId: 'u2', active: true, reason: 'Fraude', created_at: new Date() },
    ]);
    (prisma.pairBlock.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'u1', name: 'Alice', phone: '+5511999990001' },
      { id: 'u2', name: 'Bob',   phone: '+5511999990002' },
    ]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/pair-blocks')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.blocks[0]).toMatchObject({
      id: 'pb1',
      userA: { name: 'Alice' },
      userB: { name: 'Bob' },
    });
  });

  it('POST /admin/pair-blocks returns 400 when IDs are missing', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/pair-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Colusão' });

    expect(res.status).toBe(400);
  });

  it('POST /admin/pair-blocks returns 400 when same user is passed twice', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/pair-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ userAId: 'u1', userBId: 'u1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot block a user with themselves/);
  });

  it('POST /admin/pair-blocks creates block with sorted IDs', async () => {
    (prisma.pairBlock.upsert as jest.Mock).mockResolvedValueOnce({
      id: 'pb2', userAId: 'u1', userBId: 'u3', active: true, reason: 'Teste',
    });

    const token = await getAdminToken();
    // Send u3 before u1 to verify sorting
    const res = await request
      .post('/api/v1/admin/pair-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ userAId: 'u3', userBId: 'u1', reason: 'Teste' });

    expect(res.status).toBe(201);
    // sorted: u1 < u3 → userAId should be 'u1'
    expect(prisma.pairBlock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userAId_userBId: { userAId: 'u1', userBId: 'u3' } },
      }),
    );
  });

  it('PATCH /admin/pair-blocks/:id deactivates a block', async () => {
    (prisma.pairBlock.update as jest.Mock).mockResolvedValueOnce({
      id: 'pb1', userAId: 'u1', userBId: 'u2', active: false, reason: null,
    });

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/pair-blocks/pb1')
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });
});

// ─── Coupons ──────────────────────────────────────────────────────────────────

describe('Admin coupons', () => {
  const baseCoupon = {
    id: 'c1', code: 'PROMO10', bonus_amount: 10, min_deposit_amount: 20,
    rollover_times: 3, max_players: null, eligible_rank: null,
    expires_at: null, is_active: true, created_at: new Date(),
    _count: { redemptions: 5 },
  };

  it('GET /admin/coupons returns paginated coupons', async () => {
    (prisma.coupon.findMany as jest.Mock).mockResolvedValueOnce([baseCoupon]);
    (prisma.coupon.count as jest.Mock).mockResolvedValueOnce(1);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/coupons')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.coupons).toHaveLength(1);
    expect(res.body.coupons[0].code).toBe('PROMO10');
  });

  it('POST /admin/coupons returns 400 when code is missing', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ bonusAmount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/code is required/);
  });

  it('POST /admin/coupons returns 400 when bonusAmount is invalid', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEST', bonusAmount: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bonusAmount/);
  });

  it('POST /admin/coupons creates coupon (code uppercased)', async () => {
    (prisma.coupon.create as jest.Mock).mockResolvedValueOnce({ ...baseCoupon, code: 'PROMO10' });

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'promo10', bonusAmount: 10, minDepositAmount: 20, rolloverTimes: 3 });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('PROMO10');
  });

  it('PATCH /admin/coupons/:id updates is_active', async () => {
    (prisma.coupon.update as jest.Mock).mockResolvedValueOnce({ ...baseCoupon, is_active: false });

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/coupons/c1')
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });

  it('GET /admin/coupons/:id/redemptions returns list', async () => {
    (prisma.couponRedemption.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'r1', couponId: 'c1', created_at: new Date(),
        user: { id: 'u1', name: 'Alice', phone: '+5511999990001' },
        coupon: { code: 'PROMO10' },
      },
    ]);
    (prisma.couponRedemption.count as jest.Mock).mockResolvedValueOnce(1);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/coupons/c1/redemptions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.redemptions).toHaveLength(1);
    expect(res.body.redemptions[0].user.name).toBe('Alice');
  });
});

// ─── Fraud logs ───────────────────────────────────────────────────────────────

describe('Admin fraud logs', () => {
  it('GET /admin/fraud-logs returns paginated logs', async () => {
    (prisma.fraudLog.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'fl1', type: 'BOT_SUSPICION', reason_code: 'HIGH_WIN_RATE',
        details: {}, resolved: false, created_at: new Date(),
        user: { id: 'u1', name: 'Alice', phone: '+5511999990001' },
      },
    ]);
    (prisma.fraudLog.count as jest.Mock).mockResolvedValueOnce(1);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/fraud-logs?resolved=false')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0]).toMatchObject({ id: 'fl1', resolved: false });
  });

  it('GET /admin/fraud-logs filters by type', async () => {
    (prisma.fraudLog.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.fraudLog.count as jest.Mock).mockResolvedValueOnce(0);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/fraud-logs?type=COLLUSION')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(prisma.fraudLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'COLLUSION' }) }),
    );
  });

  it('PATCH /admin/fraud-logs/:id/resolve marks log as resolved', async () => {
    (prisma.fraudLog.update as jest.Mock).mockResolvedValueOnce({
      id: 'fl1', type: 'BOT_SUSPICION', resolved: true,
      user: { id: 'u1', name: 'Alice' },
    });

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/fraud-logs/fl1/resolve')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    expect(prisma.fraudLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fl1' }, data: { resolved: true } }),
    );
  });
});

// ─── Game rooms ───────────────────────────────────────────────────────────────

describe('Admin game rooms', () => {
  const baseRoom = { id: 'gr1', mode: 'ARENA_1V1', bet_amount: 2, label: 'R$2', locked: false };

  it('GET /admin/game-rooms returns all rooms', async () => {
    (prisma.gameRoom.findMany as jest.Mock).mockResolvedValueOnce([baseRoom]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/game-rooms')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(1);
    expect(res.body.rooms[0].bet_amount).toBe(2);
  });

  it('POST /admin/game-rooms returns 400 when mode or betAmount is missing', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/game-rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'ARENA_1V1' });

    expect(res.status).toBe(400);
  });

  it('POST /admin/game-rooms creates a room', async () => {
    (prisma.gameRoom.upsert as jest.Mock).mockResolvedValueOnce(baseRoom);

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/game-rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'ARENA_1V1', betAmount: 2, label: 'R$2' });

    expect(res.status).toBe(201);
    expect(res.body.bet_amount).toBe(2);
  });

  it('PATCH /admin/game-rooms/:id locks a room', async () => {
    (prisma.gameRoom.update as jest.Mock).mockResolvedValueOnce({ ...baseRoom, locked: true });

    const token = await getAdminToken();
    const res = await request
      .patch('/api/v1/admin/game-rooms/gr1')
      .set('Authorization', `Bearer ${token}`)
      .send({ locked: true });

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
  });

  it('DELETE /admin/game-rooms/:id deletes the room', async () => {
    (prisma.gameRoom.delete as jest.Mock).mockResolvedValueOnce({});

    const token = await getAdminToken();
    const res = await request
      .delete('/api/v1/admin/game-rooms/gr1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(prisma.gameRoom.delete).toHaveBeenCalledWith({ where: { id: 'gr1' } });
  });
});

// ─── Tournament extended ───────────────────────────────────────────────────────

describe('Admin tournament extended', () => {
  it('GET /admin/tournaments/:id/players returns player list', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'tr1', name: 'Copa', status: 'IN_PROGRESS',
      entry_fee: 5, max_players: 8, current_players: 4,
      starts_at: new Date(), is_in_person: false, address: null,
      checkin_time: null, banner_url: null,
      players: [
        {
          userId: 'u1', joined_at: new Date(), eliminated_at: null,
          final_position: null, prize_won: null,
          participant_name: null, participant_cpf: null,
          user: { id: 'u1', name: 'Alice', phone: '+5511999990001' },
        },
      ],
    });

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/tournaments/tr1/players')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].user.name).toBe('Alice');
  });

  it('GET /admin/tournaments/:id/players returns 404 when tournament missing', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/tournaments/missing/players')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('GET /admin/tournaments/:id/bracket returns tournament + games', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'tr1', name: 'Copa', status: 'IN_PROGRESS', mode: 'CUP_1V1',
      variant: 'CARROCA', current_round: 1, max_players: 8, current_players: 4,
      starts_at: new Date(), finished_at: null, players: [],
    });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'g1', status: 'FINISHED', tournament_round: 1,
        winner_id: 'u1', winning_team: null,
        created_at: new Date(), finished_at: new Date(),
        players: [{ userId: 'u1', team: null, seat: 0, is_bot: false, user: { id: 'u1', name: 'Alice' } }],
      },
    ]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/tournaments/tr1/bracket')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tournament');
    expect(res.body).toHaveProperty('games');
    expect(res.body.games).toHaveLength(1);
  });

  it('POST /admin/tournaments/:id/emergency-cancel calls service', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/tournaments/tr1/emergency-cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Problema técnico' });

    expect(res.status).toBe(200);
    expect(emergencyCancelTournament).toHaveBeenCalledWith('tr1', 'Problema técnico');
  });

  it('POST /admin/tournaments/demo creates demo tournament', async () => {
    (prisma.tournament.create as jest.Mock).mockResolvedValueOnce({
      id: 'tr-demo', name: 'Demo — inicia em 20s', mode: 'CUP_1V1',
      variant: 'CARROCA', entry_fee: 5, max_players: 8,
      starts_at: new Date(), status: 'OPEN',
    });
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]); // no demo users
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'tr-demo', current_players: 0,
    });

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/tournaments/demo?startsIn=20&maxPlayers=8')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(prisma.tournament.create).toHaveBeenCalled();
  });

  it('POST /admin/tournaments returns 400 when tournament is IN_PROGRESS and trying to cancel', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'tr2', status: 'IN_PROGRESS',
    });

    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/tournaments/tr2/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/in progress/i);
  });
});

// ─── Game logs ────────────────────────────────────────────────────────────────

describe('Admin game logs', () => {
  it('GET /admin/games/:id/logs returns empty logs when file does not exist', async () => {
    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/games/g-test/logs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ logs: [] });
  });
});

// ─── Pair stats ───────────────────────────────────────────────────────────────

describe('Admin pair & team stats', () => {
  it('GET /admin/users/:id/pair-stats returns pairs list', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      {
        otherUserId: 'u2', otherName: 'Bob', otherPhone: '+5511999990002',
        games: 15, wins: 14,
      },
    ]);

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/users/u1/pair-stats?days=30&minGames=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pairs).toHaveLength(1);
    expect(res.body.pairs[0].alert).toBe(true); // 14/15 ≥ 0.9
    expect(res.body.userId).toBe('u1');
  });

  it('GET /admin/team-pair-stats returns empty pairs when no data', async () => {
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([]) // rows
      .mockResolvedValueOnce([]); // hourRows

    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/team-pair-stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pairs).toHaveLength(0);
  });
});

// ─── League ───────────────────────────────────────────────────────────────────

describe('Admin league', () => {
  it('GET /admin/league/leaderboard returns leaderboard', async () => {
    const token = await getAdminToken();
    const res = await request
      .get('/api/v1/admin/league/leaderboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toHaveLength(1);
    expect(res.body.top3).toHaveLength(1);
    expect(getLeaderboard).toHaveBeenCalledWith('month');
  });

  it('GET /admin/league/leaderboard accepts week period', async () => {
    const token = await getAdminToken();
    await request
      .get('/api/v1/admin/league/leaderboard?period=week')
      .set('Authorization', `Bearer ${token}`);

    expect(getLeaderboard).toHaveBeenCalledWith('week');
  });

  it('POST /admin/league/monthly-reset triggers reset and returns count', async () => {
    const token = await getAdminToken();
    const res = await request
      .post('/api/v1/admin/league/monthly-reset')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ usersUpdated: 5 });
    expect(monthlyLeagueReset).toHaveBeenCalled();
  });
});
