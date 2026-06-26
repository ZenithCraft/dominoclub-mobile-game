import { v4 as uuidv4 } from 'uuid';
import { prisma } from './prisma.service';
import { logger } from '../utils/logger';
import type { Server as SocketServer } from 'socket.io';
import { awardTournamentPoints } from './league.service';

// Global io reference set by the socket bootstrap
let _io: SocketServer | null = null;
export function setTournamentIo(io: SocketServer) { _io = io; }

function emitToUser(userId: string, event: string, data: unknown) {
  _io?.to(`user:${userId}`).emit(event, data);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivePlayer {
  userId: string;
  seed: number; // 1 = best (lowest number = highest league_points)
  isBot?: boolean;
}

// Runtime registry: tournamentId → Set of bot userIds (populated at start time, lost on restart)
const tournamentBotRegistry = new Map<string, Set<string>>();

// ─── Bracket helpers ──────────────────────────────────────────────────────────

/**
 * Assign seeds to all registered players based on current league_points.
 * Seed 1 = highest-ranked player. Returns sorted ActivePlayer[].
 */
async function assignSeeds(tournamentId: string, playerIds: string[], botUserIds?: Set<string>): Promise<ActivePlayer[]> {
  const users = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, league_points: true },
  });

  // Sort DESC by league_points; ties broken by original join order
  const sorted = playerIds
    .map((id) => ({ userId: id, points: users.find((u) => u.id === id)?.league_points ?? 0 }))
    .sort((a, b) => b.points - a.points);

  // Persist seeds
  await Promise.all(
    sorted.map((p, idx) =>
      prisma.tournamentPlayer.updateMany({
        where: { tournamentId, userId: p.userId },
        data: { seed: idx + 1 },
      }),
    ),
  );

  return sorted.map((p, idx) => ({
    userId: p.userId,
    seed: idx + 1,
    isBot: botUserIds?.has(p.userId) ?? false,
  }));
}

/**
 * Mirror-bracket pairing for 1v1:
 *   Best vs worst, 2nd-best vs 2nd-worst, …
 * If N is odd the top seed receives a bye (they earned it via ranking).
 */
function buildMirrorPairs(sorted: ActivePlayer[]): {
  pairs: [ActivePlayer, ActivePlayer][];
  byePlayers: ActivePlayer[];
} {
  const byePlayers: ActivePlayer[] = [];
  let playing = sorted;

  if (sorted.length % 2 === 1) {
    byePlayers.push(sorted[0]); // top seed gets the bye
    playing = sorted.slice(1);
  }

  const n = playing.length; // always even after removing bye
  const pairs: [ActivePlayer, ActivePlayer][] = [];
  for (let i = 0; i < n / 2; i++) {
    pairs.push([playing[i], playing[n - 1 - i]]);
  }
  return { pairs, byePlayers };
}

/**
 * Mirror-bracket grouping for 2v2 (groups of 4):
 *   If N % 4 !== 0, top seeds get byes.
 *   Within each quad: team 1 = (seed_best, seed_worst),
 *                     team 2 = (seed_2nd, seed_3rd) — keeps teams balanced.
 */
function buildMirrorQuads(sorted: ActivePlayer[]): {
  quads: [ActivePlayer, ActivePlayer, ActivePlayer, ActivePlayer][];
  byePlayers: ActivePlayer[];
} {
  const leftover = sorted.length % 4;
  const byePlayers = leftover > 0 ? sorted.slice(0, leftover) : [];
  const playing = leftover > 0 ? sorted.slice(leftover) : sorted;

  const quads: [ActivePlayer, ActivePlayer, ActivePlayer, ActivePlayer][] = [];
  for (let i = 0; i < playing.length; i += 4) {
    const [p1, p2, p3, p4] = playing.slice(i, i + 4);
    quads.push([p1, p4, p2, p3]); // team1=(best,worst) vs team2=(2nd,3rd)
  }
  return { quads, byePlayers };
}

function computeTotalRounds(playerCount: number, mode: string): number {
  const n = Math.max(playerCount, 2);
  // For 2v2 each match consumes 4 players; effective units = n/2 (teams of 2)
  return mode === 'TOURNAMENT_2V2'
    ? Math.ceil(Math.log2(Math.max(n / 2, 1)))
    : Math.ceil(Math.log2(n));
}

// ─── Start tournament: seed players and create Round 1 games ─────────────────

