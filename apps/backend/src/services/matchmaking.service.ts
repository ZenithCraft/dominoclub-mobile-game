import { EventEmitter } from 'events';
import { prisma } from './prisma.service';
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
export const volatileMatches = new Map<string, { gameId: string; betAmount: number; mode: QueueEntry['mode']; variant: MatchmakingVariant; players: any[] }>();

// Queue entries older than this are considered stale and removed
const QUEUE_STALE_MS = 5 * 60 * 1000; // 5 minutes

const PAIR_BLOCK_CACHE_MS = 30_000;
const pairBlockCache = new Map<string, { blocked: boolean; expiresAt: number }>();

function canonicalPair(userId1: string, userId2: string) {
  return userId1 < userId2 ? [userId1, userId2] as const : [userId2, userId1] as const;
}

async function isPairBlocked(userId1: string, userId2: string): Promise<boolean> {
  if (userId1 === userId2) return false;
  const [userAId, userBId] = canonicalPair(userId1, userId2);
  const key = `${userAId}:${userBId}`;
  const cached = pairBlockCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.blocked;

  let blocked = false;
  try {
    const row = await prisma.pairBlock.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
      select: { active: true },
    });
    blocked = !!row?.active;
  } catch {
    blocked = false;
  }
  pairBlockCache.set(key, { blocked, expiresAt: Date.now() + PAIR_BLOCK_CACHE_MS });
  return blocked;
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
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i];
        const b = queue[j];
        if (a.variant !== b.variant) continue;
        if (a.betAmount !== b.betAmount) continue;
        if (await isPairBlocked(a.userId, b.userId)) continue;
        queue.splice(j, 1);
        queue.splice(i, 1);
        void createMatch([a, b], mode as any);
        return;
      }
    }
  }

  // For 2v2: group 4 players with same bet amount and same variant
  if (playersNeeded === 4 && queue.length >= 4) {
    const groups = new Map<string, QueueEntry[]>();
    for (const entry of queue) {
      const key = `${entry.variant}:${String(entry.betAmount ?? 0)}`;
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }

    for (const list of groups.values()) {
      if (list.length < 4) continue;
      const sorted = [...list].sort((a, b) => a.joinedAt - b.joinedAt);

      for (let aIdx = 0; aIdx <= sorted.length - 4; aIdx++) {
        for (let bIdx = aIdx + 1; bIdx <= sorted.length - 3; bIdx++) {
          for (let cIdx = bIdx + 1; cIdx <= sorted.length - 2; cIdx++) {
            for (let dIdx = cIdx + 1; dIdx <= sorted.length - 1; dIdx++) {
              const group = [sorted[aIdx], sorted[bIdx], sorted[cIdx], sorted[dIdx]];
              let blocked = false;
              for (let i = 0; i < group.length && !blocked; i++) {
                for (let j = i + 1; j < group.length && !blocked; j++) {
                  if (await isPairBlocked(group[i].userId, group[j].userId)) blocked = true;
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
      }
    }
  }
}

// ─── Partner Cooldown ─────────────────────────────────────────────────────────

const CONSECUTIVE_TRIGGER = 3;  // same-team games before cooldown kicks in
const COOLDOWN_GAMES      = 3;  // games they must spend on opposing teams

// Returns the canonical pair key and DB key fields
function cooldownKey(userId1: string, userId2: string) {
  const [userAId, userBId] = canonicalPair(userId1, userId2);
  return { userAId, userBId, key: `${userAId}:${userBId}` };
}

// For a group of 4 shuffled players, determine team assignments (1 or 2) that
// respect active cooldowns. Returns a 4-element array indexed by shuffled position.
async function resolveTeamAssignments(userIds: string[]): Promise<number[]> {
  // Collect cooldown pairs
  const inCooldown = new Set<string>();
  for (let i = 0; i < userIds.length; i++) {
    for (let j = i + 1; j < userIds.length; j++) {
      const { userAId, userBId, key } = cooldownKey(userIds[i], userIds[j]);
      try {
        const row = await prisma.partnerCooldown.findUnique({
          where: { userAId_userBId: { userAId, userBId } },
          select: { cooldown_remaining: true },
        });
        if (row && row.cooldown_remaining > 0) inCooldown.add(key);
      } catch { /* ignore */ }
    }
  }

  if (inCooldown.size === 0) return [1, 1, 2, 2];

  // 3 possible team splits for 4 players (indices 0-3):
  // [0,1] vs [2,3] | [0,2] vs [1,3] | [0,3] vs [1,2]
  const splits = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ] as const;

  for (const [t1, t2] of splits) {
    let valid = true;
    for (const [a, b] of [t1, t2] as [number, number][]) {
      const { key } = cooldownKey(userIds[a], userIds[b]);
      if (inCooldown.has(key)) { valid = false; break; }
    }
    if (valid) {
      const teams = [0, 0, 0, 0];
      for (const i of t1) teams[i] = 1;
      for (const i of t2) teams[i] = 2;
      return teams;
    }
  }

  // Fallback if no clean split exists (e.g. multiple conflicting cooldowns)
  return [1, 1, 2, 2];
}

// Called after a 2v2 game finishes. Updates consecutive-same-team counters and
// triggers/decrements cooldowns.
export async function updatePartnerCooldownsAfterGame(
  mode: string,
  players: { userId: string; team: number; isBot: boolean }[]
): Promise<void> {
  if (!mode.includes('2V2')) return;
  const humans = players.filter((p) => !p.isBot);
  if (humans.length < 2) return;

  for (let i = 0; i < humans.length; i++) {
    for (let j = i + 1; j < humans.length; j++) {
      const pA = humans[i];
      const pB = humans[j];
      const { userAId, userBId } = cooldownKey(pA.userId, pB.userId);
      const sameTeam = pA.team === pB.team;

      try {
        const cur = await prisma.partnerCooldown.findUnique({
          where: { userAId_userBId: { userAId, userBId } },
        });

        let consecutive = cur?.consecutive_same_team ?? 0;
        let cooldown    = cur?.cooldown_remaining    ?? 0;

        if (sameTeam) {
          if (cooldown > 0) {
            // Should not happen (we prevented it), but don't punish twice
          } else {
            consecutive += 1;
            if (consecutive >= CONSECUTIVE_TRIGGER) {
              cooldown    = COOLDOWN_GAMES;
              consecutive = 0;
            }
          }
        } else {
          consecutive = 0;
          if (cooldown > 0) cooldown -= 1;
        }

        await prisma.partnerCooldown.upsert({
          where:  { userAId_userBId: { userAId, userBId } },
          update: { consecutive_same_team: consecutive, cooldown_remaining: cooldown },
          create: { userAId, userBId, consecutive_same_team: consecutive, cooldown_remaining: cooldown },
        });
      } catch (err) {
        logger.error('Failed to update partner cooldown', { userAId, userBId, err });
      }
    }
  }
}

async function createMatch(players: QueueEntry[], mode: 'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2') {
  const betAmount = Math.min(...players.map((p) => p.betAmount));
  const variant = players[0].variant;
  const gameId = uuidv4();

  // Read house edge from DB (with cache fallback) so admin can change it live
  let houseEdge = 0;
  try {
    houseEdge = await getHouseEdgePercent();
  } catch {
    houseEdge = 0;
  }

  // Anti-collusion: shuffle then enforce partner-cooldown splits for 2v2
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

  let teamAssignments: number[];
  if (mode.includes('2V2')) {
    teamAssignments = await resolveTeamAssignments(shuffledPlayers.map((p) => p.userId));
  } else {
    teamAssignments = shuffledPlayers.map((_, i) => i + 1);
  }

  const playerData = shuffledPlayers.map((p, i) => ({
    userId: p.userId,
    team: teamAssignments[i],
    seat: i,
    socketId: p.socketId,
    isBot: !!p.isBot,
  }));

  volatileMatches.set(gameId, { gameId, betAmount, mode, variant, players: playerData });

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
    matchmakingEvents.emit('match_created', { gameId, players: playerData, betAmount, mode, variant });
  } catch (err) {
    logger.error('Failed to create match', { err });
    matchmakingEvents.emit('match_created', { gameId, players: playerData, betAmount, mode, variant });
  }
}

async function createBotUser() {
  const suffix = uuidv4().replace(/-/g, '').slice(0, 12);
  const phone = `+5599${suffix}`;
  try {
    return await prisma.user.create({
      data: {
        phone,
        name: 'Bot',
        cpf_verified: true,
        phone_verified: true,
      },
      select: { id: true },
    });
  } catch {
    return { id: `bot_${uuidv4()}` };
  }
}

// Bot injection: if a player waits too long, inject a bot opponent
export function startBotInjectionTimer(entry: QueueEntry, waitSeconds: number) {
  if (!waitSeconds || waitSeconds <= 0) return null;
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
  }, waitSeconds * 1000);

  return timeout;
}
