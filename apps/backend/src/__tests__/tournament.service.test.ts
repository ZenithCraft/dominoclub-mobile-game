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

function makePlayer(userId: string, eliminatedAt?: Date) {
  return {
    id: `tp-${userId}`,
    tournamentId: 'tr1',
    userId,
    eliminated_at: eliminatedAt ?? null,
    final_position: null,
    prize_won: 0,
    joined_at: new Date(),
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
});

// ─── startTournament ─────────────────────────────────────────────────────────

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
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', players: [makePlayer('u1'), makePlayer('u2')] }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: 'g1' });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', players: [{ userId: 'u1' }, { userId: 'u2' }] },
    ]);

    await startTournament('tr1');

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IN_PROGRESS', current_round: 1 }),
      }),
    );
    expect(prisma.game.create).toHaveBeenCalledTimes(1);
  });

  it('creates 2 round-1 games for 4 players', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'FULL', players: ['u1', 'u2', 'u3', 'u4'].map(id => makePlayer(id)) }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.game.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'g1' })
      .mockResolvedValueOnce({ id: 'g2' });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', players: [{ userId: 'u1' }, { userId: 'u2' }] },
      { id: 'g2', players: [{ userId: 'u3' }, { userId: 'u4' }] },
    ]);

    await startTournament('tr1');

    expect(prisma.game.create).toHaveBeenCalledTimes(2);
  });

  it('gives a bye to the odd player in an uneven draw', async () => {
    // 3 players → 1 game + 1 bye
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({ status: 'OPEN', players: ['u1', 'u2', 'u3'].map(id => makePlayer(id)) }),
    );
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: 'g1' });
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', players: [{ userId: 'u1' }, { userId: 'u2' }] },
    ]);

    await startTournament('tr1');

    expect(prisma.game.create).toHaveBeenCalledTimes(1);
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

    // One $transaction call per player
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
          makePlayer('u1'),                          // active
          makePlayer('u2', new Date('2026-01-01')), // already eliminated
        ],
      }),
    );
    // Only wallet for active player u1
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
      tournament_round: 1,
      players: [
        { userId: 'u1', is_bot: false },
        { userId: 'u2', is_bot: false },
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

  it('finishes the tournament and pays the prize to the last standing player', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        prize_pool: 9,
        players: [makePlayer('u1'), makePlayer('u2')],
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      tournament_round: 1,
      players: [
        { userId: 'u1', is_bot: false },
        { userId: 'u2', is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(2);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    // All round games done
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g1', status: 'FINISHED' }]);
    // Active players: only u1 remains → triggers finishTournament
    (prisma.tournamentPlayer.findMany as jest.Mock)
      .mockResolvedValueOnce([{ userId: 'u1', tournamentId: 'tr1' }]) // active check
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]);  // league points
    (prisma.wallet.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'w1', userId: 'u1' });

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FINISHED' }) }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
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
      tournament_round: 1,
      players: [
        { userId: 'u1', is_bot: false },
        { userId: 'u2', is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(4);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    // Both round-1 games finished
    (prisma.game.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { id: 'g1', status: 'FINISHED' },
        { id: 'g2', status: 'FINISHED' },
      ])
      .mockResolvedValueOnce([ // next-round games for notification
        { id: 'g3', players: [{ userId: 'u1' }, { userId: 'u3' }] },
      ]);
    // u1 and u3 are the active survivors
    (prisma.tournamentPlayer.findMany as jest.Mock).mockResolvedValueOnce([
      { userId: 'u1', tournamentId: 'tr1' },
      { userId: 'u3', tournamentId: 'tr1' },
    ]);
    (prisma.tournament.update as jest.Mock).mockResolvedValueOnce({});
    (prisma.game.create as jest.Mock).mockResolvedValueOnce({ id: 'g3' });

    await advanceTournamentBracket('tr1', 'g1', 'u1', undefined);

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ current_round: 2 }) }),
    );
    expect(prisma.game.create).toHaveBeenCalledTimes(1);
  });

  it('cancels the tournament when no active players remain after elimination', async () => {
    // Edge case: both players disconnected / abandoned; nobody is the winner
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTournament({
        status: 'IN_PROGRESS',
        current_round: 1,
        players: [makePlayer('u1'), makePlayer('u2')],
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'g1',
      tournament_round: 1,
      players: [
        { userId: 'u1', is_bot: false },
        { userId: 'u2', is_bot: false },
      ],
    });
    (prisma.tournamentPlayer.count as jest.Mock).mockResolvedValueOnce(2);
    (prisma.tournamentPlayer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 2 }); // both eliminated
    (prisma.game.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'g1', status: 'ABANDONED' }]);
    // Zero active players
    (prisma.tournamentPlayer.findMany as jest.Mock).mockResolvedValueOnce([]);

    await advanceTournamentBracket('tr1', 'g1', undefined, undefined);

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });
});
