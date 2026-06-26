jest.mock('../utils/logger', () => ({
  logger:      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  matchLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/league.service', () => ({
  awardTournamentPoints: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../services/prisma.service';
import {
  createTournament,
  startTournament,
  cancelAndRefundTournament,
  emergencyCancelTournament,
  advanceTournamentBracket,
  withdrawFromTournament,
} from '../services/tournament.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTournament(overrides: Record<string, any> = {}) {
  return {
    id: 'tr1',
    name: 'Test Cup',
    mode: 'ARENA_1V1',
    variant: 'CARROCA',
    status: 'OPEN',
    entry_fee: 5,
    prize_pool: 18,
    initial_prize_pool: 0,
    max_players: 4,
    current_players: 4,
    current_round: 0,
    starts_at: new Date(),
    finished_at: null,
    is_in_person: false,
    players: [],
    games: [],
    ...overrides,
  };
}

function makePlayer(userId: string, overrides: Record<string, any> = {}) {
  return {
    id: `tp-${userId}`,
    tournamentId: 'tr1',
    userId,
    seed: null,
    eliminated_at: null,
    withdrawn_at: null,
    final_position: null,
    prize_won: 0,
    joined_at: new Date(),
    ...overrides,
  };
}

// ─── createTournament ─────────────────────────────────────────────────────────

describe('createTournament', () => {
  it('creates a tournament with the provided fields', async () => {
    const created = { id: 'tr1', name: 'Cup' };
    (prisma.tournament.create as jest.Mock).mockResolvedValueOnce(created);

    const result = await createTournament({
      name: 'Cup',
      mode: 'ARENA_1V1',
      variant: 'CARROCA',
      entryFee: 5,
      maxPlayers: 8,
      startsAt: new Date('2026-07-01T00:00:00Z'),
    });

    expect(result).toEqual(created);
    expect(prisma.tournament.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Cup',
        mode: 'ARENA_1V1',
        variant: 'CARROCA',
        entry_fee: 5,
        max_players: 8,
        initial_prize_pool: 0,
      }),
    });
  });

  it('defaults variant to CARROCA when not provided', async () => {
    (prisma.tournament.create as jest.Mock).mockResolvedValueOnce({ id: 'tr2' });

    await createTournament({
      name: 'Cup2',
      mode: 'CUP_1V1',
      entryFee: 10,
      maxPlayers: 16,
      startsAt: new Date(),
    });

    expect(prisma.tournament.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ variant: 'CARROCA' }),
    });
  });

  it('stores initialPrizePool for in-person events', async () => {
    (prisma.tournament.create as jest.Mock).mockResolvedValueOnce({ id: 'tr3' });

    await createTournament({
      name: 'Presencial',
      mode: 'ARENA_1V1',
      entryFee: 20,
      maxPlayers: 8,
      startsAt: new Date(),
      initialPrizePool: 500,
    });

    expect(prisma.tournament.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ initial_prize_pool: 500 }),
    });
  });
});

// ─── startTournament ──────────────────────────────────────────────────────────

// Helper: mock the seed-assignment chain (user.findMany + tournamentPlayer.updateMany)
function mockSeedAssignment(playerIds: string[]) {
  (prisma.user.findMany as jest.Mock).mockResolvedValueOnce(
    playerIds.map((id, i) => ({ id, league_points: (playerIds.length - i) * 100 })),
  );
  // one updateMany per player
  playerIds.forEach(() =>
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }),
  );
}

