/**
 * Achievement and level progression logic tests.
 *
 * The achievement/level system is computed entirely on the client from game
 * history data returned by GET /game/history. These tests validate the pure
 * functions that drive that computation.
 *
 * Bugs found and fixed:
 *  1. 2v2 wins were undercounted — only `winner_id` was checked, but for 2v2
 *     games the DB sets `winner_id` to just the player who played the final
 *     tile. The partner on the winning team was never counted. Fix: also check
 *     `winning_team` against the player's team from `players[]`.
 *  2. XP bar was hardcoded at 40% — it never reflected actual progress.
 *     Fix: `(totalGames % 10) / 10 * 100`.
 *  3. League rank badge was hardcoded as "Bronze".
 *     Fix: fetch `/game/me/league` when the profile modal opens.
 */

// ─── Extracted pure logic (mirrors AchievementsScreen.tsx) ───────────────────

type Game = {
  id: string;
  winner_id?: string;
  winnerId?: string;
  winning_team?: number | null;
  tournamentId?: string | null;
  tournament_id?: string | null;
  players?: { userId: string; team: number }[];
};

type Achievement = {
  id: string;
  unlocked: boolean;
  progress?: number;
  target?: number;
};

type MyLeague = {
  points: number;
  rank: string;
  previous_rank: string | null;
  previous_rank_month: string | null;
};

function didWin(g: Game, myId: string): boolean {
  if ((g.winner_id ?? g.winnerId) === myId) return true;
  if (g.winning_team != null && g.players) {
    const myTeam = g.players.find((p) => p.userId === myId)?.team;
    return myTeam != null && myTeam === g.winning_team;
  }
  return false;
}

function computeWinStreak(games: Game[], myId: string): number {
  if (!myId) return 0;
  let streak = 0;
  let best = 0;
  for (const g of games) {
    if (didWin(g, myId)) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }
  return best;
}

function buildAchievements(
  wins: number,
  total: number,
  streak: number,
  tournamentsWon: number,
  league: MyLeague | null,
): Achievement[] {
  const rankOrder = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
  const currentRankIdx = rankOrder.indexOf(league?.rank ?? 'BRONZE');
  const hasReachedRank = (rank: string) =>
    !!league && (
      currentRankIdx >= rankOrder.indexOf(rank) ||
      (league.previous_rank
        ? rankOrder.indexOf(league.previous_rank) >= rankOrder.indexOf(rank)
        : false)
    );

  return [
    { id: 'first_win',        unlocked: wins >= 1,           progress: Math.min(wins, 1),   target: 1   },
    { id: 'ten_wins',         unlocked: wins >= 10,          progress: Math.min(wins, 10),  target: 10  },
    { id: 'fifty_wins',       unlocked: wins >= 50,          progress: Math.min(wins, 50),  target: 50  },
    { id: 'ten_games',        unlocked: total >= 10,         progress: Math.min(total, 10), target: 10  },
    { id: 'fifty_games',      unlocked: total >= 50,         progress: Math.min(total, 50), target: 50  },
    { id: 'streak_3',         unlocked: streak >= 3,         progress: Math.min(streak, 3), target: 3   },
    { id: 'streak_5',         unlocked: streak >= 5,         progress: Math.min(streak, 5), target: 5   },
    { id: 'tournament_champ', unlocked: tournamentsWon >= 1, progress: Math.min(tournamentsWon, 1), target: 1 },
    { id: 'silver_rank',   unlocked: hasReachedRank('SILVER')   },
    { id: 'gold_rank',     unlocked: hasReachedRank('GOLD')     },
    { id: 'platinum_rank', unlocked: hasReachedRank('PLATINUM') },
    { id: 'diamond_rank',  unlocked: hasReachedRank('DIAMOND')  },
  ];
}

function computeLevel(totalGames: number): number {
  return Math.max(1, Math.min(99, Math.floor(totalGames / 10) + 1));
}

function computeXpBarPct(totalGames: number): number {
  return Math.round((totalGames % 10) / 10 * 100);
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<Game> & { id: string }): Game {
  return { ...overrides };
}

const ME = 'user-me';
const OTHER = 'user-other';
const PARTNER = 'user-partner';

// ─── didWin ──────────────────────────────────────────────────────────────────

