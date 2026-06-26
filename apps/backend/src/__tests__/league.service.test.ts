jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../services/prisma.service';
import {
  pointsToRank,
  awardMatchPoints,
  awardTournamentPoints,
  monthlyLeagueReset,
  getLeaderboard,
} from '../services/league.service';

// ─── pointsToRank ─────────────────────────────────────────────────────────────

describe('pointsToRank', () => {
  const cases: [number, string][] = [
    [2000, 'DIAMOND'],
    [1700, 'DIAMOND'],  // exact lower bound
    [1699, 'PLATINUM'],
    [1200, 'PLATINUM'], // exact lower bound
    [1199, 'GOLD'],
    [700,  'GOLD'],     // exact lower bound
    [699,  'SILVER'],
    [200,  'SILVER'],   // exact lower bound
    [199,  'BRONZE'],
    [1,    'BRONZE'],
    [0,    'BRONZE'],   // minimum
  ];

  test.each(cases)('pointsToRank(%i) → %s', (points, expectedRank) => {
    expect(pointsToRank(points)).toBe(expectedRank);
  });
});

// ─── awardMatchPoints ─────────────────────────────────────────────────────────

describe('awardMatchPoints', () => {
  it('skips point award when bet is below R$5', async () => {
    await awardMatchPoints('u1', 4.99, true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('awards 15 points (10 played + 5 win) to the winner', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    await awardMatchPoints('u1', 5, true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { league_points: { increment: 15 } },
    });
  });

  it('awards 10 points (10 played only) to the loser', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    await awardMatchPoints('u1', 10, false);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { league_points: { increment: 10 } },
    });
  });

  it('awards points for bets exactly at R$5 (boundary)', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});
    await awardMatchPoints('u1', 5, false);
    expect(prisma.user.update).toHaveBeenCalled();
  });
});

// ─── awardTournamentPoints ────────────────────────────────────────────────────

describe('awardTournamentPoints', () => {
  it('awards 25 points (15 played + 10 win) to the tournament winner', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    await awardTournamentPoints('u1', true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { league_points: { increment: 25 } },
    });
  });

  it('awards 15 points (played only) to a non-winner tournament participant', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({});

    await awardTournamentPoints('u1', false);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { league_points: { increment: 15 } },
    });
  });
});

// ─── monthlyLeagueReset ───────────────────────────────────────────────────────

describe('monthlyLeagueReset', () => {
  it('returns 0 when no users have points', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const count = await monthlyLeagueReset();
    expect(count).toBe(0);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('snapshots previous_rank and resets league_points to 0 for each user', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'u1', league_points: 800 },  // GOLD
      { id: 'u2', league_points: 1500 }, // PLATINUM
    ]);
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    const count = await monthlyLeagueReset();

    expect(count).toBe(2);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          previous_rank: 'GOLD',
          league_points: 0,
          previous_rank_month: expect.stringMatching(/^\d{4}-\d{2}$/),
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u2' },
        data: expect.objectContaining({ previous_rank: 'PLATINUM', league_points: 0 }),
      }),
    );
  });

  it('stores previous_rank_month in YYYY-MM format', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'u1', league_points: 300 },
    ]);
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    await monthlyLeagueReset();

    const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.previous_rank_month).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ─── getLeaderboard ───────────────────────────────────────────────────────────

describe('getLeaderboard', () => {
  const mockUsers = [
    { id: 'u1', name: 'Alice', avatar: null, league_points: 1800, previous_rank: 'PLATINUM' },
    { id: 'u2', name: 'Bob',   avatar: null, league_points: 900,  previous_rank: 'GOLD' },
    { id: 'u3', name: null,    avatar: null, league_points: 50,   previous_rank: null },
  ];

  it('returns users sorted by points with position, rank, and previousRank', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce(mockUsers);

    const leaderboard = await getLeaderboard('month');

    expect(leaderboard).toHaveLength(3);
    expect(leaderboard[0]).toMatchObject({ position: 1, userId: 'u1', rank: 'DIAMOND', points: 1800 });
    expect(leaderboard[1]).toMatchObject({ position: 2, userId: 'u2', rank: 'GOLD', previousRank: 'GOLD' });
    expect(leaderboard[2]).toMatchObject({ position: 3, userId: 'u3', name: 'Jogador' }); // null name fallback
  });

  it('returns empty array when no users have points', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    const leaderboard = await getLeaderboard('week');
    expect(leaderboard).toHaveLength(0);
  });

  it('computes rank via pointsToRank for each entry', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'u1', name: 'Alice', avatar: null, league_points: 1700, previous_rank: null },
    ]);

    const leaderboard = await getLeaderboard('month');
    expect(leaderboard[0].rank).toBe('DIAMOND'); // 1700 = exact DIAMOND boundary
  });

  it('queries users ordered by league_points desc and limits to 100', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await getLeaderboard('month');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { league_points: 'desc' },
        take: 100,
      }),
    );
  });
});
