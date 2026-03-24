import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../services/prisma.service';
import { logger } from '../utils/logger';
import { activeGames } from '../socket/gameSocket';
import { createTournament, startTournament } from '../services/tournament.service';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function adminLoginHandler(req: Request, res: Response) {
  try {
    const { username, password } = req.body;
    if (username !== config.admin.username || password !== config.admin.password) {
      logger.warn('[Admin] Failed login attempt', { username, ip: req.ip });
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const token = jwt.sign({ role: 'admin' }, config.admin.secret, { expiresIn: '12h' });
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
      activeGamesCount,
      deposits24h,
      withdrawals24h,
      revenue24hRows,
      revenueWeek,
    ] = await Promise.all([
      prisma.user.count({ where: { is_banned: false } }),
      prisma.game.count({ where: { status: 'PLAYING' } }),
      prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'COMPLETED', created_at: { gte: since24h } } }),
      prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: { in: ['COMPLETED', 'PENDING'] }, created_at: { gte: since24h } } }),
      prisma.transaction.aggregate({
        where: { type: 'BET', status: 'COMPLETED', created_at: { gte: since24h } },
        _sum: { amount: true },
      }),
      // Last 7 days revenue + game count by day
      prisma.$queryRaw<{ day: string; revenue: number; games: number }[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'Dy') AS day,
          COALESCE(SUM(CASE WHEN type = 'BET' AND status = 'COMPLETED' THEN ABS(amount) ELSE 0 END), 0) AS revenue,
          COUNT(DISTINCT CASE WHEN type = 'BET' AND status = 'COMPLETED' THEN id END) AS games
        FROM "Transaction"
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY DATE_TRUNC('day', created_at)
      `,
    ]);

    res.json({
      totalUsers,
      onlineNow: activeGames.size,
      activeGames: activeGamesCount,
      revenue24h: Math.abs(revenue24hRows._sum.amount ?? 0) * (config.game.houseEdgePercent / 100),
      deposits24h,
      withdrawals24h,
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

    res.json({
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
      pendingWithdrawalsTotal: pendingWithdrawals._sum.amount ?? 0,
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
    const { name, mode, variant, entryFee, maxPlayers, startsAt } = req.body;

    if (!name || !mode || !entryFee || !maxPlayers || !startsAt) {
      return res.status(400).json({ error: 'name, mode, entryFee, maxPlayers, startsAt are required' });
    }

    const tournament = await createTournament({
      name,
      mode,
      variant,
      entryFee: parseFloat(entryFee),
      maxPlayers: parseInt(maxPlayers),
      startsAt: new Date(startsAt),
    });

    logger.info('[Admin] Tournament created', { tournamentId: tournament.id, name });
    res.status(201).json(tournament);
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

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { players: { select: { userId: true } } },
    });

    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (tournament.status === 'FINISHED') return res.status(400).json({ error: 'Cannot cancel a finished tournament' });

    // Refund entry fees to all enrolled players
    for (const player of tournament.players) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: player.userId } });
      if (wallet) {
        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: wallet.id },
            data: { real_balance: { increment: tournament.entry_fee } },
          }),
          prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: 'REFUND',
              amount: tournament.entry_fee,
              status: 'COMPLETED',
              description: `Tournament cancelled — entry fee refund`,
            },
          }),
        ]);
      }
    }

    await prisma.tournament.update({
      where: { id },
      data: { status: 'CANCELLED', finished_at: new Date() },
    });

    logger.info('[Admin] Tournament cancelled — fees refunded', { tournamentId: id, players: tournament.players.length });
    res.json({ message: 'Tournament cancelled and entry fees refunded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