describe('didWin', () => {
  it('returns true when winner_id matches', () => {
    const g = makeGame({ id: '1', winner_id: ME });
    expect(didWin(g, ME)).toBe(true);
  });

  it('returns true when winnerId (camelCase) matches', () => {
    const g = makeGame({ id: '1', winnerId: ME });
    expect(didWin(g, ME)).toBe(true);
  });

  it('returns false when winner_id is a different user', () => {
    const g = makeGame({ id: '1', winner_id: OTHER });
    expect(didWin(g, ME)).toBe(false);
  });

  it('returns false when no winner fields are set', () => {
    const g = makeGame({ id: '1' });
    expect(didWin(g, ME)).toBe(false);
  });

  // 2v2 — the partner played the final tile so winner_id is their ID, not mine
  it('counts a 2v2 win when the user is on the winning team (winning_team + players)', () => {
    const g = makeGame({
      id: '1',
      winner_id: PARTNER,          // partner played the winning tile
      winning_team: 1,
      players: [
        { userId: ME,      team: 1 },
        { userId: PARTNER, team: 1 },
        { userId: 'opp1',  team: 2 },
        { userId: 'opp2',  team: 2 },
      ],
    });
    expect(didWin(g, ME)).toBe(true);
  });

  it('does not count a 2v2 game as a win when the user is on the losing team', () => {
    const g = makeGame({
      id: '1',
      winner_id: 'opp1',
      winning_team: 2,
      players: [
        { userId: ME,     team: 1 },
        { userId: PARTNER, team: 1 },
        { userId: 'opp1', team: 2 },
        { userId: 'opp2', team: 2 },
      ],
    });
    expect(didWin(g, ME)).toBe(false);
  });

  it('handles a 2v2 game where winning_team is set but players array is missing', () => {
    // No players array — falls back to winner_id check only
    const g = makeGame({ id: '1', winner_id: OTHER, winning_team: 1 });
    expect(didWin(g, ME)).toBe(false);
  });

  it('handles a tied/blocked game with no winner (winning_team null)', () => {
    const g = makeGame({
      id: '1',
      winning_team: null,
      players: [{ userId: ME, team: 1 }, { userId: OTHER, team: 2 }],
    });
    expect(didWin(g, ME)).toBe(false);
  });
});

// ─── computeWinStreak ────────────────────────────────────────────────────────

describe('computeWinStreak', () => {
  it('returns 0 for an empty game list', () => {
    expect(computeWinStreak([], ME)).toBe(0);
  });

  it('returns 0 when myId is empty', () => {
    const g = makeGame({ id: '1', winner_id: ME });
    expect(computeWinStreak([g], '')).toBe(0);
  });

  it('counts a single win as streak 1', () => {
    const g = makeGame({ id: '1', winner_id: ME });
    expect(computeWinStreak([g], ME)).toBe(1);
  });

  it('returns the best consecutive streak, not just current', () => {
    // newest-first order from API: [loss, win, win, win, loss, win, win]
    // best streak = 3 (the middle run)
    const games: Game[] = [
      makeGame({ id: '7', winner_id: OTHER }),
      makeGame({ id: '6', winner_id: ME }),
      makeGame({ id: '5', winner_id: ME }),
      makeGame({ id: '4', winner_id: OTHER }),
      makeGame({ id: '3', winner_id: ME }),
      makeGame({ id: '2', winner_id: ME }),
      makeGame({ id: '1', winner_id: ME }),
    ];
    expect(computeWinStreak(games, ME)).toBe(3);
  });

  it('handles all wins', () => {
    const games = [1, 2, 3, 4, 5].map((i) => makeGame({ id: String(i), winner_id: ME }));
    expect(computeWinStreak(games, ME)).toBe(5);
  });

  it('handles all losses', () => {
    const games = [1, 2, 3].map((i) => makeGame({ id: String(i), winner_id: OTHER }));
    expect(computeWinStreak(games, ME)).toBe(0);
  });

  it('correctly counts 2v2 wins in streak (partner played final tile)', () => {
    const make2v2Win = (id: string, myWin: boolean) => makeGame({
      id,
      winner_id: myWin ? PARTNER : 'opp1',
      winning_team: myWin ? 1 : 2,
      players: [
        { userId: ME,      team: 1 },
        { userId: PARTNER, team: 1 },
        { userId: 'opp1',  team: 2 },
        { userId: 'opp2',  team: 2 },
      ],
    });

    // 3 consecutive 2v2 wins (streak_3 achievement)
    const games = ['3', '2', '1'].map((id) => make2v2Win(id, true));
    expect(computeWinStreak(games, ME)).toBe(3);
  });
});

