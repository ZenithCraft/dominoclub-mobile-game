import { EventEmitter } from 'events';
import { prisma } from './prisma.service';
import { config } from '../config';
import { getHouseEdgePercent } from './runtime-config.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export type MatchmakingVariant = 'CARROCA' | 'L_E_L' | 'CRUZADA';

export interface QueueEntry {
  userId: string;
  socketId: string;
  betAmount: number;
  variant: MatchmakingVariant;
  mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2';
  joinedAt: number;
  isBot?: boolean;
}

export const matchmakingEvents = new EventEmitter();

const queues = new Map<string, QueueEntry[]>();

// Queue entries older than this are considered stale and removed
const QUEUE_STALE_MS = 5 * 60 * 1000; // 5 minutes

const BET_EPSILON = 1e-9;
const COLLUSION_MIN_MATCHES = 10;
const COLLUSION_WINRATE_THRESHOLD = 0.9;

function sameBet(a: number, b: number) {
  return Math.abs(a - b) <= BET_EPSILON;
}

function getQueueKey(mode: string) {
  return mode;
}

export function enqueue(entry: QueueEntry) {
  const key = getQueueKey(entry.mode);
  if (!queues.has(key)) queues.set(key, []);
  const queue = queues.get(key)!;

  // Remove any existing entry for this user
  const existingIdx = queue.findIndex((e) => e.userId === entry.userId);
  if (existingIdx !== -1) queue.splice(existingIdx, 1);

  queue.push(entry);
  logger.debug('Player enqueued', { userId: entry.userId, mode: entry.mode, betAmount: entry.betAmount, variant: entry.variant });

  void tryMatch(entry.mode);
}

export function dequeue(userId: string) {
  queues.forEach((queue) => {
    const idx = queue.findIndex((e) => e.userId === userId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      logger.debug('Player dequeued', { userId });
    }
  });
}

export function getQueueStats() {
  const stats: Record<string, { total: number; byBet: Record<string, number> }> = {};
  queues.forEach((queue, mode) => {
    const byBet: Record<string, number> = {};
    for (const entry of queue) {
      const key = String(entry.betAmount ?? 0);
      byBet[key] = (byBet[key] ?? 0) + 1;
    }
    stats[mode] = { total: queue.length, byBet };
  });
  return stats;
}

// Returns 1-based position in queue, or -1 if not found
export function getQueuePosition(userId: string, mode: string): number {
  const queue = queues.get(mode);
  if (!queue) return -1;
  const idx = queue.findIndex((e) => e.userId === userId);
  return idx === -1 ? -1 : idx + 1;
}

// Periodically remove stale queue entries and notify via callback.
// Returns the interval handle so caller can clear it on shutdown.
export function startQueueCleanup(
  onExpired: (userId: string, socketId: string) => void
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    queues.forEach((queue) => {
      for (let i = queue.length - 1; i >= 0; i--) {
        const entry = queue[i];
        if (!entry.isBot && now - entry.joinedAt > QUEUE_STALE_MS) {
          queue.splice(i, 1);
          logger.info('Queue entry expired (stale)', { userId: entry.userId, mode: entry.mode });
          onExpired(entry.userId, entry.socketId);
        }
      }
    });
  }, 30_000);
}

async function tryMatch(mode: string) {
  const queue = queues.get(mode);
  if (!queue) return;

  const playersNeeded = mode.includes('2V2') || mode.includes('2v2') ? 4 : 2;

  if (queue.length < playersNeeded) return;

  // For 1v1: find two players with matching bet amounts AND same variant
  if (playersNeeded === 2) {
    const pairBlockCache = new Map<string, boolean>();
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i];
        const b = queue[j];
        if (a.variant !== b.variant) continue;
        if (!sameBet(a.betAmount, b.betAmount)) continue;
        if (a.betAmount > 0 && !a.isBot && !b.isBot) {
          const key = a.userId < b.userId ? `${a.userId}:${b.userId}` : `${b.userId}:${a.userId}`;
          let blocked = pairBlockCache.get(key);
          if (blocked === undefined) {
            blocked = await isPairBlocked(a.userId, b.userId).catch(() => false);
            pairBlockCache.set(key, blocked);
          }
          if (blocked) continue;
        }
        queue.splice(j, 1);
        queue.splice(i, 1);
        void createMatch([a, b], mode as any);
        return;
      }
    }
  }

  // For 2v2: group 4 players with similar bets and same variant
  if (playersNeeded === 4 && queue.length >= 4) {
    const pairBlockCache = new Map<string, boolean>();
    for (let i = 0; i < queue.length; i++) {
      const seed = queue[i];
      const group = queue.filter((e) => e.variant === seed.variant && sameBet(e.betAmount, seed.betAmount)).slice(0, 4);
      if (group.length < 4) continue;
      if (seed.betAmount > 0 && group.some((p) => p.isBot)) continue;

      let blocked = false;
      if (seed.betAmount > 0) {
        for (let a = 0; a < group.length && !blocked; a++) {
          for (let b = a + 1; b < group.length; b++) {
            const ua = group[a].userId;
            const ub = group[b].userId;
            const k = ua < ub ? `${ua}:${ub}` : `${ub}:${ua}`;
            const cached = pairBlockCache.get(k);
            if (cached === true) { blocked = true; break; }
            if (cached === false) continue;
            try {
              const v = await isPairBlocked(ua, ub);
              pairBlockCache.set(k, v);
              if (v) { blocked = true; break; }
            } catch {
              pairBlockCache.set(k, false);
            }
          }
        }
      }

      if (blocked) continue;

      group.forEach((entry) => {
        const idx = queue.findIndex((e) => e.userId === entry.userId);
        if (idx !== -1) queue.splice(idx, 1);
      });
      void createMatch(group, mode as any);
      return;
    }
  }
}