describe('startTournament', () => {
  it('throws if tournament is not found', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(startTournament('missing')).rejects.toThrow('Tournament not found');
  });

  it('throws if tournament status is IN_PROGRESS', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'IN_PROGRESS' }),
    );
    await expect(startTournament('tr1')).rejects.toThrow(/cannot be started/);
  });

  it('throws if tournament status is FINISHED', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'FINISHED' }),
    );
    await expect(startTournament('tr1')).rejects.toThrow(/cannot be started/);
  });

  it('throws if fewer than 2 players are registered', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', players: [makePlayer('u1')] }),
    );
    await expect(startTournament('tr1')).rejects.toThrow(/at least 2/);
  });

  it('marks tournament IN_PROGRESS and creates 1 game for 2 players (1v1)', async () => {
    const players = ['u1', 'u2'].map(id => makePlayer(id));
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', players }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    mockSeedAssignment(['u1', 'u2']);
    (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: 'g1' });

    await startTournament('tr1');

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IN_PROGRESS', current_round: 1 }),
      }),
    );
    expect(prisma.game.create).toHaveBeenCalledTimes(1);
  });

  it('creates 2 round-1 games for 4 players', async () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map(id => makePlayer(id));
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'FULL', players }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    mockSeedAssignment(['u1', 'u2', 'u3', 'u4']);
    (prisma.game.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'g1' })
      .mockResolvedValueOnce({ id: 'g2' });

    await startTournament('tr1');

    expect(prisma.game.create).toHaveBeenCalledTimes(2);
  });

  it('gives a bye to the top seed when player count is odd', async () => {
    // 3 players → 1 game + 1 bye (top seed sits out)
    const players = ['u1', 'u2', 'u3'].map(id => makePlayer(id));
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', players }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    mockSeedAssignment(['u1', 'u2', 'u3']);
    (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: 'g1' });

    await startTournament('tr1');

    // Only 1 game created (2 players play, 1 gets bye)
    expect(prisma.game.create).toHaveBeenCalledTimes(1);
  });

  it('creates 5 games for 10 players (no byes needed — even count)', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${i + 1}`);
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', max_players: 10, players: ids.map(id => makePlayer(id)) }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    mockSeedAssignment(ids);
    ids.slice(0, 5).forEach((_, i) =>
      (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: `g${i + 1}` }),
    );

    await startTournament('tr1');

    expect(prisma.game.create).toHaveBeenCalledTimes(5);
  });

  it('uses seeded mirror pairing: best vs worst, 2nd vs 2nd-worst', async () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map(id => makePlayer(id));
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'FULL', players }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});

    // u1 = best (400pts), u2 = 300, u3 = 200, u4 = 100 (worst)
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'u1', league_points: 400 },
      { id: 'u2', league_points: 300 },
      { id: 'u3', league_points: 200 },
      { id: 'u4', league_points: 100 },
    ]);
    ['u1', 'u2', 'u3', 'u4'].forEach(() =>
      (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }),
    );
    (prisma.game.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'g1' })
      .mockResolvedValueOnce({ id: 'g2' });

    await startTournament('tr1');

    const calls = (prisma.game.create as jest.Mock).mock.calls;
    // Game 1: seed 1 (u1) vs seed 4 (u4)
    expect(calls[0][0].data.players.create).toEqual([
      expect.objectContaining({ userId: 'u1', team: 1 }),
      expect.objectContaining({ userId: 'u4', team: 2 }),
    ]);
    // Game 2: seed 2 (u2) vs seed 3 (u3)
    expect(calls[1][0].data.players.create).toEqual([
      expect.objectContaining({ userId: 'u2', team: 1 }),
      expect.objectContaining({ userId: 'u3', team: 2 }),
    ]);
  });
});

// ─── cancelAndRefundTournament ────────────────────────────────────────────────

describe('cancelAndRefundTournament', () => {
  it('does nothing if tournament is not found', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await cancelAndRefundTournament('missing');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('does nothing if tournament is already FINISHED', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'FINISHED' }),
    );

    await cancelAndRefundTournament('tr1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('refunds each player and marks tournament CANCELLED', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'OPEN',
        entry_fee: 5,
        players: [{ userId: 'u1' }, { userId: 'u2' }],
      }),
    );
    (prisma.wallet.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'w1', userId: 'u1' })
      .mockResolvedValueOnce({ id: 'w2', userId: 'u2' });

    await cancelAndRefundTournament('tr1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });

  it('skips refund if a player has no wallet', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'FULL',
        entry_fee: 5,
        players: [{ userId: 'u1' }],
      }),
    );
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await cancelAndRefundTournament('tr1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tournament.update).toHaveBeenCalled();
  });
});

// ─── emergencyCancelTournament ────────────────────────────────────────────────

describe('emergencyCancelTournament', () => {
  it('throws if tournament is not found', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(emergencyCancelTournament('missing', 'reason')).rejects.toThrow('Tournament not found');
  });

  it('throws if tournament is already FINISHED', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'FINISHED', players: [] }),
    );
    await expect(emergencyCancelTournament('tr1', 'reason')).rejects.toThrow(/cannot be cancelled/);
  });

  it('throws if tournament is already CANCELLED', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'CANCELLED', players: [] }),
    );
    await expect(emergencyCancelTournament('tr1', 'reason')).rejects.toThrow(/cannot be cancelled/);
  });

  it('only refunds non-eliminated players', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        players: [
          makePlayer('u1'),                                           // active
          makePlayer('u2', { eliminated_at: new Date('2026-01-01') }), // already eliminated
        ],
      }),
    );
    (prisma.wallet.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'w1', userId: 'u1' }]);

    await emergencyCancelTournament('tr1', 'server outage');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // only u1
    expect(prisma.game.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });

  it('cancels in-progress games and sets tournament CANCELLED', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'IN_PROGRESS', players: [] }),
    );
    (prisma.wallet.findMany as jest.Mock).mockResolvedValueOnce([]);

    await emergencyCancelTournament('tr1', 'admin decision');

    expect(prisma.game.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['WAITING', 'PLAYING'] } }),
      }),
    );
  });
});

// ─── advanceTournamentBracket ─────────────────────────────────────────────────

describe('advanceTournamentBracket', () => {
  it('does nothing if tournament is not IN_PROGRESS', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', current_round: 1 }),
    );

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    expect(prisma.game.findUnique).not.toHaveBeenCalled();
    expect(prisma.tournamentPlayer.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing if the finished game belongs to a previous round', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'IN_PROGRESS', current_round: 2 }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'FINISHED',
      tournament_round: 1, // stale round
      players: [],
    });

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    expect(prisma.tournamentPlayer.updateMany).not.toHaveBeenCalled();
  });

  it('eliminates the loser and waits while other round games are still playing', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        players: ['u1', 'u2', 'u3', 'u4'].map(id => makePlayer(id)),
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'FINISHED',
      tournament_round: 1,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 2, is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(4);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    // g2 still in progress → round not complete
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', status: 'FINISHED' },
      { id: 'g2', status: 'PLAYING' },
    ]);

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    expect(prisma.tournamentPlayer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: { in: ['u2'] } }) }),
    );
    // Round incomplete — should not advance yet
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('uses winnerTeam for 2v2 — protects both winning teammates from elimination', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        mode: 'TOURNAMENT_2V2',
        players: ['u1', 'u2', 'u3', 'u4'].map(id => makePlayer(id)),
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'FINISHED',
      tournament_round: 1,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 1, is_bot: false },
        { userId: 'u3', team: 2, is_bot: false },
        { userId: 'u4', team: 2, is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(4);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 2 });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g1', status: 'FINISHED' }]);
    // After elimination, 2 active players remain
    (prisma.tournamentPlayer.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { userId: 'u1', seed: 1 },
        { userId: 'u2', seed: 2 },
      ]);
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w1', userId: 'u1' });

    // winnerTeam = 1 (u1 + u2 win); winnerId = u1 (one of the team members)
    await advanceTournamentBracket('tr1', 'g1', 'u1', 1);

    const eliminatedCall = (prisma.tournamentPlayer.updateMany as jest.Mock).mock.calls[0];
    const eliminatedIds: string[] = eliminatedCall[0].where.userId.in;
    // Only team 2 (u3, u4) should be eliminated — not u2 (teammate of winnerId)
    expect(eliminatedIds).toContain('u3');
    expect(eliminatedIds).toContain('u4');
    expect(eliminatedIds).not.toContain('u1');
    expect(eliminatedIds).not.toContain('u2');
  });

  it('skips elimination for CANCELLED games (player already withdrawn)', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'IN_PROGRESS', current_round: 1, players: ['u1', 'u2'].map(id => makePlayer(id)) }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'CANCELLED', // u1 withdrew → game cancelled
      tournament_round: 1,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 2, is_bot: false },
      ],
    });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g1', status: 'CANCELLED' }]);
    // u1 already eliminated_at; only u2 remains active
    (prisma.tournamentPlayer.findMany as jest.Mock).mockResolvedValueOnce([
      { userId: 'u2', seed: 2 },
    ]);
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w2', userId: 'u2' });
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});

    await advanceTournamentBracket('tr1', 'g1', undefined, undefined);

    // No elimination updateMany should have run (only winner-position update is allowed)
    const allUpdateManyCalls = (prisma.tournamentPlayer.updateMany as jest.Mock).mock.calls;
    const eliminationCalls = allUpdateManyCalls.filter(
      (c: any[]) => c[0]?.data?.eliminated_at !== undefined,
    );
    expect(eliminationCalls).toHaveLength(0);
    // Tournament should finish with u2 as winner
    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FINISHED' }) }),
    );
  });

  it('finishes the tournament and pays the prize to the last standing player', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        prize_pool: 9,
        initial_prize_pool: 0,
        players: [makePlayer('u1'), makePlayer('u2')],
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'FINISHED',
      tournament_round: 1,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 2, is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(2);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g1', status: 'FINISHED' }]);
    (prisma.tournamentPlayer.findMany as jest.Mock)
      .mockResolvedValueOnce([{ userId: 'u1', seed: 1 }])           // active check
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]); // league points
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w1', userId: 'u1' });

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FINISHED' }) }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('uses initial_prize_pool for in-person tournaments instead of accumulated prize_pool', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        prize_pool: 0,          // no online accumulation
        initial_prize_pool: 500, // admin-set prize
        is_in_person: true,
        players: [makePlayer('u1'), makePlayer('u2')],
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'FINISHED',
      tournament_round: 1,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 2, is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(2);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g1', status: 'FINISHED' }]);
    (prisma.tournamentPlayer.findMany as jest.Mock)
      .mockResolvedValueOnce([{ userId: 'u1', seed: 1 }])
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]);
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w1', userId: 'u1' });

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    // Prize credited = initial_prize_pool (500), not prize_pool (0)
    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ real_balance: { increment: 500 } }),
      }),
    );
  });

  it('advances to the next round when multiple players remain after a round completes', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        players: ['u1', 'u2', 'u3', 'u4'].map(id => makePlayer(id)),
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'FINISHED',
      tournament_round: 1,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 2, is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(4);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', status: 'FINISHED' },
      { id: 'g2', status: 'FINISHED' },
    ]);
    // u1 and u3 are the active survivors (with their seeds)
    (prisma.tournamentPlayer.findMany as jest.Mock).mockResolvedValueOnce([
      { userId: 'u1', seed: 1 },
      { userId: 'u3', seed: 3 },
    ]);
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: 'g3' });
    // seed assignment mocks for user.findMany are not needed since seeds already assigned
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ current_round: 2 }) }),
    );
    expect(prisma.game.create).toHaveBeenCalledTimes(1);
  });

  it('cancels the tournament when no active players remain after elimination', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        players: [makePlayer('u1'), makePlayer('u2')],
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      status: 'FINISHED',
      tournament_round: 1,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 2, is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(2);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 2 });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g1', status: 'ABANDONED' }]);
    (prisma.tournamentPlayer.findMany as jest.Mock).mockResolvedValueOnce([]);

    await advanceTournamentBracket('tr1', 'g1', undefined, undefined);

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });
});

// ─── withdrawFromTournament ───────────────────────────────────────────────────

describe('withdrawFromTournament', () => {
  it('throws if tournament is not IN_PROGRESS', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      { id: 'tr1', status: 'OPEN', current_round: 0 },
    );
    await expect(withdrawFromTournament('tr1', 'u1')).rejects.toThrow('Tournament is not in progress');
  });

  it('throws if player is not active', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      { id: 'tr1', status: 'IN_PROGRESS', current_round: 1 },
    );
    (prisma.tournamentPlayer.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(withdrawFromTournament('tr1', 'u1')).rejects.toThrow('Player is not active');
  });

  it('marks player eliminated+withdrawn and emits tournament:withdrew', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      { id: 'tr1', status: 'IN_PROGRESS', current_round: 2 },
    );
    (prisma.tournamentPlayer.findFirst as jest.Mock).mockResolvedValueOnce(makePlayer('u1'));
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    // No waiting game found → player is between rounds
    (prisma.game.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await withdrawFromTournament('tr1', 'u1');

    expect(prisma.tournamentPlayer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eliminated_at: expect.any(Date),
          withdrawn_at: expect.any(Date),
        }),
      }),
    );
  });

  it('cancels the waiting game and advances bracket when player has a pending game', async () => {
    (prisma.tournament.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'tr1', status: 'IN_PROGRESS', current_round: 2 }) // withdraw query
      .mockResolvedValueOnce(makeTournament({ status: 'IN_PROGRESS', current_round: 2, players: ['u1', 'u2'].map(id => makePlayer(id)) })); // advanceBracket query
    (prisma.tournamentPlayer.findFirst as jest.Mock).mockResolvedValueOnce(makePlayer('u1'));
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    // Waiting game exists
    (prisma.game.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'g5',
      players: [
        { userId: 'u1', is_bot: false },
        { userId: 'u2', is_bot: false },
      ],
    });
    (prisma.game.update as jest.Mock).mockResolvedValueOnce({});

    // advanceTournamentBracket mocks
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g5',
      status: 'CANCELLED',
      tournament_round: 2,
      players: [
        { userId: 'u1', team: 1, is_bot: false },
        { userId: 'u2', team: 2, is_bot: false },
      ],
    });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g5', status: 'CANCELLED' }]);
    (prisma.tournamentPlayer.findMany as jest.Mock).mockResolvedValueOnce([
      { userId: 'u2', seed: 2 },
    ]);
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w2', userId: 'u2' });
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});

    await withdrawFromTournament('tr1', 'u1');

    expect(prisma.game.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g5' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    // Tournament should finish with u2 winning
    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FINISHED' }) }),
    );
  });
});

// ─── bracket helpers (unit tests) ────────────────────────────────────────────

describe('mirror bracket pairing logic', () => {
  // These test the exported bracket behaviour indirectly through startTournament.
  // Direct helper tests are kept here as documentation.

  it('pairs 10 players correctly — 5 games, no byes', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${i + 1}`);
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', max_players: 10, players: ids.map(id => makePlayer(id)) }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    // All same points → sort preserved by join order
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce(
      ids.map(id => ({ id, league_points: 0 })),
    );
    ids.forEach(() =>
      (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }),
    );
    for (let i = 0; i < 5; i++) {
      (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: `g${i}` });
    }

    await startTournament('tr1');

    expect(prisma.game.create).toHaveBeenCalledTimes(5);
  });

  it('gives top seed a bye for 9 players — 4 games created', async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `u${i + 1}`);
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', max_players: 9, players: ids.map(id => makePlayer(id)) }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce(
      ids.map((id, i) => ({ id, league_points: (ids.length - i) * 10 })),
    );
    ids.forEach(() =>
      (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }),
    );
    for (let i = 0; i < 4; i++) {
      (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: `g${i}` });
    }

    await startTournament('tr1');

    expect(prisma.game.create).toHaveBeenCalledTimes(4);
  });
});
