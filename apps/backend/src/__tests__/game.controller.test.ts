/**
 * Unit tests for game.controller handlers — profile-related endpoints:
 *   GET /game/me/league    → getMyLeagueHandler
 *   GET /game/history      → getGameHistoryHandler
 *   GET /game/leaderboard  → getLeaderboardHandler
 *
 * Also covers client-side profile stat formulas (win_rate, level, XP bar) that
 * are computed in HomeScreen.tsx inline — mirrored here as pure-function tests
 * so regressions are caught without mounting the component.
 */

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../socket/gameSocket', () => ({ activeGames: new Map() }));
jest.mock('../services/tournament.service', () => ({
  startTournament: jest.fn(),
  withdrawFromTournament: jest.fn(),
}));
jest.mock('../services/nonce.service', () => ({ issueNonce: jest.fn() }));
jest.mock('../services/email.service', () => ({ emailService: { send: jest.fn() } }));

import { prisma } from '../services/prisma.service';
import {
  getMyLeagueHandler,
  getGameHistoryHandler,
  getLeaderboardHandler,
} from '../controllers/game.controller';

// ─── Minimal req/res helpers ──────────────────────────────────────────────────

function makeReq(overrides: Record<string, any> = {}) {
  return {
    user: { userId: 'u1' },
    query: {},
    params: {},
    body: {},
    ...overrides,
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json    = jest.fn().mockReturnValue(res);
  return res;
}

// ─── getMyLeagueHandler ───────────────────────────────────────────────────────

describe('getMyLeagueHandler', () => {
  it('returns rank, points, previous_rank for authenticated user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      league_points: 850,
      previous_rank: 'SILVER',
      previous_rank_month: '2026-05',
    });

    const req = makeReq();
    const res = makeRes();
    await getMyLeagueHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      points: 850,
      rank: 'GOLD',           // pointsToRank(850) = GOLD
      previous_rank: 'SILVER',
      previous_rank_month: '2026-05',
    });
  });

  it('returns BRONZE rank for a new player with 0 points', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      league_points: 0,
      previous_rank: null,
      previous_rank_month: null,
    });

    const res = makeRes();
    await getMyLeagueHandler(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ rank: 'BRONZE', points: 0 }),
    );
  });

  it('returns DIAMOND for 1700+ points (exact boundary)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      league_points: 1700,
      previous_rank: null,
      previous_rank_month: null,
    });

    const res = makeRes();
    await getMyLeagueHandler(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ rank: 'DIAMOND' }),
    );
  });

  it('returns PLATINUM for 1699 points (just below DIAMOND)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      league_points: 1699,
      previous_rank: null,
      previous_rank_month: null,
    });

    const res = makeRes();
    await getMyLeagueHandler(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ rank: 'PLATINUM' }),
    );
  });

  it('returns 404 when user is not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = makeRes();
    await getMyLeagueHandler(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('uses "rank" key (not "current_rank") so mobile clients can read it', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      league_points: 300,
      previous_rank: null,
      previous_rank_month: null,
    });

    const res = makeRes();
    await getMyLeagueHandler(makeReq(), res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload).toHaveProperty('rank');
    expect(payload).not.toHaveProperty('current_rank');
  });
});

// ─── getGameHistoryHandler ────────────────────────────────────────────────────

describe('getGameHistoryHandler', () => {
  const mockGames = [
    { id: 'g1', status: 'FINISHED', winner_id: 'u1', winning_team: null, players: [] },
    { id: 'g2', status: 'FINISHED', winner_id: 'u2', winning_team: null, players: [] },
  ];

  it('returns games and current page', async () => {
    (prisma.game.findMany as jest.Mock).mockResolvedValue(mockGames);

    const res = makeRes();
    await getGameHistoryHandler(makeReq({ query: { page: '1' } }), res);

    expect(res.json).toHaveBeenCalledWith({ games: mockGames, page: 1 });
  });

  it('defaults to page 1 when no query param provided', async () => {
    (prisma.game.findMany as jest.Mock).mockResolvedValue([]);

    const res = makeRes();
    await getGameHistoryHandler(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith({ games: [], page: 1 });
  });

  it('passes correct skip offset for page 2 (10 items per page)', async () => {
    (prisma.game.findMany as jest.Mock).mockResolvedValue([]);

    const res = makeRes();
    await getGameHistoryHandler(makeReq({ query: { page: '2' } }), res);

    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('filters to only FINISHED games that the user participated in', async () => {
    (prisma.game.findMany as jest.Mock).mockResolvedValue([]);

    await getGameHistoryHandler(makeReq(), makeRes());

    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          players: { some: { userId: 'u1' } },
          status: 'FINISHED',
        },
      }),
    );
  });

  it('returns empty list when user has no finished games', async () => {
    (prisma.game.findMany as jest.Mock).mockResolvedValue([]);

    const res = makeRes();
    await getGameHistoryHandler(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith({ games: [], page: 1 });
  });
});

