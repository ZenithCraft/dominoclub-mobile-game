import { prisma } from './prisma.service';
import { logger } from '../utils/logger';

// Point values per spec
const POINTS = {
  NORMAL_MATCH_FINISHED: 10,
  NORMAL_VICTORY: 5,
  TOURNAMENT_PLAYED: 15,
  TOURNAMENT_VICTORY: 10,
};

// Tier thresholds (inclusive lower bound)
const RANK_THRESHOLDS: { rank: string; min: number }[] = [
  { rank: 'DIAMOND',  min: 1700 },
  { rank: 'PLATINUM', min: 1200 },
  { rank: 'GOLD',     min: 700  },
  { rank: 'SILVER',   min: 200  },
  { rank: 'BRONZE',   min: 0    },
];

export function pointsToRank(points: number): string {
  for (const { rank, min } of RANK_THRESHOLDS) {
    if (points >= min) return rank;
  }
  return 'BRONZE';
}

// Only award points for paid lobbies >= R$5
const MIN_BET_FOR_POINTS = 5;

export async function awardMatchPoints(
  userId: string,
  betAmount: number,
  isWinner: boolean,
): Promise<void> {
  if (betAmount < MIN_BET_FOR_POINTS) return;

  const pts = POINTS.NORMAL_MATCH_FINISHED + (isWinner ? POINTS.NORMAL_VICTORY : 0);
  await prisma.user.update({
    where: { id: userId },
    data: { league_points: { increment: pts } },
  });
}

export async function awardTournamentPoints(
  userId: string,
  isWinner: boolean,
): Promise<void> {
  const pts = POINTS.TOURNAMENT_PLAYED + (isWinner ? POINTS.TOURNAMENT_VICTORY : 0);
  await prisma.user.update({
    where: { id: userId },
    data: { league_points: { increment: pts } },
  });
}

// Run at the start of each month to snapshot previous_rank and reset points.
// Called by a cron job or admin endpoint.
export async function monthlyLeagueReset(): Promise<number> {
  const yearMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const users = await prisma.user.findMany({
    where: { league_points: { gt: 0 } },
    select: { id: true, league_points: true },
  });

  let updated = 0;
  for (const u of users) {
    const rank = pointsToRank(u.league_points) as any;
    await prisma.user.update({
      where: { id: u.id },
      data: {
        previous_rank: rank,
        previous_rank_month: yearMonth,
        league_points: 0,
      },
    });
    updated++;
  }

  logger.info('[League] Monthly reset complete', { usersUpdated: updated, month: yearMonth });
  return updated;
}

export async function getLeaderboard(period: 'week' | 'month') {
  // Returns top 100 users sorted by league_points desc
  // For 'week' we'd need a separate weekly points counter; for simplicity
  // we use current league_points for both (weekly sub-period shown is "this week so far").
  const users = await prisma.user.findMany({
    where: { league_points: { gt: 0 } },
    orderBy: { league_points: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      avatar: true,
      league_points: true,
      previous_rank: true,
    },
  });

  return users.map((u, i) => ({
    position: i + 1,
    userId: u.id,
    name: u.name ?? 'Jogador',
    avatar: u.avatar,
    points: u.league_points,
    rank: pointsToRank(u.league_points),
    previousRank: u.previous_rank,
  }));
}
