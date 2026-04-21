import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { prisma } from '../services/prisma.service';
import { logger } from '../utils/logger';
import { AdminRequest } from '../middleware/admin.middleware';
import { activeGames } from '../socket/gameSocket';
import { cancelAndRefundTournament, createTournament, emergencyCancelTournament, startTournament } from '../services/tournament.service';
import { getRuntimeConfig, invalidateRuntimeConfigCache } from '../services/runtime-config.service';
import { approveKyc, rejectKyc } from '../services/kyc.service';
import { monthlyLeagueReset, getLeaderboard, pointsToRank } from '../services/league.service';
import { sendPushToAll } from '../services/push.service';
import { emailService } from '../services/email.service';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function adminLoginHandler(req: Request, res: Response) {
  try {
    const { username, password } = req.body;

    // timingSafeEqual prevents timing-based username/password enumeration
    const usernameMatch = username?.length === config.admin.username.length &&
      timingSafeEqual(Buffer.from(username), Buffer.from(config.admin.username));
    const passwordMatch = password?.length === config.admin.password.length &&
      timingSafeEqual(Buffer.from(password), Buffer.from(config.admin.password));

    if (!usernameMatch || !passwordMatch) {
      logger.warn('[Admin] Failed login attempt', { username, ip: req.ip });
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const token = jwt.sign({ role: 'admin', username: config.admin.username }, config.admin.secret, { expiresIn: '12h' });
    logger.info('[Admin] Login successful', { ip: req.ip });
    res.json({ token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStatsHandler(_req: Request, res: Response) {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      bannedUsers,
      activeGamesCount,
      deposits24h,
      withdrawals24h,
      depositsAmount24h,
      withdrawalsAmount24h,
      totalTransactions24h,
      revenue24hRows,
      revenueWeek,
    ] = await Promise.all([
      prisma.user.count({ where: { is_banned: false } }),
      prisma.user.count({ where: { is_banned: true } }),
      prisma.game.count({ where: { status: 'PLAYING' } }),
      prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'COMPLETED', created_at: { gte: since24h } } }),
      prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: { in: ['COMPLETED', 'PENDING'] }, created_at: { gte: since24h } } }),
      prisma.transaction.aggregate({
        where: { type: 'DEPOSIT', status: 'COMPLETED', created_at: { gte: since24h } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: 'WITHDRAWAL', status: { in: ['COMPLETED', 'PENDING'] }, created_at: { gte: since24h } },
        _sum: { amount: true },
      }),
      prisma.transaction.count({ where: { created_at: { gte: since24h } } }),
      prisma.transaction.aggregate({
        where: { type: 'BET', status: 'COMPLETED', created_at: { gte: since24h } },
        _sum: { amount: true },
      }),
      // Last 7 days revenue + game count by day
      prisma.$queryRaw<{ day: string; revenue: number; games: number }[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'Dy') AS day,
          COALESCE(SUM(CASE WHEN type = 'BET' AND status = 'COMPLETED' THEN ABS(amount) ELSE 0 END), 0)::float AS revenue,
          COUNT(DISTINCT CASE WHEN type = 'BET' AND status = 'COMPLETED' THEN id END)::int AS games
        FROM "Transaction"
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY DATE_TRUNC('day', created_at)
      `,
    ]);

    const betSum = revenue24hRows._sum.amount ?? 0;
    const depSum = depositsAmount24h._sum.amount ?? 0;
    const wdSum = withdrawalsAmount24h._sum.amount ?? 0;

    res.json({
      totalUsers,
      bannedUsers,
      onlineNow: activeGames.size,
      activeGames: activeGamesCount,
      revenue24h: Math.abs(Number(betSum)) * (config.game.houseEdgePercent / 100),
      deposits24h,
      withdrawals24h,
      depositsAmount24h: Math.abs(Number(depSum)),
      withdrawalsAmount24h: Math.abs(Number(wdSum)),
      totalTransactions24h,
      revenueWeek,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUsersHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const search = (req.query.search as string || '').trim();

    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { phone: { contains: search } }, { cpf: { contains: search } }] }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, phone: true, cpf_verified: true,
          is_banned: true, ban_reason: true, created_at: true, bot_score: true,
          wallet: { select: { real_balance: true, bonus_balance: true } },
          _count: { select: { gamePlayers: true, fraudLogs: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Trust Score Management ───────────────────────────────────────────────────

export async function getLowTrustUsersHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { trust_score: { lt: 0.75 } },
        select: {
          id: true, name: true, phone: true, is_banned: true,
          trust_score: true, created_at: true,
          wallet: { select: { real_balance: true } },
          _count: { select: { fraudLogs: true } },
        },
        orderBy: { trust_score: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where: { trust_score: { lt: 0.75 } } }),
    ]);

    const withLevel = users.map((u) => ({
      ...u,
      trust_level: u.trust_score >= 0.75 ? 'HIGH' : u.trust_score >= 0.45 ? 'MEDIUM' : 'LOW',
    }));

    res.json({ users: withLevel, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function restoreTrustHandler(req: AdminRequest, res: Response) {
  try {
    const { id } = req.params;
    const { trust_score = 1.0, reason } = req.body as { trust_score?: number; reason?: string };

    if (trust_score < 0 || trust_score > 1) {
      return res.status(400).json({ error: 'trust_score must be between 0 and 1' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { trust_score },
      select: { id: true, name: true, phone: true, trust_score: true },
    });

    await prisma.fraudLog.create({
      data: {
        userId: id,
        type: 'ADMIN_ACTION' as any,
        reason_code: 'ADMIN_TRUST_RESTORE',
        details: {
          restoredTo: trust_score,
          reason: reason ?? 'Manual admin restore',
          adminId: req.adminUser?.username ?? 'unknown',
        },
      },
    }).catch(() => {});

    logger.info('[Admin] Trust score restored', { userId: id, trust_score, reason });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function banUserHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { banned, reason } = req.body as { banned: boolean; reason?: string };

    const user = await prisma.user.update({
      where: { id },
      data: { is_banned: banned, ban_reason: banned ? (reason || 'Banido pelo admin') : null },
      select: { id: true, name: true, phone: true, is_banned: true, ban_reason: true },
    });

    logger.info('[Admin] User ban status updated', { userId: id, banned, reason });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// ─── Games ────────────────────────────────────────────────────────────────────

export async function getGamesHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const status = req.query.status as string | undefined;

    const where = status ? { status: status as any } : {};

    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        select: {
          id: true, mode: true, variant: true, status: true,
          bet_amount: true, prize_pool: true, house_fee: true,
          created_at: true, finished_at: true,
          winner: { select: { id: true, name: true } },
          players: {
            select: { is_bot: true, user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.game.count({ where }),
    ]);

    const formatted = games.map((g) => ({
      ...g,
      duration: g.finished_at
        ? Math.round((g.finished_at.getTime() - g.created_at.getTime()) / 60000) + 'min'
        : null,
    }));

    res.json({ games: formatted, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactionsHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total, pendingWithdrawals] = await Promise.all([
      prisma.transaction.findMany({
        where,
        select: {
          id: true, type: true, amount: true, status: true,
          pix_id: true, pix_key: true, created_at: true,
          wallet: { select: { user: { select: { id: true, name: true, phone: true } } } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.aggregate({
        where: { type: 'WITHDRAWAL', status: 'PENDING' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const formatted = transactions.map((t) => ({ ...t, amount: Number(t.amount) }));
    const pendingTotal = pendingWithdrawals._sum.amount ?? 0;

    res.json({
      transactions: formatted,
      total,
      page,
      pages: Math.ceil(total / limit),
      pendingWithdrawalsTotal: Math.abs(Number(pendingTotal)),
      pendingWithdrawalsCount: pendingWithdrawals._count,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveWithdrawalHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.type !== 'WITHDRAWAL') return res.status(400).json({ error: 'Not a withdrawal' });
    if (tx.status !== 'PENDING') return res.status(400).json({ error: `Transaction is already ${tx.status}` });

    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    logger.info('[Admin] Withdrawal approved', { txId: id, amount: tx.amount });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function rejectWithdrawalHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { include: { user: true } } },
    });

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.type !== 'WITHDRAWAL') return res.status(400).json({ error: 'Not a withdrawal' });
    if (tx.status !== 'PENDING') return res.status(400).json({ error: `Transaction is already ${tx.status}` });

    // Refund the reserved amount back to the user's wallet
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: tx.walletId },
        data: { real_balance: { increment: tx.amount } },
      }),
      prisma.transaction.update({
        where: { id },
        data: { status: 'FAILED' },
      }),
    ]);

    logger.info('[Admin] Withdrawal rejected — balance refunded', { txId: id, amount: tx.amount });
    res.json({ message: 'Withdrawal rejected and balance refunded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// ─── Game Replay ──────────────────────────────────────────────────────────────

export async function getGameReplayAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const game = await prisma.game.findUnique({
      where: { id },
      select: {
        id: true,
        variant: true,
        status: true,
        bet_amount: true,
        prize_pool: true,
        winner_id: true,
        winning_team: true,
        created_at: true,
        finished_at: true,
        replay_data: true,
        players: {
          select: {
            userId: true,
            team: true,
            seat: true,
            is_bot: true,
            final_score: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    if (!game) return res.status(404).json({ error: 'Game not found' });

    res.json(game);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Game Logs ────────────────────────────────────────────────────────────────

export async function getGameLogsHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const logFile = path.join(process.cwd(), 'logs', 'matches.log');

    if (!fs.existsSync(logFile)) {
      return res.json({ logs: [] });
    }

    const raw = fs.readFileSync(logFile, 'utf-8');
    const logs = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter((e): e is Record<string, any> => e !== null && e.matchId === id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Tournaments ──────────────────────────────────────────────────────────────

export async function getTournamentsAdminHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (status) where.status = status;

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        include: {
          _count: { select: { players: true, games: true } },
        },
        orderBy: { starts_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tournament.count({ where }),
    ]);

    res.json({ tournaments, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createTournamentAdminHandler(req: Request, res: Response) {
  try {
    const { name, mode, variant, entryFee, maxPlayers, startsAt, isInPerson, address, checkinTime, bannerUrl } = req.body;

    if (!name || !mode || !entryFee || !maxPlayers || !startsAt) {
      return res.status(400).json({ error: 'name, mode, entryFee, maxPlayers, startsAt are required' });
    }

    let tournament;
    if (isInPerson) {
      tournament = await prisma.tournament.create({
        data: {
          name,
          mode: mode || 'ARENA_1V1',
          variant: variant || 'CARROCA',
          entry_fee: parseFloat(entryFee),
          max_players: parseInt(maxPlayers),
          starts_at: new Date(startsAt),
          is_in_person: true,
          address: address || null,
          checkin_time: checkinTime ? new Date(checkinTime) : null,
          banner_url: bannerUrl || null,
        },
      });
    } else {
      tournament = await createTournament({
        name,
        mode,
        variant,
        entryFee: parseFloat(entryFee),
        maxPlayers: parseInt(maxPlayers),
        startsAt: new Date(startsAt),
      });
    }

    // Notify all users about new tournament
    sendPushToAll(
      'Novo torneio disponível! 🏆',
      `${name} — inscrições abertas. Taxa: R$${parseFloat(entryFee).toFixed(2)}`,
      { type: 'new_tournament', tournamentId: tournament.id },
    ).catch(() => {});

    logger.info('[Admin] Tournament created', { tournamentId: tournament.id, name, isInPerson: !!isInPerson });
    res.status(201).json(tournament);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function createDemoTournamentAdminHandler(req: Request, res: Response) {
  try {
    const startsInSeconds = Math.max(1, parseInt(String((req.query as any)?.startsIn ?? '20'), 10) || 20);
    const entryFee = Number((req.query as any)?.entryFee ?? 5);
    const maxPlayers = Math.max(2, parseInt(String((req.query as any)?.maxPlayers ?? '16'), 10) || 16);
    const mode = String((req.query as any)?.mode ?? 'CUP_1V1') as any;
    const variant = String((req.query as any)?.variant ?? 'CARROCA') as any;
    const startsAt = new Date(Date.now() + startsInSeconds * 1000);
    const name = String((req.query as any)?.name ?? `Demo — inicia em ${startsInSeconds}s`);

    const tournament = await prisma.tournament.create({
      data: {
        name,
        mode,
        variant,
        entry_fee: entryFee,
        max_players: maxPlayers,
        starts_at: startsAt,
      },
    });

    const phones = ['+5511999990002', '+5511999990003', '+5511999990004'];
    const users = await prisma.user.findMany({
      where: { phone: { in: phones } },
      select: { id: true },
    });

    for (const u of users) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: u.id } });
      if (!wallet || Number(wallet.real_balance) < entryFee) continue;
      await prisma
        .$transaction([
          prisma.wallet.update({
            where: { userId: u.id },
            data: { real_balance: { decrement: entryFee } },
          }),
          prisma.tournamentPlayer.create({
            data: { tournamentId: tournament.id, userId: u.id },
          }),
          prisma.tournament.update({
            where: { id: tournament.id },
            data: {
              current_players: { increment: 1 },
              prize_pool: { increment: entryFee * 0.9 },
            },
          }),
        ])
        .catch(() => null);
    }

    const updated = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    logger.info('[Admin] Demo tournament created', { tournamentId: tournament.id, startsAt, entryFee, maxPlayers });
    res.status(201).json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function startTournamentAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await startTournament(id);
    logger.info('[Admin] Tournament manually started', { tournamentId: id });
    res.json({ message: 'Tournament started' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function cancelTournamentAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const tournament = await prisma.tournament.findUnique({ where: { id }, select: { status: true } });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (tournament.status === 'FINISHED' || tournament.status === 'CANCELLED') {
      return res.status(400).json({ error: `Tournament cannot be cancelled (status: ${tournament.status})` });
    }
    if (tournament.status === 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Tournament is in progress. Use the emergency cancel button.' });
    }

    await cancelAndRefundTournament(id);
    logger.info('[Admin] Tournament cancelled — fees refunded', { tournamentId: id });
    res.json({ message: 'Tournament cancelled and entry fees refunded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function emergencyCancelTournamentAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const reason = String((req.body as any)?.reason ?? 'Admin');
    await emergencyCancelTournament(id, reason);
    logger.info('[Admin] Tournament emergency cancelled', { tournamentId: id, reason });
    res.json({ message: 'Tournament cancelled and active players refunded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function getTournamentPlayersAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        entry_fee: true,
        max_players: true,
        current_players: true,
        starts_at: true,
        is_in_person: true,
        address: true,
        checkin_time: true,
        banner_url: true,
        players: {
          select: {
            userId: true,
            joined_at: true,
            eliminated_at: true,
            final_position: true,
            prize_won: true,
            participant_name: true,
            participant_cpf: true,
            user: { select: { id: true, name: true, phone: true } },
          },
          orderBy: { joined_at: 'asc' },
        },
      },
    });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    res.json(tournament);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getTournamentBracketAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        mode: true,
        variant: true,
        current_round: true,
        max_players: true,
        current_players: true,
        starts_at: true,
        finished_at: true,
        players: {
          select: {
            userId: true,
            eliminated_at: true,
            final_position: true,
            prize_won: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const games = await prisma.game.findMany({
      where: { tournamentId: id },
      orderBy: [{ tournament_round: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        status: true,
        tournament_round: true,
        winner_id: true,
        winning_team: true,
        created_at: true,
        finished_at: true,
        players: {
          select: {
            userId: true,
            team: true,
            seat: true,
            is_bot: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    res.json({ tournament, games });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Runtime Config ───────────────────────────────────────────────────────────

const EDITABLE_KEYS = new Set([
  'houseEdgePercent',
  'botInjectWaitSeconds',
  'turnTimeoutSeconds',
  'disconnectGraceSeconds',
]);

export async function getConfigHandler(_req: Request, res: Response) {
  try {
    const cfg = await getRuntimeConfig();
    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateConfigHandler(req: Request, res: Response) {
  try {
    const updates = req.body as Record<string, unknown>;
    const unknown = Object.keys(updates).filter((k) => !EDITABLE_KEYS.has(k));
    if (unknown.length > 0) {
      return res.status(400).json({ error: `Unknown config keys: ${unknown.join(', ')}` });
    }

    for (const [key, value] of Object.entries(updates)) {
      const parsed = Number(value);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ error: `Invalid value for ${key}: must be a non-negative number` });
      }
      if (key === 'houseEdgePercent' && parsed > 50) {
        return res.status(400).json({ error: 'houseEdgePercent cannot exceed 50%' });
      }
    }

    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.systemConfig.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        })
      )
    );

    invalidateRuntimeConfigCache();

    const newCfg = await getRuntimeConfig();
    logger.info('[Admin] Runtime config updated', { updates });
    res.json(newCfg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Pair Blocks ──────────────────────────────────────────────────────────────

export async function getPairBlocksAdminHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const active = req.query.active as string | undefined;
    const where: any = {};
    if (active !== undefined) where.active = active === 'true';

    const [blocks, total] = await Promise.all([
      prisma.pairBlock.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pairBlock.count({ where }),
    ]);

    const userIds = Array.from(new Set(blocks.flatMap((b) => [b.userAId, b.userBId])));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, phone: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    res.json({
      blocks: blocks.map((b) => ({
        ...b,
        userA: userById.get(b.userAId) ?? { id: b.userAId, name: null, phone: null },
        userB: userById.get(b.userBId) ?? { id: b.userBId, name: null, phone: null },
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createPairBlockAdminHandler(req: Request, res: Response) {
  try {
    const { userAId, userBId, reason } = req.body as any;
    if (!userAId || !userBId) return res.status(400).json({ error: 'userAId and userBId are required' });
    if (userAId === userBId) return res.status(400).json({ error: 'Cannot block a user with themselves' });

    const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];

    const block = await prisma.pairBlock.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      update: { active: true, reason: reason ? String(reason) : undefined },
      create: { userAId: a, userBId: b, reason: reason ? String(reason) : undefined, active: true },
    });

    logger.info('[Admin] Pair blocked', { userAId: a, userBId: b });
    res.status(201).json(block);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function updatePairBlockAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { active, reason } = req.body as any;
    const patch: any = {};
    if (active !== undefined) patch.active = !!active;
    if (reason !== undefined) patch.reason = reason ? String(reason) : null;
    const updated = await prisma.pairBlock.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function getUserPairStatsAdminHandler(req: Request, res: Response) {
  try {
    const { id: userId } = req.params;
    const days = Math.max(1, parseInt(req.query.days as string) || 30);
    const minGames = Math.max(1, parseInt(req.query.minGames as string) || 10);

    const rows = await prisma.$queryRaw<
      { otherUserId: string; otherName: string | null; otherPhone: string | null; games: number; wins: number }[]
    >`
      WITH user_games AS (
        SELECT
          g.id AS "gameId",
          g.mode AS mode,
          g.winner_id AS "winnerId",
          g.winning_team AS "winningTeam",
          ug.team AS "userTeam"
        FROM "Game" g
        JOIN "GamePlayer" ug
          ON ug."gameId" = g.id
         AND ug."userId" = ${userId}
        WHERE g.status = 'FINISHED'
          AND g.created_at >= NOW() - (${days} || ' days')::interval
      ),
      pairs AS (
        SELECT
          og."userId" AS "otherUserId",
          COUNT(*)::int AS games,
          SUM(
            CASE
              WHEN ug.mode IN ('TOURNAMENT_2V2', 'RECREATIONAL_2V2')
                THEN CASE WHEN ug."winningTeam" = ug."userTeam" THEN 1 ELSE 0 END
              ELSE CASE WHEN ug."winnerId" = ${userId} THEN 1 ELSE 0 END
            END
          )::int AS wins
        FROM user_games ug
        JOIN "GamePlayer" og
          ON og."gameId" = ug."gameId"
         AND og."userId" <> ${userId}
         AND og.is_bot = false
        GROUP BY og."userId"
      )
      SELECT
        p."otherUserId",
        u.name AS "otherName",
        u.phone AS "otherPhone",
        p.games,
        p.wins
      FROM pairs p
      JOIN "User" u ON u.id = p."otherUserId"
      WHERE p.games >= ${minGames}
      ORDER BY (p.wins::float / p.games) DESC, p.games DESC
      LIMIT 50
    `;

    const threshold = 0.9;
    res.json({
      userId,
      days,
      minGames,
      pairs: rows.map((r) => ({
        otherUserId: r.otherUserId,
        otherName: r.otherName,
        otherPhone: r.otherPhone,
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: r.games > 0 ? Number(r.wins) / Number(r.games) : 0,
        alert: r.games > 0 ? Number(r.wins) / Number(r.games) >= threshold : false,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Coupons / Bonus ──────────────────────────────────────────────────────────

export async function getCouponsAdminHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { redemptions: true } } },
      }),
      prisma.coupon.count(),
    ]);
    res.json({ coupons, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createCouponAdminHandler(req: Request, res: Response) {
  try {
    const { code, bonusAmount, minDepositAmount, rolloverTimes, maxPlayers, eligibleRank, expiresAt } = req.body as any;
    const parsedCode = String(code ?? '').trim().toUpperCase();
    const parsedBonus = Number(bonusAmount);
    const parsedMinDeposit = Number(minDepositAmount ?? 0);
    const parsedRolloverTimes = parseInt(String(rolloverTimes ?? 0), 10);
    const parsedMaxPlayers = maxPlayers === null || maxPlayers === undefined || maxPlayers === '' ? null : parseInt(String(maxPlayers), 10);
    const validRanks = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    const parsedRank = eligibleRank && validRanks.includes(eligibleRank) ? eligibleRank : null;
    const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;

    if (!parsedCode) return res.status(400).json({ error: 'code is required' });
    if (!Number.isFinite(parsedBonus) || parsedBonus <= 0) return res.status(400).json({ error: 'bonusAmount must be a positive number' });
    if (!Number.isFinite(parsedMinDeposit) || parsedMinDeposit < 0) return res.status(400).json({ error: 'minDepositAmount must be a non-negative number' });
    if (!Number.isFinite(parsedRolloverTimes) || parsedRolloverTimes < 0) return res.status(400).json({ error: 'rolloverTimes must be a non-negative integer' });
    if (parsedMaxPlayers !== null && (!Number.isFinite(parsedMaxPlayers) || parsedMaxPlayers <= 0)) {
      return res.status(400).json({ error: 'maxPlayers must be a positive integer or null' });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: parsedCode,
        bonus_amount: parsedBonus,
        min_deposit_amount: parsedMinDeposit,
        rollover_times: parsedRolloverTimes,
        max_players: parsedMaxPlayers,
        eligible_rank: parsedRank,
        expires_at: parsedExpiresAt,
        is_active: true,
      },
    });
    res.status(201).json(coupon);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateCouponAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { is_active, eligibleRank, expiresAt } = req.body as any;
    const validRanks = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    const data: any = {};
    if (is_active !== undefined) data.is_active = !!is_active;
    if (eligibleRank !== undefined) data.eligible_rank = validRanks.includes(eligibleRank) ? eligibleRank : null;
    if (expiresAt !== undefined) data.expires_at = expiresAt ? new Date(expiresAt) : null;
    const updated = await prisma.coupon.update({ where: { id }, data });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function getCouponRedemptionsAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const [redemptions, total] = await Promise.all([
      prisma.couponRedemption.findMany({
        where: { couponId: id },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true, phone: true } }, coupon: { select: { code: true } } },
      }),
      prisma.couponRedemption.count({ where: { couponId: id } }),
    ]);
    res.json({ redemptions, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Fraud Logs ───────────────────────────────────────────────────────────────

export async function getFraudLogsHandler(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const type = req.query.type as string | undefined;
    const resolved = req.query.resolved as string | undefined;

    const where: any = {};
    if (type) where.type = type;
    if (resolved !== undefined) where.resolved = resolved === 'true';

    const [logs, total] = await Promise.all([
      prisma.fraudLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fraudLog.count({ where }),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function resolveFraudLogHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const log = await prisma.fraudLog.update({
      where: { id },
      data: { resolved: true },
      include: { user: { select: { id: true, name: true } } },
    });
    logger.info('[Admin] Fraud log resolved', { logId: id, type: log.type, userId: log.userId });
    res.json(log);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// ─── Game Rooms ───────────────────────────────────────────────────────────────
// Admin-managed slots: a room = mode + bet_amount combination.
// Locking a room prevents new matches from being created in that slot.

export async function getGameRoomsAdminHandler(req: Request, res: Response) {
  try {
    const rooms = await prisma.gameRoom.findMany({ orderBy: [{ mode: 'asc' }, { bet_amount: 'asc' }] });
    res.json({ rooms: rooms.map((r) => ({ ...r, bet_amount: Number(r.bet_amount) })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createGameRoomAdminHandler(req: Request, res: Response) {
  try {
    const { mode, betAmount, label } = req.body as any;
    if (!mode || betAmount === undefined) return res.status(400).json({ error: 'mode and betAmount are required' });
    const parsed = parseFloat(String(betAmount));
    if (!Number.isFinite(parsed) || parsed < 0) return res.status(400).json({ error: 'betAmount must be a non-negative number' });

    const room = await prisma.gameRoom.upsert({
      where: { mode_bet_amount: { mode, bet_amount: parsed } },
      update: { label: label ? String(label) : undefined },
      create: { mode, bet_amount: parsed, label: label ? String(label) : undefined },
    });
    logger.info('[Admin] Game room created/updated', { mode, betAmount: parsed });
    res.status(201).json({ ...room, bet_amount: Number(room.bet_amount) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateGameRoomAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { locked, label } = req.body as any;
    const patch: any = {};
    if (locked !== undefined) patch.locked = !!locked;
    if (label  !== undefined) patch.label  = label ? String(label) : null;
    const room = await prisma.gameRoom.update({ where: { id }, data: patch });
    logger.info('[Admin] Game room updated', { id, patch });
    res.json({ ...room, bet_amount: Number(room.bet_amount) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteGameRoomAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.gameRoom.delete({ where: { id } });
    logger.info('[Admin] Game room deleted', { id });
    res.json({ message: 'Room deleted' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

// ─── 2v2 Team Pair Stats ──────────────────────────────────────────────────────
// Returns pairs that frequently play on the SAME team in 2v2, with win-rate and
// solo-play data for collusion analysis. Also returns active cooldown state.

export async function getTeamPairStatsAdminHandler(req: Request, res: Response) {
  try {
    const days      = Math.max(1,   parseInt(req.query.days      as string) || 30);
    const minGames  = Math.max(1,   parseInt(req.query.minGames  as string) || 5);
    const threshold = Math.max(0, Math.min(1, parseFloat(req.query.threshold as string) || 0.70));

    // ── Step 1: same-team pair aggregation ───────────────────────────────────
    const rows = await prisma.$queryRaw<{
      userAId: string; userAName: string | null; userAPhone: string | null;
      userBId: string; userBName: string | null; userBPhone: string | null;
      gamesTogether: number; winsTogether: number; lastPlayedAt: Date;
      userATotalGames: number; userBTotalGames: number;
    }[]>`
      WITH team_games AS (
        SELECT
          LEAST(p1."userId",    p2."userId")    AS "userAId",
          GREATEST(p1."userId", p2."userId")    AS "userBId",
          g.id                                  AS game_id,
          g.created_at,
          CASE WHEN g.winning_team = p1.team THEN 1 ELSE 0 END AS won
        FROM "Game" g
        JOIN "GamePlayer" p1 ON p1."gameId" = g.id AND p1.is_bot = false
        JOIN "GamePlayer" p2 ON p2."gameId" = g.id AND p2.is_bot = false
          AND p2."userId" > p1."userId"
          AND p2.team = p1.team
        WHERE g.mode IN ('TOURNAMENT_2V2', 'RECREATIONAL_2V2')
          AND g.status = 'FINISHED'
          AND g.created_at >= NOW() - (${days} || ' days')::interval
      ),
      pair_agg AS (
        SELECT
          "userAId",
          "userBId",
          COUNT(*)::int         AS "gamesTogether",
          SUM(won)::int         AS "winsTogether",
          MAX(created_at)       AS "lastPlayedAt"
        FROM team_games
        GROUP BY "userAId", "userBId"
        HAVING COUNT(*) >= ${minGames}
      ),
      individual_games AS (
        SELECT p."userId", COUNT(*)::int AS total_games
        FROM "GamePlayer" p
        JOIN "Game" g ON g.id = p."gameId"
        WHERE g.mode IN ('TOURNAMENT_2V2', 'RECREATIONAL_2V2')
          AND g.status = 'FINISHED'
          AND g.created_at >= NOW() - (${days} || ' days')::interval
          AND p.is_bot = false
        GROUP BY p."userId"
      )
      SELECT
        pa."userAId",
        ua.name    AS "userAName",
        ua.phone   AS "userAPhone",
        pa."userBId",
        ub.name    AS "userBName",
        ub.phone   AS "userBPhone",
        pa."gamesTogether",
        pa."winsTogether",
        pa."lastPlayedAt",
        COALESCE(ia.total_games, 0)::int AS "userATotalGames",
        COALESCE(ib.total_games, 0)::int AS "userBTotalGames"
      FROM pair_agg pa
      JOIN "User" ua ON ua.id = pa."userAId"
      JOIN "User" ub ON ub.id = pa."userBId"
      LEFT JOIN individual_games ia ON ia."userId" = pa."userAId"
      LEFT JOIN individual_games ib ON ib."userId" = pa."userBId"
      WHERE pa."winsTogether"::float / pa."gamesTogether" >= ${threshold}
      ORDER BY (pa."winsTogether"::float / pa."gamesTogether") DESC, pa."gamesTogether" DESC
      LIMIT 50
    `;

    // ── Step 2: per-pair hourly overlap ──────────────────────────────────────
    // Compute common hours (0-23) they each played, as an overlap score 0-100
    const hourRows = await prisma.$queryRaw<{
      userAId: string; userBId: string; overlap: number;
    }[]>`
      WITH hours_a AS (
        SELECT
          LEAST(p1."userId", p2."userId")    AS "userAId",
          GREATEST(p1."userId", p2."userId") AS "userBId",
          EXTRACT(HOUR FROM g.created_at)::int AS hr
        FROM "Game" g
        JOIN "GamePlayer" p1 ON p1."gameId" = g.id AND p1.is_bot = false
        JOIN "GamePlayer" p2 ON p2."gameId" = g.id AND p2.is_bot = false
          AND p2."userId" > p1."userId"
          AND p2.team = p1.team
        WHERE g.mode IN ('TOURNAMENT_2V2', 'RECREATIONAL_2V2')
          AND g.status = 'FINISHED'
          AND g.created_at >= NOW() - (${days} || ' days')::interval
      )
      SELECT
        "userAId",
        "userBId",
        (COUNT(DISTINCT hr)::float / 24 * 100)::int AS overlap
      FROM hours_a
      GROUP BY "userAId", "userBId"
    `;
    const overlapMap = new Map(hourRows.map((r) => [`${r.userAId}:${r.userBId}`, Number(r.overlap)]));

    // ── Step 3: fetch cooldown records ────────────────────────────────────────
    const pairKeys = rows.map((r) => ({ userAId: r.userAId, userBId: r.userBId }));
    const cooldowns = pairKeys.length
      ? await prisma.partnerCooldown.findMany({
          where: { OR: pairKeys },
          select: { userAId: true, userBId: true, consecutive_same_team: true, cooldown_remaining: true },
        })
      : [];
    const cdMap = new Map(cooldowns.map((c) => [`${c.userAId}:${c.userBId}`, c]));

    res.json({
      days,
      minGames,
      threshold,
      pairs: rows.map((r) => {
        const gt       = Number(r.gamesTogether);
        const wt       = Number(r.winsTogether);
        const aTot     = Number(r.userATotalGames);
        const bTot     = Number(r.userBTotalGames);
        const winRate  = gt > 0 ? wt / gt : 0;
        const cdKey    = `${r.userAId}:${r.userBId}`;
        const cd       = cdMap.get(cdKey);
        return {
          userA: { id: r.userAId, name: r.userAName, phone: r.userAPhone },
          userB: { id: r.userBId, name: r.userBName, phone: r.userBPhone },
          gamesTogether:        gt,
          winsTogether:         wt,
          winRate,
          lastPlayedAt:         r.lastPlayedAt,
          // solo ratio: proportion of their 2v2 games played WITHOUT this partner
          userASoloRatio:       aTot > 0 ? Math.round((1 - gt / aTot) * 100) : 0,
          userBSoloRatio:       bTot > 0 ? Math.round((1 - gt / bTot) * 100) : 0,
          userATotalGames:      aTot,
          userBTotalGames:      bTot,
          // % of hours in the day (0-23) where they played together
          hourOverlapPct:       overlapMap.get(cdKey) ?? 0,
          consecutiveSameTeam:  cd?.consecutive_same_team  ?? 0,
          cooldownRemaining:    cd?.cooldown_remaining     ?? 0,
          alert:                winRate >= threshold,
        };
      }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── KYC Review ───────────────────────────────────────────────────────────────

export async function getPendingKycHandler(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { kyc_document_status: { in: ['PENDING', 'REJECTED'] } },
      select: {
        id: true, name: true, phone: true, email: true,
        kyc_document_type: true, kyc_document_status: true,
        kyc_document_front_url: true, kyc_document_back_url: true,
        kyc_selfie_url: true, kyc_submitted_at: true,
        kyc_reviewed_at: true, kyc_review_notes: true,
      },
      orderBy: { kyc_submitted_at: 'asc' },
    });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveKycHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await approveKyc(id);
    logger.info('[Admin] KYC approved', { userId: id });
    res.json({ message: 'KYC approved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function rejectKycHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: 'Review notes are required for rejection' });
    await rejectKyc(id, notes);
    logger.info('[Admin] KYC rejected', { userId: id });
    res.json({ message: 'KYC rejected' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── User Details (KYC + history + stats) ────────────────────────────────────

export async function getUserDetailsAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, phone: true, email: true, avatar: true,
        cpf: true, cpf_verified: true, is_banned: true, ban_reason: true,
        trust_score: true, bot_score: true, created_at: true,
        date_of_birth: true,
        kyc_document_type: true, kyc_document_status: true,
        kyc_document_front_url: true, kyc_document_back_url: true,
        kyc_selfie_url: true, kyc_submitted_at: true,
        kyc_reviewed_at: true, kyc_review_notes: true,
        league_points: true, previous_rank: true, previous_rank_month: true,
        wallet: { select: { real_balance: true, bonus_balance: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Deposits and withdrawals totals
    const wallet = await prisma.wallet.findUnique({ where: { userId: id } });
    const [depositsAgg, withdrawalsAgg] = wallet
      ? await Promise.all([
          prisma.transaction.aggregate({
            where: { walletId: wallet.id, type: 'DEPOSIT', status: 'COMPLETED' },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { walletId: wallet.id, type: 'WITHDRAWAL', status: 'COMPLETED' },
            _sum: { amount: true },
          }),
        ])
      : [{ _sum: { amount: null } }, { _sum: { amount: null } }];

    // Win rate per lobby (bet amount)
    const lobbyStats: { bet_amount: string; games: number; wins: number }[] = await prisma.$queryRaw`
      SELECT
        g.bet_amount::text,
        COUNT(gp.id)::int           AS games,
        SUM(CASE WHEN g.winner_id = ${id} THEN 1 ELSE 0 END)::int AS wins
      FROM "GamePlayer" gp
      JOIN "Game" g ON g.id = gp."gameId"
      WHERE gp."userId" = ${id}
        AND g.status = 'FINISHED'
        AND gp.is_bot = false
      GROUP BY g.bet_amount
      ORDER BY g.bet_amount
    `;

    // Recent match history (last 20)
    const recentGames = await prisma.game.findMany({
      where: {
        players: { some: { userId: id, is_bot: false } },
        status: 'FINISHED',
      },
      orderBy: { finished_at: 'desc' },
      take: 20,
      select: {
        id: true, mode: true, variant: true, bet_amount: true,
        prize_pool: true, winner_id: true, finished_at: true,
        tournamentId: true,
      },
    });

    res.json({
      ...user,
      total_deposits: Number(depositsAgg._sum.amount ?? 0),
      total_withdrawals: Number(withdrawalsAgg._sum.amount ?? 0),
      current_rank: pointsToRank(user.league_points),
      lobby_stats: lobbyStats.map((r) => ({
        bet_amount: Number(r.bet_amount),
        games: Number(r.games),
        wins: Number(r.wins),
        win_rate: Number(r.games) > 0 ? Number(r.wins) / Number(r.games) : 0,
      })),
      recent_games: recentGames.map((g) => ({
        ...g,
        bet_amount: Number(g.bet_amount),
        prize_pool: Number(g.prize_pool),
        won: g.winner_id === id,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Announcements ────────────────────────────────────────────────────────────

export async function getAnnouncementsAdminHandler(_req: Request, res: Response) {
  try {
    const items = await prisma.announcement.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { views: true } } },
    });
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createAnnouncementAdminHandler(req: Request, res: Response) {
  try {
    const { title, body, html, banner_url, countdown_end, max_shows, target_rank, is_active } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const validRanks = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    const item = await prisma.announcement.create({
      data: {
        title,
        body: body || null,
        html: html || null,
        banner_url: banner_url || null,
        countdown_end: countdown_end ? new Date(countdown_end) : null,
        max_shows: max_shows ? parseInt(String(max_shows), 10) : null,
        target_rank: target_rank && validRanks.includes(target_rank) ? target_rank : null,
        is_active: is_active !== false,
      },
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateAnnouncementAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { title, body, html, banner_url, countdown_end, max_shows, target_rank, is_active } = req.body;
    const validRanks = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (body !== undefined) data.body = body;
    if (html !== undefined) data.html = html;
    if (banner_url !== undefined) data.banner_url = banner_url;
    if (countdown_end !== undefined) data.countdown_end = countdown_end ? new Date(countdown_end) : null;
    if (max_shows !== undefined) data.max_shows = max_shows ? parseInt(String(max_shows), 10) : null;
    if (target_rank !== undefined) data.target_rank = target_rank && validRanks.includes(target_rank) ? target_rank : null;
    if (is_active !== undefined) data.is_active = !!is_active;
    const item = await prisma.announcement.update({ where: { id }, data });
    res.json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteAnnouncementAdminHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.announcement.delete({ where: { id } });
    res.json({ message: 'Announcement deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── League Admin ─────────────────────────────────────────────────────────────

export async function getLeaderboardAdminHandler(req: Request, res: Response) {
  try {
    const period = (req.query.period as 'week' | 'month') ?? 'month';
    const data = await getLeaderboard(period);
    res.json({ period, leaderboard: data, top3: data.slice(0, 3) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function triggerMonthlyResetAdminHandler(_req: Request, res: Response) {
  try {
    const updated = await monthlyLeagueReset();
    res.json({ message: `Monthly reset complete`, usersUpdated: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