async function createMatch(players: QueueEntry[], mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2') {
  const betAmount = players[0]?.betAmount ?? 0;
  if (!players.every((p) => sameBet(p.betAmount, betAmount))) {
    logger.warn('Refusing to create match with mismatched bet amounts', {
      mode,
      bets: players.map((p) => p.betAmount),
      users: players.map((p) => p.userId),
    });
    return;
  }
  const variant = players[0].variant;
  const gameId = uuidv4();

  // Read house edge from DB (with cache fallback) so admin can change it live
  const houseEdge = await getHouseEdgePercent();

  // Anti-collusion: shuffle team assignments in 2v2
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  const playerData = shuffledPlayers.map((p, i) => ({
    userId: p.userId,
    team: mode.includes('2V2') ? (i < 2 ? 1 : 2) : i + 1,
    seat: i,
    socketId: p.socketId,
    isBot: !!p.isBot,
  }));

  try {
    const game = await prisma.game.create({
      data: {
        id: gameId,
        mode,
        variant,
        bet_amount: betAmount,
        prize_pool: betAmount * players.length * (1 - houseEdge / 100),
        house_fee: betAmount * players.length * (houseEdge / 100),
        status: 'PLAYING',
        players: {
          create: playerData.map((p) => ({
            userId: p.userId,
            team: p.team,
            seat: p.seat,
            is_bot: p.isBot,
          })),
        },
      },
    });

    logger.info('Match created', { gameId, mode, variant, players: playerData.map((p) => p.userId) });
    matchmakingEvents.emit('match_created', { gameId, players: playerData, betAmount, mode });
  } catch (err) {
    logger.error('Failed to create match', { err });
  }
}

async function createBotUser() {
  const suffix = uuidv4().replace(/-/g, '').slice(0, 12);
  const phone = `+5599${suffix}`;
  return prisma.user.create({
    data: {
      phone,
      name: 'Bot',
      cpf_verified: true,
      phone_verified: true,
    },
    select: { id: true },
  });
}

// Bot injection: if a player waits too long, inject a bot opponent
export function startBotInjectionTimer(entry: QueueEntry) {
  const timeout = setTimeout(() => {
    void (async () => {
      const queue = queues.get(entry.mode);
      if (!queue) return;
      const stillWaiting = queue.find((e) => e.userId === entry.userId);
      if (!stillWaiting) return;

      logger.info('Injecting bot for waiting player', { userId: entry.userId, mode: entry.mode, betAmount: entry.betAmount });

      const bot = await createBotUser();
      const botEntry: QueueEntry = {
        userId: bot.id,
        socketId: `bot_socket_${uuidv4()}`,
        betAmount: entry.betAmount,
        variant: entry.variant,
        mode: entry.mode,
        joinedAt: Date.now(),
        isBot: true,
      };
      enqueue(botEntry);
    })();
  }, config.game.botInjectWaitSeconds * 1000);

  return timeout;
}

async function isPairBlocked(aUserId: string, bUserId: string): Promise<boolean> {
  if (aUserId === bUserId) return false;

  const games = await prisma.game.findMany({
    where: {
      status: 'FINISHED',
      bet_amount: { gt: 0 },
      mode: { in: ['ARENA_1V1', 'CUP_1V1'] },
      winner_id: { not: null },
      AND: [
        { players: { some: { userId: aUserId } } },
        { players: { some: { userId: bUserId } } },
      ],
    },
    select: { winner_id: true },
    take: 200,
  });

  const total = games.length;
  if (total < COLLUSION_MIN_MATCHES) return false;

  let winsA = 0;
  let winsB = 0;
  for (const g of games) {
    if (g.winner_id === aUserId) winsA++;
    else if (g.winner_id === bUserId) winsB++;
  }

  const maxWins = Math.max(winsA, winsB);
  const winRate = total > 0 ? maxWins / total : 0;
  if (winRate < COLLUSION_WINRATE_THRESHOLD) return false;

  const details = { aUserId, bUserId, total, winsA, winsB, winRate };
  await Promise.allSettled([
    prisma.fraudLog.create({ data: { userId: aUserId, type: 'COLLUSION_SUSPECTED', details } }),
    prisma.fraudLog.create({ data: { userId: bUserId, type: 'COLLUSION_SUSPECTED', details } }),
  ]);

  return true;
}