export async function startTournament(tournamentId: string, botUserIds?: Set<string>): Promise<void> {
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

  if (botUserIds && botUserIds.size > 0) {
    tournamentBotRegistry.set(tournamentId, botUserIds);
  }

  const playerIds = tournament.players.map((p) => p.userId);
  const seededPlayers = await assignSeeds(tournamentId, playerIds, botUserIds);

  const { byeUserIds, gameUserMap } = await createRoundGames(
    {
      id: tournament.id,
      mode: tournament.mode,
      variant: tournament.variant,
      prize_pool: Number(tournament.prize_pool),
      entry_fee: Number(tournament.entry_fee),
    },
    seededPlayers,
    1,
  );

  const totalRounds = computeTotalRounds(tournament.players.length, tournament.mode);

  // Notify players who have a Round 1 game
  for (const [gameId, userIds] of gameUserMap) {
    for (const userId of userIds) {
      emitToUser(userId, 'tournament:started', { tournamentId, gameId, round: 1, totalRounds });
    }
  }

  // Notify bye players so they know they advanced without playing
  for (const userId of byeUserIds) {
    emitToUser(userId, 'tournament:bye', { tournamentId, round: 1, totalRounds });
  }

  logger.info('[Tournament] Started', { tournamentId, players: playerIds.length, round: 1 });

  // Auto-resolve any round-1 games where all participants are bots
  await autoResolveBotGames(tournamentId, gameUserMap, botUserIds ?? tournamentBotRegistry.get(tournamentId));
}

// ─── Create games for a round using seeded mirror bracket ────────────────────

async function createRoundGames(
  tournament: { id: string; mode: string; variant: string; prize_pool: number; entry_fee: number },
  activePlayers: ActivePlayer[],
  round: number,
): Promise<{ byeUserIds: string[]; gameUserMap: Map<string, string[]> }> {
  const is2v2 = tournament.mode === 'TOURNAMENT_2V2';
  const byeUserIds: string[] = [];
  const gameUserMap = new Map<string, string[]>();

  // Always sort by seed so the bracket is deterministic
  const sorted = [...activePlayers].sort((a, b) => a.seed - b.seed);

  if (is2v2) {
    const { quads, byePlayers } = buildMirrorQuads(sorted);
    byeUserIds.push(...byePlayers.map((p) => p.userId));

    for (const [p1, p4, p2, p3] of quads) {
      const gameId = uuidv4();
      await prisma.game.create({
        data: {
          id: gameId,
          mode: tournament.mode as any,
          variant: tournament.variant as any,
          status: 'WAITING',
          bet_amount: 0,
          prize_pool: 0,
          house_fee: 0,
          tournamentId: tournament.id,
          tournament_round: round,
          players: {
            create: [
              { userId: p1.userId, team: 1, seat: 0, is_bot: p1.isBot ?? false },
              { userId: p4.userId, team: 1, seat: 2, is_bot: p4.isBot ?? false },
              { userId: p2.userId, team: 2, seat: 1, is_bot: p2.isBot ?? false },
              { userId: p3.userId, team: 2, seat: 3, is_bot: p3.isBot ?? false },
            ],
          },
        },
      });
      const ids = [p1.userId, p4.userId, p2.userId, p3.userId];
      gameUserMap.set(gameId, ids);
      logger.info('[Tournament] Created 2v2 game', {
        tournamentId: tournament.id, gameId, round,
        team1: [p1.userId, p4.userId], team2: [p2.userId, p3.userId],
      });
    }
  } else {
    const { pairs, byePlayers } = buildMirrorPairs(sorted);
    byeUserIds.push(...byePlayers.map((p) => p.userId));

    for (const [p1, p2] of pairs) {
      const gameId = uuidv4();
      await prisma.game.create({
        data: {
          id: gameId,
          mode: tournament.mode as any,
          variant: tournament.variant as any,
          status: 'WAITING',
          bet_amount: 0,
          prize_pool: 0,
          house_fee: 0,
          tournamentId: tournament.id,
          tournament_round: round,
          players: {
            create: [
              { userId: p1.userId, team: 1, seat: 0, is_bot: p1.isBot ?? false },
              { userId: p2.userId, team: 2, seat: 1, is_bot: p2.isBot ?? false },
            ],
          },
        },
      });
      gameUserMap.set(gameId, [p1.userId, p2.userId]);
      logger.info('[Tournament] Created 1v1 game', {
        tournamentId: tournament.id, gameId, round, players: [p1.userId, p2.userId],
      });
    }
  }

  return { byeUserIds, gameUserMap };
}

// ─── Auto-resolve games where ALL players are bots ───────────────────────────

async function autoResolveBotGames(
  tournamentId: string,
  gameUserMap: Map<string, string[]>,
  botRegistry: Set<string> | undefined,
): Promise<void> {
  if (!botRegistry || botRegistry.size === 0) return;

  for (const [gameId, userIds] of gameUserMap) {
    const allBots = userIds.length > 0 && userIds.every((uid) => botRegistry.has(uid));
    if (!allBots) continue;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { select: { userId: true, team: true } } },
    });
    if (!game || game.status !== 'WAITING') continue;

    const team1Player = game.players.find((p) => p.team === 1);
    const winnerId = team1Player?.userId;

    await prisma.game.update({
      where: { id: gameId },
      data: { status: 'FINISHED', finished_at: new Date(), winning_team: 1, winner_id: winnerId ?? null },
    });

    logger.info('[Tournament] Auto-resolved bot-vs-bot game', { tournamentId, gameId, winnerId });

    await advanceTournamentBracket(tournamentId, gameId, winnerId, 1);
  }
}

