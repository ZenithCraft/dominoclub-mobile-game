import { v4 as uuidv4 } from 'uuid';
import { prisma } from './prisma.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import type { Server as SocketServer } from 'socket.io';

// Global io reference set by the socket bootstrap
let _io: SocketServer | null = null;
export function setTournamentIo(io: SocketServer) { _io = io; }

function emitToUser(userId: string, event: string, data: unknown) {
  _io?.to(`user:${userId}`).emit(event, data);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivePlayer {
  userId: string;
  tournamentId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Start tournament: create Round 1 games ───────────────────────────────────

export async function startTournament(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'FULL' && tournament.status !== 'OPEN') {
    throw new Error(`Tournament cannot be started (status: ${tournament.status})`);
  }
  if (tournament.players.length < 2) {
    throw new Error('Tournament requires at least 2 players');
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'IN_PROGRESS', current_round: 1 },
  });

  const playerIds = shuffle(tournament.players.map((p) => p.userId));
  await createRoundGames(tournament, playerIds, 1);

  // Notify each player of their game
  const round1Games = await prisma.game.findMany({
    where: { tournamentId, tournament_round: 1 },
    include: { players: { select: { userId: true } } },
  });
  for (const game of round1Games) {
    for (const gp of game.players) {
      emitToUser(gp.userId, 'tournament:started', {
        tournamentId,
        gameId: game.id,
        round: 1,
        totalRounds: Math.ceil(Math.log2(tournament.players.length)),
      });
    }
  }

  logger.info('[Tournament] Started', { tournamentId, players: playerIds.length, round: 1 });
}

// ─── Cancel tournament and refund all players ─────────────────────────────────

export async function cancelAndRefundTournament(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { select: { userId: true } } },
  });

  if (!tournament || !['OPEN', 'FULL'].includes(tournament.status)) return;

  // Refund entry fee to each registered player
  for (const { userId } of tournament.players) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) continue;
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
          description: `Reembolso — torneio "${tournament.name}" cancelado`,
        },
      }),
    ]);
    emitToUser(userId, 'tournament:cancelled', {
      tournamentId,
      name: tournament.name,
      refundAmount: tournament.entry_fee,
      reason: 'Jogadores insuficientes',
    });
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'CANCELLED', finished_at: new Date() },
  });

  logger.info('[Tournament] Cancelled and refunded', { tournamentId, players: tournament.players.length });
}

export async function emergencyCancelTournament(tournamentId: string, reason: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { select: { userId: true, eliminated_at: true } } },
  });

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status === 'FINISHED' || tournament.status === 'CANCELLED') {
    throw new Error(`Tournament cannot be cancelled (status: ${tournament.status})`);
  }

  const activeUserIds = tournament.players.filter((p) => !p.eliminated_at).map((p) => p.userId);
  const wallets = await prisma.wallet.findMany({
    where: { userId: { in: activeUserIds } },
    select: { id: true, userId: true },
  });
  const walletByUserId = new Map(wallets.map((w) => [w.userId, w]));

  for (const userId of activeUserIds) {
    const wallet = walletByUserId.get(userId);
    if (!wallet) continue;
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
          description: `Reembolso — torneio "${tournament.name}" cancelado (${reason})`,
        },
      }),
    ]);
  }

  await prisma.game.updateMany({
    where: {
      tournamentId,
      status: { in: ['WAITING', 'PLAYING'] },
    },
    data: {
      status: 'CANCELLED',
      finished_at: new Date(),
    },
  });

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'CANCELLED', finished_at: new Date() },
  });

  for (const p of tournament.players) {
    emitToUser(p.userId, 'tournament:cancelled', {
      tournamentId,
      name: tournament.name,
      refundAmount: activeUserIds.includes(p.userId) ? tournament.entry_fee : 0,
      reason,
    });
  }

  logger.info('[Tournament] Emergency cancelled', { tournamentId, activeRefunds: activeUserIds.length, reason });
}

// ─── Advance bracket after a game finishes ────────────────────────────────────

