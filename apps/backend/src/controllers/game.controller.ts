import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { createGameSchema } from '../utils/validators';
import { activeGames } from '../socket/gameSocket';
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

    const isPlayer = game.players.some((p) => p.userId === userId);
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

    // Check wallet
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.real_balance < tournament.entry_fee) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct entry fee
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
        },
      }),
    ]);

    res.json({ message: 'Joined tournament successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