// ─── buildAchievements ───────────────────────────────────────────────────────

describe('buildAchievements', () => {
  const unlocked = (achs: Achievement[], id: string) =>
    achs.find((a) => a.id === id)!.unlocked;
  const progress = (achs: Achievement[], id: string) =>
    achs.find((a) => a.id === id)!.progress;

  it('all achievements locked for a brand-new player', () => {
    const achs = buildAchievements(0, 0, 0, 0, null);
    expect(achs.every((a) => !a.unlocked)).toBe(true);
  });

  it('unlocks first_win after 1 win', () => {
    const achs = buildAchievements(1, 1, 1, 0, null);
    expect(unlocked(achs, 'first_win')).toBe(true);
    expect(unlocked(achs, 'ten_wins')).toBe(false);
  });

  it('unlocks ten_wins at exactly 10 wins', () => {
    const achs = buildAchievements(10, 10, 0, 0, null);
    expect(unlocked(achs, 'ten_wins')).toBe(true);
    expect(unlocked(achs, 'fifty_wins')).toBe(false);
  });

  it('unlocks fifty_wins at exactly 50 wins', () => {
    const achs = buildAchievements(50, 60, 0, 0, null);
    expect(unlocked(achs, 'fifty_wins')).toBe(true);
  });

  it('unlocks ten_games / fifty_games from total games, not wins', () => {
    const achs = buildAchievements(0, 50, 0, 0, null);
    expect(unlocked(achs, 'ten_games')).toBe(true);
    expect(unlocked(achs, 'fifty_games')).toBe(true);
    expect(unlocked(achs, 'first_win')).toBe(false);
  });

  it('unlocks streak_3 at streak 3, not before', () => {
    expect(unlocked(buildAchievements(3, 3, 2, 0, null), 'streak_3')).toBe(false);
    expect(unlocked(buildAchievements(3, 3, 3, 0, null), 'streak_3')).toBe(true);
  });

  it('unlocks streak_5 at streak 5, not before', () => {
    expect(unlocked(buildAchievements(5, 5, 4, 0, null), 'streak_5')).toBe(false);
    expect(unlocked(buildAchievements(5, 5, 5, 0, null), 'streak_5')).toBe(true);
  });

  it('unlocks tournament_champ after 1 tournament win', () => {
    const achs = buildAchievements(10, 10, 0, 1, null);
    expect(unlocked(achs, 'tournament_champ')).toBe(true);
  });

  it('progress values are capped at their target', () => {
    const achs = buildAchievements(100, 100, 10, 5, null);
    expect(progress(achs, 'first_win')).toBe(1);
    expect(progress(achs, 'ten_wins')).toBe(10);
    expect(progress(achs, 'fifty_wins')).toBe(50);
    expect(progress(achs, 'ten_games')).toBe(10);
    expect(progress(achs, 'fifty_games')).toBe(50);
    expect(progress(achs, 'streak_3')).toBe(3);
    expect(progress(achs, 'streak_5')).toBe(5);
  });

  describe('rank achievements', () => {
    it('unlocks silver_rank when current rank is SILVER', () => {
      const league: MyLeague = { points: 300, rank: 'SILVER', previous_rank: null, previous_rank_month: null };
      const achs = buildAchievements(0, 0, 0, 0, league);
      expect(unlocked(achs, 'silver_rank')).toBe(true);
      expect(unlocked(achs, 'gold_rank')).toBe(false);
    });

    it('unlocks silver_rank via previous_rank even if now back to BRONZE', () => {
      const league: MyLeague = { points: 50, rank: 'BRONZE', previous_rank: 'SILVER', previous_rank_month: '2025-12' };
      const achs = buildAchievements(0, 0, 0, 0, league);
      expect(unlocked(achs, 'silver_rank')).toBe(true);
    });

    it('unlocks all lower ranks when current rank is DIAMOND', () => {
      const league: MyLeague = { points: 2000, rank: 'DIAMOND', previous_rank: null, previous_rank_month: null };
      const achs = buildAchievements(0, 0, 0, 0, league);
      expect(unlocked(achs, 'silver_rank')).toBe(true);
      expect(unlocked(achs, 'gold_rank')).toBe(true);
      expect(unlocked(achs, 'platinum_rank')).toBe(true);
      expect(unlocked(achs, 'diamond_rank')).toBe(true);
    });

    it('no rank achievements unlock when league is null', () => {
      const achs = buildAchievements(0, 0, 0, 0, null);
      expect(unlocked(achs, 'silver_rank')).toBe(false);
      expect(unlocked(achs, 'diamond_rank')).toBe(false);
    });
  });
});