// ─── Cancel tournament and refund all players (pre-start) ────────────────────

export async function cancelAndRefundTournament(tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { select: { userId: true } } },
  });

  if (!tournament || !['OPEN', 'FULL'].includes(tournament.status)) return;

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
      refundAmount: Number(tournament.entry_fee),
      reason: 'Jogadores insuficientes',
    });
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'CANCELLED', finished_at: new Date() },
  });

  logger.info('[Tournament] Cancelled and refunded', { tournamentId, players: tournament.players.length });
}

// ─── Emergency cancel (can run during IN_PROGRESS) ───────────────────────────

export async function emergencyCancelTournament(tournamentId: string, reason: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { select: { userId: true, eliminated_at: true } } },
  });

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status === 'FINISHED' || tournament.status === 'CANCELLED') {
    throw new Error(`Tournament cannot be cancelled (status: ${tournament.status})`);
  }

  const activeUserIds = tournament.players
    .filter((p) => !p.eliminated_at)
    .map((p) => p.userId);

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
    where: { tournamentId, status: { in: ['WAITING', 'PLAYING'] } },
    data: { status: 'CANCELLED', finished_at: new Date() },
  });

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'CANCELLED', finished_at: new Date() },
  });

  for (const p of tournament.players) {
    emitToUser(p.userId, 'tournament:cancelled', {
      tournamentId,
      name: tournament.name,
      refundAmount: activeUserIds.includes(p.userId) ? Number(tournament.entry_fee) : 0,
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
  winnerTeam: number | undefined,
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

  // ── Eliminate losers ───────────────────────────────────────────────────────
  // Skip for CANCELLED games: the withdrawing player is already marked eliminated_at
  // by withdrawFromTournament(); their opponent advances naturally.
  if (finishedGame.status !== 'CANCELLED') {
    const loserIds = finishedGame.players
      .filter((p) => {
        // 2v2: use winnerTeam to protect both teammates
        if (winnerTeam != null) return p.team !== winnerTeam;
        // 1v1 or forfeit: use winnerId
        return p.userId !== winnerId;
      })
      .map((p) => p.userId);

    if (loserIds.length > 0) {
      const totalPlayers = tournament.players.length;
      const remainingBefore = await prisma.tournamentPlayer.count({
        where: { tournamentId, eliminated_at: null },
      });
      const finalPosition = remainingBefore;

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
          prize: 0,
        });
      }
      logger.info('[Tournament] Eliminated players', { tournamentId, loserIds });
    }
  }

  // ── Check if all games in this round are done ──────────────────────────────
  const roundGames = await prisma.game.findMany({
    where: { tournamentId, tournament_round: tournament.current_round },
    select: { id: true, status: true },
  });

  const allDone = roundGames.every(
    (g) => g.status === 'FINISHED' || g.status === 'CANCELLED' || g.status === 'ABANDONED',
  );
  if (!allDone) {
    logger.debug('[Tournament] Round not complete yet', { tournamentId, round: tournament.current_round });
    return;
  }

  // ── Fetch survivors ────────────────────────────────────────────────────────
  const active = await prisma.tournamentPlayer.findMany({
    where: { tournamentId, eliminated_at: null },
    select: { userId: true, seed: true },
  });

  if (active.length === 0) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'CANCELLED', finished_at: new Date() },
    });
    return;
  }

  if (active.length === 1) {
    await finishTournament(
      { id: tournament.id, prize_pool: Number(tournament.prize_pool), initial_prize_pool: Number(tournament.initial_prize_pool) },
      active[0].userId,
    );
    return;
  }

  // ── Advance to next round ──────────────────────────────────────────────────
  const nextRound = tournament.current_round + 1;
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { current_round: nextRound },
  });

  // Carry seeds forward (fallback seed = large number for unseeded edge cases)
  const botRegistry = tournamentBotRegistry.get(tournamentId);
  const activePlayers: ActivePlayer[] = active.map((p) => ({
    userId: p.userId,
    seed: p.seed ?? 9999,
    isBot: botRegistry?.has(p.userId) ?? false,
  }));

  const { byeUserIds, gameUserMap } = await createRoundGames(
    {
      id: tournament.id,
      mode: tournament.mode,
      variant: tournament.variant,
      prize_pool: Number(tournament.prize_pool),
      entry_fee: Number(tournament.entry_fee),
    },
    activePlayers,
    nextRound,
  );

  const totalRounds = computeTotalRounds(tournament.players.length, tournament.mode);

  for (const [gameId, userIds] of gameUserMap) {
    for (const userId of userIds) {
      emitToUser(userId, 'tournament:next_game', { tournamentId, gameId, round: nextRound, totalRounds });
    }
  }

  for (const userId of byeUserIds) {
    emitToUser(userId, 'tournament:bye', { tournamentId, round: nextRound, totalRounds });
  }

  logger.info('[Tournament] Advanced to round', { tournamentId, nextRound, players: activePlayers.length });

  // Auto-resolve any next-round games where all participants are bots
  await autoResolveBotGames(tournamentId, gameUserMap, botRegistry);
}