export async function advanceTournamentBracket(
  tournamentId: string,
  finishedGameId: string,
  winnerId: string | undefined,
  winnerTeam: number | undefined
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: true },
  });

  if (!tournament || tournament.status !== 'IN_PROGRESS') return;

  const finishedGame = await prisma.game.findUnique({
    where: { id: finishedGameId },
    include: { players: true },
  });

  if (!finishedGame || finishedGame.tournament_round !== tournament.current_round) return;

  // Eliminate loser(s)
  const loserIds = finishedGame.players
    .filter((p) => !p.is_bot && p.userId !== winnerId)
    .map((p) => p.userId);

  // Count total registered players for position calculation
  const totalPlayers = tournament.players.length;

  if (loserIds.length > 0) {
    const remainingBefore = await prisma.tournamentPlayer.count({
      where: { tournamentId, eliminated_at: null },
    });
    const finalPosition = remainingBefore; // losers finish at current remaining count
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId, userId: { in: loserIds } },
      data: { eliminated_at: new Date(), final_position: finalPosition },
    });
    for (const userId of loserIds) {
      emitToUser(userId, 'tournament:eliminated', {
        tournamentId,
        name: tournament.name,
        finalPosition,
        totalPlayers,
        prize: 0, // prizes only for top finishers; expand here for multi-prize
      });
    }
    logger.info('[Tournament] Eliminated players', { tournamentId, loserIds });
  }

  // Check if all games in this round are finished
  const roundGames = await prisma.game.findMany({
    where: { tournamentId, tournament_round: tournament.current_round },
    select: { id: true, status: true },
  });

  const allDone = roundGames.every((g) => g.status === 'FINISHED' || g.status === 'CANCELLED' || g.status === 'ABANDONED');
  if (!allDone) {
    logger.debug('[Tournament] Round not complete yet', { tournamentId, round: tournament.current_round });
    return;
  }

  // Get remaining active players
  const active = await prisma.tournamentPlayer.findMany({
    where: { tournamentId, eliminated_at: null },
    select: { userId: true, tournamentId: true },
  });

  if (active.length === 0) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'CANCELLED', finished_at: new Date() },
    });
    return;
  }

  if (active.length === 1) {
    await finishTournament(tournament, active[0].userId);
    return;
  }

  // Advance to next round
  const nextRound = tournament.current_round + 1;
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { current_round: nextRound },
  });

  const playerIds = shuffle(active.map((p) => p.userId));
  await createRoundGames(tournament, playerIds, nextRound);

  // Notify advancing players of their next game
  const nextGames = await prisma.game.findMany({
    where: { tournamentId, tournament_round: nextRound },
    include: { players: { select: { userId: true } } },
  });
  const totalRounds = Math.ceil(Math.log2(totalPlayers));
  for (const game of nextGames) {
    for (const gp of game.players) {
      emitToUser(gp.userId, 'tournament:next_game', {
        tournamentId,
        gameId: game.id,
        round: nextRound,
        totalRounds,
      });
    }
  }

  logger.info('[Tournament] Advanced to round', { tournamentId, nextRound, players: playerIds.length });
}

// ─── Create all games for a given round ──────────────────────────────────────

async function createRoundGames(
  tournament: { id: string; mode: string; variant: string; prize_pool: number; entry_fee: number },
  playerIds: string[],
  round: number
): Promise<void> {
  const is2v2 = tournament.mode === 'TOURNAMENT_2V2';
  const groupSize = is2v2 ? 4 : 2;

  for (let i = 0; i < playerIds.length; i += groupSize) {
    const group = playerIds.slice(i, i + groupSize);

    // Odd player out — give them a bye (auto-advance, no game needed)
    if (group.length < groupSize) {
      logger.info('[Tournament] Player gets bye', { tournamentId: tournament.id, userId: group[0], round });
      continue;
    }

    const gameId = uuidv4();
    // Tournament games use 0 bet — prize comes from the prize pool
    await prisma.game.create({
      data: {
        id: gameId,
        mode: tournament.mode as any,
        variant: tournament.variant as any,
        status: 'WAITING',
        bet_amount: 0,
        prize_pool: 0, // distributed at tournament end, not per-game
        house_fee: 0,
        tournamentId: tournament.id,
        tournament_round: round,
        players: {
          create: group.map((userId, idx) => ({
            userId,
            team: is2v2 ? (idx < 2 ? 1 : 2) : idx + 1,
            seat: idx,
          })),
        },
      },
    });

    logger.info('[Tournament] Created round game', { tournamentId: tournament.id, gameId, round, players: group });
  }
}

// ─── Finish tournament — crown winner and pay out ────────────────────────────

async function finishTournament(
  tournament: { id: string; prize_pool: number },
  winnerId: string
): Promise<void> {
  // Distribute prize pool to winner's wallet
  const wallet = await prisma.wallet.findUnique({ where: { userId: winnerId } });

  if (wallet) {
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { real_balance: { increment: tournament.prize_pool } },
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'WIN',
          amount: tournament.prize_pool,
          status: 'COMPLETED',
          description: `Tournament prize — winner`,
        },
      }),
    ]);
  }

  // Mark winner's TournamentPlayer record
  await prisma.tournamentPlayer.updateMany({
    where: { tournamentId: tournament.id, userId: winnerId },
    data: { final_position: 1, prize_won: tournament.prize_pool },
  });

  // Close tournament
  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: 'FINISHED', finished_at: new Date() },
  });

  // Notify winner
  emitToUser(winnerId, 'tournament:champion', {
    tournamentId: tournament.id,
    prize: tournament.prize_pool,
  });

  logger.info('[Tournament] Finished', { tournamentId: tournament.id, winnerId, prize: tournament.prize_pool });
}

// ─── Create tournament (admin / system) ──────────────────────────────────────

export async function createTournament(data: {
  name: string;
  mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2';
  variant?: 'CARROCA' | 'L_E_L' | 'CRUZADA';
  entryFee: number;
  maxPlayers: number;
  startsAt: Date;
}) {
  return prisma.tournament.create({
    data: {
      name: data.name,
      mode: data.mode,
      variant: data.variant || 'CARROCA',
      entry_fee: data.entryFee,
      max_players: data.maxPlayers,
      starts_at: data.startsAt,
    },
  });
}