// ─── Level progression ───────────────────────────────────────────────────────

describe('computeLevel', () => {
  it('starts at level 1 with 0 games', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('stays at level 1 for games 1–9', () => {
    for (let i = 1; i <= 9; i++) expect(computeLevel(i)).toBe(1);
  });

  it('advances to level 2 at exactly 10 games', () => {
    expect(computeLevel(10)).toBe(2);
  });

  it('advances one level per 10 games', () => {
    expect(computeLevel(20)).toBe(3);
    expect(computeLevel(50)).toBe(6);
    expect(computeLevel(90)).toBe(10);
  });

  it('caps at level 99 (does not exceed)', () => {
    expect(computeLevel(980)).toBe(99);
    expect(computeLevel(10000)).toBe(99);
  });

  it('reaches level 99 at exactly 980 games', () => {
    expect(computeLevel(979)).toBe(98);
    expect(computeLevel(980)).toBe(99);
  });
});

// ─── XP bar percentage ───────────────────────────────────────────────────────

describe('computeXpBarPct', () => {
  it('returns 0% with 0 games (start of level 1)', () => {
    expect(computeXpBarPct(0)).toBe(0);
  });

  it('returns 50% at 5 games (halfway through level 1)', () => {
    expect(computeXpBarPct(5)).toBe(50);
  });

  it('returns 0% at exactly 10 games (just levelled up — bar resets)', () => {
    expect(computeXpBarPct(10)).toBe(0);
  });

  it('returns 30% at 13 games (3 games into level 2)', () => {
    expect(computeXpBarPct(13)).toBe(30);
  });

  it('returns 90% at 9 games (almost done with level 1)', () => {
    expect(computeXpBarPct(9)).toBe(90);
  });
});

// ─── Integration: full flow for a 2v2 player ────────────────────────────────

describe('2v2 achievement integration', () => {
  const make2v2 = (id: string, won: boolean): Game => ({
    id,
    winner_id: won ? PARTNER : 'opp1',   // partner always plays the final tile
    winning_team: won ? 1 : 2,
    players: [
      { userId: ME,      team: 1 },
      { userId: PARTNER, team: 1 },
      { userId: 'opp1',  team: 2 },
      { userId: 'opp2',  team: 2 },
    ],
  });

  it('correctly counts wins and streak across 2v2 history', () => {
    // 10 games: WWWLWWWWWW (9 wins, best streak = 7)
    const games: Game[] = [
      make2v2('10', true),
      make2v2('9',  true),
      make2v2('8',  true),
      make2v2('7',  true),
      make2v2('6',  true),
      make2v2('5',  true),
      make2v2('4',  true),
      make2v2('3',  false),
      make2v2('2',  true),
      make2v2('1',  true),
    ];

    const wins   = games.filter((g) => didWin(g, ME)).length;
    const total  = games.length;
    const streak = computeWinStreak(games, ME);

    expect(wins).toBe(9);
    expect(total).toBe(10);
    expect(streak).toBe(7);

    const achs = buildAchievements(wins, total, streak, 0, null);
    expect(achs.find((a) => a.id === 'first_win')!.unlocked).toBe(true);
    expect(achs.find((a) => a.id === 'ten_games')!.unlocked).toBe(true);
    expect(achs.find((a) => a.id === 'streak_5')!.unlocked).toBe(true);
    expect(achs.find((a) => a.id === 'ten_wins')!.unlocked).toBe(false); // 9 < 10
  });

  it('regression: old winner_id-only logic would undercount 2v2 wins', () => {
    const games = [
      make2v2('1', true),
      make2v2('2', true),
      make2v2('3', true),
    ];

    // Old broken logic: only check winner_id
    const oldWins = games.filter((g) => (g.winner_id ?? g.winnerId) === ME).length;
    // New correct logic: also check winning_team
    const newWins = games.filter((g) => didWin(g, ME)).length;

    expect(oldWins).toBe(0);  // BUG: all wins missed because winner_id = PARTNER
    expect(newWins).toBe(3);  // FIXED
  });
});
