// Prisma auto-mocked; also mock logger
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '../services/prisma.service';
import { enqueue, dequeue, matchmakingEvents, QueueEntry } from '../services/matchmaking.service';

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    userId: 'u' + Math.random(),
    socketId: 's' + Math.random(),
    betAmount: 10,
    mode: 'ARENA_1V1',
    joinedAt: Date.now(),
    ...overrides,
  };
}

describe('enqueue + dequeue', () => {
  beforeEach(() => {
    // Prevent actual DB calls from createMatch by making game.create return a mock
    (prisma.game.create as jest.Mock).mockResolvedValue({ id: 'g1' });
  });

  it('enqueuing the same user twice replaces the first entry', async () => {
    const events: any[] = [];
    matchmakingEvents.on('match_created', (e) => events.push(e));

    const entry = makeEntry({ userId: 'unique-user', betAmount: 5 });
    enqueue(entry);
    enqueue({ ...entry, betAmount: 10 }); // replace

    matchmakingEvents.removeAllListeners('match_created');

    // No match yet (only 1 unique user in queue)
    expect(events).toHaveLength(0);
  });

  it('dequeue removes a user from the queue', () => {
    const entry = makeEntry({ userId: 'removeme' });
    enqueue(entry);
    dequeue('removeme');
    // Now add a second player; no match should fire because removeme is gone
    const events: any[] = [];
    matchmakingEvents.once('match_created', (e) => events.push(e));
    enqueue(makeEntry({ userId: 'other', betAmount: 10 }));
    expect(events).toHaveLength(0);
  });
});

describe('match creation — 1v1', () => {
  it('creates a match when two players with matching bets are queued', (done) => {
    (prisma.game.create as jest.Mock).mockResolvedValue({ id: 'gNew' });

    matchmakingEvents.once('match_created', ({ gameId, players }) => {
      expect(gameId).toBeTruthy();
      expect(players).toHaveLength(2);
      done();
    });

    const a = makeEntry({ userId: 'a1', betAmount: 20, mode: 'ARENA_1V1' });
    const b = makeEntry({ userId: 'b1', betAmount: 20, mode: 'ARENA_1V1' });
    enqueue(a);
    enqueue(b);
  });

  it('does not match players whose bets differ by more than the tolerance', async () => {
    const events: any[] = [];
    matchmakingEvents.on('match_created', (e) => events.push(e));

    // Default tolerance is 20%. Bets of 10 and 100 differ by 90%.
    enqueue(makeEntry({ userId: 'low', betAmount: 10, mode: 'CUP_1V1' }));
    enqueue(makeEntry({ userId: 'high', betAmount: 100, mode: 'CUP_1V1' }));

    // Allow microtask queue to flush
    await Promise.resolve();

    matchmakingEvents.removeAllListeners('match_created');
    expect(events).toHaveLength(0);
  });
});

describe('match creation — 2v2', () => {
  it('creates a match when four players are queued', (done) => {
    (prisma.game.create as jest.Mock).mockResolvedValue({ id: 'g2v2' });

    matchmakingEvents.once('match_created', ({ players }) => {
      expect(players).toHaveLength(4);
      done();
    });

    ['p1', 'p2', 'p3', 'p4'].forEach((id) =>
      enqueue(makeEntry({ userId: id, betAmount: 20, mode: 'TOURNAMENT_2V2' }))
    );
  });

  it('does not create a match with only 3 players for 2v2', async () => {
    const events: any[] = [];
    matchmakingEvents.on('match_created', (e) => events.push(e));

    ['x1', 'x2', 'x3'].forEach((id) =>
      enqueue(makeEntry({ userId: id, betAmount: 20, mode: 'RECREATIONAL_2V2' }))
    );

    await Promise.resolve();

    matchmakingEvents.removeAllListeners('match_created');
    expect(events).toHaveLength(0);
  });
});

describe('game record written on match', () => {
  it('calls prisma.game.create with correct mode and player data', (done) => {
    (prisma.game.create as jest.Mock).mockResolvedValue({ id: 'gRecord' });

    matchmakingEvents.once('match_created', () => {
      expect(prisma.game.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: 'ARENA_1V1' }),
        })
      );
      done();
    });

    enqueue(makeEntry({ userId: 'rec1', betAmount: 10, mode: 'ARENA_1V1' }));
    enqueue(makeEntry({ userId: 'rec2', betAmount: 10, mode: 'ARENA_1V1' }));
  });
});
