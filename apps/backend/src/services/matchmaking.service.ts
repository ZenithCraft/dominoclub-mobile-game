import { EventEmitter } from 'events';
import { prisma } from './prisma.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface QueueEntry {
  userId: string;
  socketId: string;
  betAmount: number;
  mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2';
  joinedAt: number;
}

export const matchmakingEvents = new EventEmitter();

const queues = new Map<string, QueueEntry[]>();

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
  logger.debug('Player enqueued', { userId: entry.userId, mode: entry.mode, betAmount: entry.betAmount });

  tryMatch(entry.mode);
}

export function dequeue(userId: string) {
  queues.forEach((queue, key) => {
    const idx = queue.findIndex((e) => e.userId === userId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      logger.debug('Player dequeued', { userId });
    }
  });
}

function tryMatch(mode: string) {
  const queue = queues.get(mode);
  if (!queue) return;

  const playersNeeded = mode.includes('2V2') || mode.includes('2v2') ? 4 : 2;

  if (queue.length < playersNeeded) return;

  // For 1v1: find two players with matching bet amounts (within tolerance)
  if (playersNeeded === 2) {
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i];
        const b = queue[j];
        const diff = Math.abs(a.betAmount - b.betAmount) / Math.max(a.betAmount, b.betAmount);
        if (diff <= config.game.matchmakingBetTolerance) {
          queue.splice(j, 1);
          queue.splice(i, 1);
          createMatch([a, b], mode as any);
          return;
        }
      }
    }
  }

  // For 2v2: group 4 players with similar bets
  if (playersNeeded === 4 && queue.length >= 4) {
    const sorted = [...queue].sort((a, b) => a.betAmount - b.betAmount);
    const group = sorted.slice(0, 4);
    group.forEach((entry) => {
      const idx = queue.findIndex((e) => e.userId === entry.userId);
      if (idx !== -1) queue.splice(idx, 1);
    });
    createMatch(group, mode as any);
  }
}

async function createMatch(players: QueueEntry[], mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2') {
  const betAmount = Math.min(...players.map((p) => p.betAmount));
  const gameId = uuidv4();

  // Anti-collusion: shuffle team assignments in 2v2
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  const playerData = shuffledPlayers.map((p, i) => ({
    userId: p.userId,
    team: mode.includes('2V2') ? (i < 2 ? 1 : 2) : i + 1,
    seat: i,
    socketId: p.socketId,
  }));

  try {
    const game = await prisma.game.create({
      data: {
        id: gameId,
        mode,
        betAmount,
        prize_pool: betAmount * players.length * (1 - config.game.houseEdgePercent / 100),
        house_fee: betAmount * players.length * (config.game.houseEdgePercent / 100),
        status: 'PLAYING',
        players: {
          create: playerData.map((p) => ({
            userId: p.userId,
            team: p.team,
            seat: p.seat,
          })),
        },
      },
    });

    logger.info('Match created', { gameId, mode, players: playerData.map((p) => p.userId) });
    matchmakingEvents.emit('match_created', { gameId, players: playerData, betAmount, mode });
  } catch (err) {
    logger.error('Failed to create match', { err });
  }
}

// Bot injection: if a player waits too long, inject a bot opponent
export function startBotInjectionTimer(entry: QueueEntry) {
  const timeout = setTimeout(() => {
    const queue = queues.get(entry.mode);
    if (!queue) return;
    const stillWaiting = queue.find((e) => e.userId === entry.userId);
    if (!stillWaiting) return;

    logger.info('Injecting bot for waiting player', { userId: entry.userId });
    const botEntry: QueueEntry = {
      userId: `bot_${uuidv4()}`,
      socketId: `bot_socket_${uuidv4()}`,
      betAmount: entry.betAmount,
      mode: entry.mode,
      joinedAt: Date.now(),
    };
    enqueue(botEntry);
  }, config.game.botInjectWaitSeconds * 1000);

  return timeout;
}