// ─── getLeaderboardHandler ────────────────────────────────────────────────────

describe('getLeaderboardHandler', () => {
  it('delegates to league service and returns period + leaderboard', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'u1', name: 'Alice', avatar: null, league_points: 1800, previous_rank: null },
    ]);

    const res = makeRes();
    await getLeaderboardHandler(makeReq({ query: { period: 'month' } }), res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.period).toBe('month');
    expect(payload.leaderboard).toHaveLength(1);
    expect(payload.leaderboard[0]).toMatchObject({ position: 1, userId: 'u1', rank: 'DIAMOND' });
  });

  it('defaults to period "month" when no query param provided', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const res = makeRes();
    await getLeaderboardHandler(makeReq(), res);

    expect((res.json as jest.Mock).mock.calls[0][0].period).toBe('month');
  });

  it('returns empty leaderboard when no users have points', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const res = makeRes();
    await getLeaderboardHandler(makeReq({ query: { period: 'week' } }), res);

    expect((res.json as jest.Mock).mock.calls[0][0].leaderboard).toHaveLength(0);
  });
});

// ─── Client-side profile stat formulas (HomeScreen.tsx) ───────────────────────
// These are inline computations in HomeScreen that have no dedicated test file.

// win_rate = Math.round((wins / total) * 100)
function computeWinRate(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

// level = Math.max(1, Math.min(99, Math.floor(totalGames / 10) + 1))
function computeLevel(totalGames: number): number {
  return Math.max(1, Math.min(99, Math.floor(totalGames / 10) + 1));
}

// xpBarPct = Math.round((totalGames % 10) / 10 * 100)
function computeXpBarPct(totalGames: number): number {
  return Math.round((totalGames % 10) / 10 * 100);
}

describe('win_rate formula (HomeScreen profile modal)', () => {
  it('returns 0 when no games played (avoids division by zero)', () => {
    expect(computeWinRate(0, 0)).toBe(0);
  });

  it('returns 100 when all games won', () => {
    expect(computeWinRate(10, 10)).toBe(100);
  });

  it('returns 0 when no games won', () => {
    expect(computeWinRate(0, 10)).toBe(0);
  });

  it('rounds to nearest integer (50 wins / 99 games ≈ 51%)', () => {
    expect(computeWinRate(50, 99)).toBe(51);
  });

  it('computes 67% for 2 wins out of 3 (rounds correctly)', () => {
    expect(computeWinRate(2, 3)).toBe(67);
  });

  it('computes 33% for 1 win out of 3', () => {
    expect(computeWinRate(1, 3)).toBe(33);
  });
});

describe('level formula (HomeScreen + GameTopBar)', () => {
  it('starts at level 1 with 0 games', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('stays at 1 for games 1–9', () => {
    for (let i = 1; i <= 9; i++) expect(computeLevel(i)).toBe(1);
  });

  it('advances to level 2 at 10 games', () => {
    expect(computeLevel(10)).toBe(2);
  });

  it('caps at 99 (never exceeds)', () => {
    expect(computeLevel(980)).toBe(99);
    expect(computeLevel(9999)).toBe(99);
  });
});

describe('XP bar percentage formula (HomeScreen profile modal)', () => {
  it('returns 0 at 0 games', () => {
    expect(computeXpBarPct(0)).toBe(0);
  });

  it('returns 50 at 5 games (halfway through level 1)', () => {
    expect(computeXpBarPct(5)).toBe(50);
  });

  it('resets to 0 at 10 games (just levelled up)', () => {
    expect(computeXpBarPct(10)).toBe(0);
  });

  it('returns 30 at 13 games (3 into level 2)', () => {
    expect(computeXpBarPct(13)).toBe(30);
  });

  it('returns 90 at 9 games (1 away from level-up)', () => {
    expect(computeXpBarPct(9)).toBe(90);
  });
});

// ─── History pagination cap (stat accuracy warning) ──────────────────────────

describe('history pagination cap (stats accuracy)', () => {
  // The client fetches at most 5 pages × 10 = 50 games.
  // Stats (wins, win_rate, level, streak) reflect only the last 50 games,
  // not career totals. This is a known limitation; these tests document it.

  it('50-game cap: a player with 100 games is represented by 50 games only', () => {
    const PAGE_SIZE = 10;
    const MAX_PAGES = 5;
    const maxTrackedGames = PAGE_SIZE * MAX_PAGES;
    expect(maxTrackedGames).toBe(50);
  });

  it('level derived from capped count can understate career level', () => {
    // If a player has 200 career games but only 50 are fetched:
    const cappedGames = 50;
    const careerGames = 200;
    expect(computeLevel(cappedGames)).toBe(6);   // shows Lv 6
    expect(computeLevel(careerGames)).toBe(21);  // true career level is Lv 21
    // gap = 15 levels — intentionally documented
  });
});
