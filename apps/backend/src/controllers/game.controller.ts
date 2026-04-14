import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { createGameSchema } from '../utils/validators';
import { activeGames } from '../socket/gameSocket';
import { startTournament } from '../services/tournament.service';
import { v4 as uuidv4 } from 'uuid';

export async function getGameHistoryHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = 10;

    const games = await prisma.game.findMany({
      where: {
        players: { some: { userId } },
        status: 'FINISHED',
      },
      include: {
        players: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
      orderBy: { finished_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({ games, page });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getGameReplayHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const game = await prisma.game.findUnique({
      where: { id },
      include: { players: true },
    });

    if (!game) return res.status(404).json({ error: 'Game not found' });

    const isPlayer = game.players.some((p: { userId: string }) => p.userId === userId);
    if (!isPlayer) return res.status(403).json({ error: 'Access denied' });

    res.json({ replay: game.replay_data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getActiveGameHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    const activeGame = await prisma.game.findFirst({
      where: {
        players: { some: { userId } },
        status: { in: ['WAITING', 'PLAYING'] },
      },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
      },
    });

    res.json({ game: activeGame });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getTournamentsHandler(req: Request, res: Response) {
  try {
    const tournaments = await prisma.tournament.findMany({
      where: { status: { in: ['OPEN', 'FULL'] } },
      orderBy: { starts_at: 'asc' },
      take: 20,
    });
    res.json({ tournaments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function joinTournamentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (tournament.status !== 'OPEN') return res.status(400).json({ error: 'Tournament not open' });
    if (tournament.current_players >= tournament.max_players) return res.status(400).json({ error: 'Tournament is full' });

    // Already enrolled? Return success idempotently
    const existing = await prisma.tournamentPlayer.findFirst({ where: { tournamentId: id, userId } });
    if (existing) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      return res.json({ message: 'Already enrolled', starting: false, balance: wallet?.real_balance ?? 0, tournament });
    }

    // Check wallet
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.real_balance < tournament.entry_fee) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct entry fee and enroll player
    const newPlayerCount = tournament.current_players + 1;
    const isFull = newPlayerCount >= tournament.max_players;

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: { real_balance: { decrement: tournament.entry_fee } },
      }),
      prisma.tournamentPlayer.create({
        data: { tournamentId: id, userId },
      }),
      prisma.tournament.update({
        where: { id },
        data: {
          current_players: { increment: 1 },
          prize_pool: { increment: tournament.entry_fee * 0.9 },
          status: isFull ? 'FULL' : 'OPEN',
        },
      }),
    ]);

    // Auto-start immediately only if the scheduled start time has already passed
    if (isFull && tournament.starts_at.getTime() <= Date.now()) {
      startTournament(id).catch((err) => {
        console.error('[Tournament] Auto-start failed', err.message);
      });
    }

    // Return updated wallet balance + tournament info for the waiting screen
    const updatedWallet = await prisma.wallet.findUnique({ where: { userId } });
    const updatedTournament = await prisma.tournament.findUnique({ where: { id } });

    res.json({
      message: 'Joined tournament successfully',
      starting: isFull,
      balance: updatedWallet?.real_balance ?? 0,
      tournament: updatedTournament,
    });
  } catch (err: any) {
    // P2002 = unique constraint violation → player already enrolled (race condition)
    if (err?.code === 'P2002') {
      const userId = (req as any).user?.userId;
      const { id } = req.params;
      const wallet   = await prisma.wallet.findUnique({ where: { userId } }).catch(() => null);
      const tournament = await prisma.tournament.findUnique({ where: { id } }).catch(() => null);
      return res.json({ message: 'Already enrolled', starting: false, balance: wallet?.real_balance ?? 0, tournament });
    }
    res.status(500).json({ error: err.message });
  }
}

export async function leaveTournamentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (!['OPEN', 'FULL'].includes(tournament.status)) {
      return res.status(400).json({ error: 'Tournament cannot be left' });
    }

    const existing = await prisma.tournamentPlayer.findFirst({ where: { tournamentId: id, userId } });
    if (!existing) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      return res.json({ message: 'Not enrolled', balance: wallet?.real_balance ?? 0, tournament });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return res.status(400).json({ error: 'Wallet not found' });

    const poolDelta = tournament.entry_fee * 0.9;

    await prisma.$transaction([
      prisma.tournamentPlayer.deleteMany({ where: { tournamentId: id, userId } }),
      prisma.tournament.update({
        where: { id },
        data: {
          current_players: { decrement: 1 },
          prize_pool: { decrement: poolDelta },
          status: 'OPEN',
        },
      }),
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
          description: `Reembolso — saída do torneio "${tournament.name}"`,
        },
      }),
    ]);

    const updatedWallet = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    const updatedTournament = await prisma.tournament.findUnique({ where: { id } });

    res.json({
      message: 'Left tournament successfully',
      balance: updatedWallet?.real_balance ?? 0,
      tournament: updatedTournament,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMyActiveTournamentHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const enrollment = await prisma.tournamentPlayer.findFirst({
      where: {
        userId,
        eliminated_at: null,
        tournament: { status: { in: ['OPEN', 'FULL'] } },
      },
      include: { tournament: true },
    });
    res.json({
      enrollment: enrollment
        ? {
            tournamentId: enrollment.tournament.id,
            tournamentName: enrollment.tournament.name,
            startsAt: enrollment.tournament.starts_at,
            entryFee: enrollment.tournament.entry_fee,
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getTournamentBracketHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { joined_at: 'asc' },
        },
        games: {
          orderBy: [{ tournament_round: 'asc' }, { created_at: 'asc' }],
          include: {
            players: {
              include: { user: { select: { id: true, name: true, avatar: true } } },
            },
          },
        },
      },
    });

    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const myPlayer = tournament.players.find((p) => p.userId === userId);

    res.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        current_round: tournament.current_round,
        max_players: tournament.max_players,
        current_players: tournament.current_players,
        entry_fee: tournament.entry_fee,
        prize_pool: tournament.prize_pool,
        starts_at: tournament.starts_at,
        finished_at: tournament.finished_at,
      },
      players: tournament.players,
      games: tournament.games,
      myStatus: {
        eliminated: !!myPlayer?.eliminated_at,
        finalPosition: myPlayer?.final_position ?? null,
        prizeWon: myPlayer?.prize_won ?? 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