// ─── Player withdrawal between rounds ─────────────────────────────────────────

export async function withdrawFromTournament(
  tournamentId: string,
  userId: string,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, current_round: true },
  });

  if (!tournament || tournament.status !== 'IN_PROGRESS') {
    throw new Error('Tournament is not in progress');
  }

  const player = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId, userId, eliminated_at: null },
  });

  if (!player) throw new Error('Player is not active in this tournament');

  // Mark as withdrawn (sets eliminated_at too so all bracket checks exclude them)
  await prisma.tournamentPlayer.updateMany({
    where: { tournamentId, userId },
    data: { eliminated_at: new Date(), withdrawn_at: new Date() },
  });

  emitToUser(userId, 'tournament:withdrew', { tournamentId });

  // Check for a WAITING game in the current round
  const waitingGame = await prisma.game.findFirst({
    where: {
      tournamentId,
      tournament_round: tournament.current_round,
      status: 'WAITING',
      players: { some: { userId } },
    },
    select: { id: true, players: { select: { userId: true, is_bot: true } } },
  });

  if (waitingGame) {
    // Cancel the game; opponent(s) advance automatically via bracket check
    await prisma.game.update({
      where: { id: waitingGame.id },
      data: { status: 'CANCELLED', finished_at: new Date() },
    });

    const opponents = waitingGame.players
      .filter((p) => p.userId !== userId && !p.is_bot)
      .map((p) => p.userId);

    for (const opponentId of opponents) {
      emitToUser(opponentId, 'tournament:opponent_withdrew', {
        tournamentId,
        round: tournament.current_round,
      });
    }

    // Trigger bracket advancement (CANCELLED game counts as done)
    await advanceTournamentBracket(tournamentId, waitingGame.id, undefined, undefined);
  }

  logger.info('[Tournament] Player withdrew', { tournamentId, userId });
}

// ─── Finish tournament — crown winner and pay out ─────────────────────────────

async function finishTournament(
  tournament: { id: string; prize_pool: number; initial_prize_pool: number },
  winnerId: string,
): Promise<void> {
  // In-person tournaments use admin-set initial_prize_pool; online use accumulated prize_pool
  const prizeAmount = tournament.initial_prize_pool > 0
    ? tournament.initial_prize_pool
    : tournament.prize_pool;

  const wallet = await prisma.wallet.findUnique({ where: { userId: winnerId } });
  if (wallet && prizeAmount > 0) {
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { real_balance: { increment: prizeAmount } },
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'WIN',
          amount: prizeAmount,
          status: 'COMPLETED',
          description: 'Tournament prize — winner',
        },
      }),
    ]);
  }

  await prisma.tournamentPlayer.updateMany({
    where: { tournamentId: tournament.id, userId: winnerId },
    data: { final_position: 1, prize_won: prizeAmount },
  });

  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: 'FINISHED', finished_at: new Date() },
  });

  emitToUser(winnerId, 'tournament:champion', {
    tournamentId: tournament.id,
    prize: prizeAmount,
  });

  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId: tournament.id },
    select: { userId: true },
  });
  for (const p of players) {
    awardTournamentPoints(p.userId, p.userId === winnerId).catch(() => {});
  }

  logger.info('[Tournament] Finished', { tournamentId: tournament.id, winnerId, prize: prizeAmount });
}

// ─── Create tournament (admin / system) ──────────────────────────────────────

export async function createTournament(data: {
  name: string;
  mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2';
  variant?: 'CARROCA' | 'L_E_L' | 'CRUZADA';
  entryFee: number;
  maxPlayers: number;
  startsAt: Date;
  initialPrizePool?: number; // for in-person events with a pre-set prize
}) {
  return prisma.tournament.create({
    data: {
      name: data.name,
      mode: data.mode,
      variant: data.variant || 'CARROCA',
      entry_fee: data.entryFee,
      max_players: data.maxPlayers,
      starts_at: data.startsAt,
      initial_prize_pool: data.initialPrizePool ?? 0,
    },
  });
}
