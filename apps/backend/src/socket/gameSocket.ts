import { Server as SocketServer, Socket } from 'socket.io';
import { prisma } from '../services/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { deductBet, creditWin, refundBet } from '../services/wallet.service';
import { advanceTournamentBracket, setTournamentIo, cancelAndRefundTournament, startTournament } from '../services/tournament.service';
import { getHouseEdgePercent } from '../services/runtime-config.service';
import { config } from '../config';
import { logger, matchLogger } from '../utils/logger';
import { checkGpsProximity, updateBotScore } from '../middleware/antifraud.middleware';
import { awardMatchPoints } from '../services/league.service';
import {
  GameState,
  initGame,
  initNextRound,
  applyMove,
  applyPass,
  drawFromBoneyard,
  getValidMoves,
  getBotMove,
  DominoVariant,
  WIN_POINTS,
} from '../game/domino.engine';
import { volatileMatches, updatePartnerCooldownsAfterGame } from '../services/matchmaking.service';

export const activeGames = new Map<string, GameState>();

// Module-level io ref so admin helpers can emit without the socket context
let _gameIo: SocketServer | null = null;
const turnTimers = new Map<string, NodeJS.Timeout>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();
// gameId -> Set<userId> currently within their disconnect grace window.
// Used so opponents can see "Player X disconnected, forfeit in N" and so the
// reconnect handler knows whether to broadcast a `player_reconnected` event.
const disconnectedInGame = new Map<string, Set<string>>();
// gameId -> remaining ms on the turn timer, captured when the CURRENT player
// disconnected mid-turn. Restored on reconnect so they don't lose their turn
// and don't get a fresh full clock either.
const pausedTurnRemainingMs = new Map<string, number>();

// Per-game monotonically increasing sequence counter.
// Included in every game:state emission so clients can discard stale events.
const gameStateSeq = new Map<string, number>();

// Stores the last game:round_ended payload while the server is in the 4-second
// inter-round pause, so reconnecting players can receive it on game:join.
const pendingRoundResults = new Map<string, any>();

// ─── Bot timing tracking ──────────────────────────────────────────────────────
// Key: `${gameId}:${userId}` — stores the timestamp of the player's last move
// and an array of elapsed intervals (ms) between consecutive moves.
const playerLastMoveAt  = new Map<string, number>();
const playerMoveIntervals = new Map<string, number[]>();

function recordMoveTime(gameId: string, userId: string) {
  const key = `${gameId}:${userId}`;
  const lastAt = playerLastMoveAt.get(key);
  const now = Date.now();

  if (lastAt !== undefined) {
    const intervals = playerMoveIntervals.get(key) ?? [];
    intervals.push(now - lastAt);
    // Keep a rolling window of the last 30 intervals
    playerMoveIntervals.set(key, intervals.length > 30 ? intervals.slice(-30) : intervals);
  }

  playerLastMoveAt.set(key, now);
}

// Per-game set of userIds that already received a real-time bot warning this game.
// Prevents spamming the signal on every suspicious move after the threshold is first crossed.
const realtimeBotWarned = new Set<string>(); // key: `${gameId}:${userId}`

/**
 * Mid-game bot heuristic — called after every move.
 * Returns suspicious=true once we have enough samples and the fast-move ratio
 * exceeds the realtime threshold. Emits game:bot_suspicion to the player's
 * private room and logs a warning; does NOT apply a trust signal (that happens
 * post-game in updateBotScore to avoid double-penalising).
 */
function checkRealtimeBotPattern(
  gameId: string,
  userId: string,
  io: import('socket.io').Server,
): void {
  const key = `${gameId}:${userId}`;
  if (realtimeBotWarned.has(key)) return; // already flagged this game

  const intervals = playerMoveIntervals.get(key) ?? [];
  if (intervals.length < config.antifraud.botRealtimeMinSampleSize) return;

  const fastMoves = intervals.filter((t) => t < config.antifraud.botMinMoveMs);
  const ratio = fastMoves.length / intervals.length;
  if (ratio < config.antifraud.botRealtimeSuspiciousRatio) return;

  realtimeBotWarned.add(key);
  logger.warn('[AntifrAud] Real-time bot pattern detected', {
    gameId, userId, fastRatio: ratio.toFixed(2), sampleSize: intervals.length,
  });
  // Notify the player's own socket room (invisible to opponents)
  io.to(`user:${userId}`).emit('game:bot_suspicion', {
    gameId,
    fastRatio: Math.round(ratio * 100),
    message: 'Padrão de jogo suspeito detectado.',
  });
}

function flushMoveTimings(gameId: string): Map<string, number[]> {
  const result = new Map<string, number[]>();
  const prefix = `${gameId}:`;
  for (const [key, intervals] of playerMoveIntervals) {
    if (key.startsWith(prefix)) {
      result.set(key.slice(prefix.length), intervals);
      playerMoveIntervals.delete(key);
      playerLastMoveAt.delete(key);
      realtimeBotWarned.delete(key);
    }
  }
  return result;
}

// ─── Tournament bot filler ────────────────────────────────────────────────────

async function createTournamentBot(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ts  = Date.now().toString().slice(-7);
    const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const phone = `+5598${ts}${rnd}`;
    try {
      const bot = await prisma.user.create({
        data: { phone, name: 'Bot', cpf_verified: true, phone_verified: true },
        select: { id: true },
      });
      return bot.id;
    } catch (err: any) {
      if (err?.code !== 'P2002' || attempt === 2) break;
    }
  }
  return `bot_${uuidv4()}`;
}

async function fillAndStartTournament(tournamentId: string, currentPlayers: number): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || !['OPEN', 'FULL'].includes(tournament.status)) return;

  const botsNeeded = Math.max(0, tournament.max_players - currentPlayers);

  let botUserIds: Set<string> | undefined;

  if (botsNeeded > 0) {
    const botIds = await Promise.all(Array.from({ length: botsNeeded }, () => createTournamentBot()));
    await prisma.$transaction([
      ...botIds.map((botId) =>
        prisma.tournamentPlayer.create({
          data: { tournamentId, userId: botId },
        })
      ),
      prisma.tournament.update({
        where: { id: tournamentId },
        data: { current_players: { increment: botsNeeded }, status: 'FULL' },
      }),
    ]);
    botUserIds = new Set(botIds);
    logger.info('[Tournament] Filled with bots', { tournamentId, botsNeeded });
  }

  await startTournament(tournamentId, botUserIds);
}

// ─── Tournament auto-cancel scheduler ────────────────────────────────────────

// Track which tournaments have already had their 15-min notification sent
const notifiedTournaments = new Set<string>();

export function initTournamentScheduler(io: SocketServer) {
  _gameIo = io;
  setTournamentIo(io);
  const intervalMs = config.env === 'development' ? 2_000 : 60_000;
  setInterval(async () => {
    try {
      const now = new Date();
      const overdue = await prisma.tournament.findMany({
        where: {
          status: { in: ['OPEN', 'FULL'] },
          starts_at: { lte: now },
        },
        select: { id: true, current_players: true },
      });
      for (const t of overdue) {
        fillAndStartTournament(t.id, t.current_players).catch((e) =>
          logger.error('[Tournament] Auto-start failed', { id: t.id, err: e.message })
        );
      }

      // 15-minute ahead notification for registered players
      const soon = new Date(now.getTime() + 15 * 60 * 1000);
      const starting = await prisma.tournament.findMany({
        where: {
          status: { in: ['OPEN', 'FULL'] },
          starts_at: { gte: now, lte: soon },
        },
        select: {
          id: true, name: true,
          players: { select: { userId: true } },
        },
      });
      for (const t of starting) {
        if (!notifiedTournaments.has(t.id)) {
          notifiedTournaments.add(t.id);
          const userIds = t.players.map((p) => p.userId);
          if (userIds.length) {
            const { sendPushToUsers } = await import('../services/push.service');
            sendPushToUsers(userIds, 'Torneio começa em 15 min! 🎯', `${t.name} — prepare-se!`, { type: 'tournament_starting', tournamentId: t.id }).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      logger.error('[Tournament] Scheduler error', { err: e.message });
    }
  }, intervalMs);
}

// ─── Replay Tracking ─────────────────────────────────────────────────────────

export interface ReplayMove {
  seq: number;
  type: 'play' | 'draw' | 'pass' | 'timeout';
  userId: string;
  playerIndex: number;
  timestamp: number;
  tile?: [number, number];
  side?: 'left' | 'right' | 'top' | 'bottom';
  flipped?: boolean;
}

export interface ReplayData {
  gameId: string;
  variant: string;
  initialDeal: { userId: string; hand: [number, number][] }[];
  initialBoneyard: [number, number][];
  moves: ReplayMove[];
}

const gameReplays = new Map<string, ReplayData>();

function recordMove(gameId: string, move: Omit<ReplayMove, 'seq'>) {
  const replay = gameReplays.get(gameId);
  if (!replay) return;
  replay.moves.push({ ...move, seq: replay.moves.length });
}

// ─── State broadcast with sequence numbers ────────────────────────────────────

function getPlayerView(state: GameState, userId: string): any {
  const playerIndex = state.players.findIndex((p) => p.userId === userId);
  return {
    ...state,
    players: state.players.map((p, i) => ({
      ...p,
      hand: i === playerIndex ? p.hand : p.hand.map(() => null), // hide other hands
    })),
    boneyard: state.boneyard.map(() => null), // hide boneyard tiles (show count only)
  };
}

function broadcastGameState(gameId: string, state: GameState, io: SocketServer) {
  const seq = (gameStateSeq.get(gameId) ?? 0) + 1;
  gameStateSeq.set(gameId, seq);

  state.players.forEach((player) => {
    const view = getPlayerView(state, player.userId);
    io.to(`user:${player.userId}`).emit('game:state', { ...view, seq, gameId });
  });
}

// ─── Socket handlers ─────────────────────────────────────────────────────────

export function setupGameSocket(socket: Socket, io: SocketServer, user: { id: string; name: string; avatar: string | null }) {
  const joinedGames = new Set<string>();

  // Join game room
  socket.on('game:join', async ({ gameId }: { gameId: string }) => {
    let game: any = null;
    try {
      game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { players: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
      });
    } catch {
      const v = volatileMatches.get(gameId);
      if (v) {
        game = {
          id: v.gameId,
          variant: v.variant,
          bet_amount: v.betAmount,
          mode: v.mode,
          players: v.players.map((p: any) => ({
            userId: p.userId,
            team: p.team,
            seat: p.seat,
            is_bot: !!p.isBot,
            user: { id: p.userId, name: p.isBot ? 'Bot' : 'Dev User', avatar: null },
          })),
        };
      }
    }

    if (!game) {
      socket.emit('game:error', { message: 'Game not found' });
      return;
    }

    const isPlayer = game.players.some((p: any) => p.userId === user.id);
    if (!isPlayer) {
      socket.emit('game:error', { message: 'You are not in this game' });
      return;
    }

    socket.join(`game:${gameId}`);
    joinedGames.add(gameId);

    // Update connected status
    try {
      await prisma.gamePlayer.updateMany({
        where: { gameId, userId: user.id },
        data: { connected: true },
      });
    } catch {}

    const k = `${gameId}:${user.id}`;
    const pending = disconnectTimers.get(k);
    const wasInGrace = disconnectedInGame.get(gameId)?.has(user.id) ?? false;
    if (pending) {
      clearTimeout(pending);
      disconnectTimers.delete(k);
      logger.info('Player reconnected within grace period', { gameId, userId: user.id });
    }

    // Initialize game state if not already active
    if (!activeGames.has(gameId)) {
      await startGame(gameId, game.variant as DominoVariant, game.players, Number(game.bet_amount), io);
    } else {
      // Send current state to rejoining/reconnecting player
      const state = activeGames.get(gameId)!;
      const seq = gameStateSeq.get(gameId) ?? 0;
      const playerState = getPlayerView(state, user.id);
      socket.emit('game:state', { ...playerState, seq, gameId });

      // If we're in the 4-second inter-round pause, re-send the round result
      // so players who reconnected during that window still see the banner.
      if (state.status === 'finished') {
        const roundResult = pendingRoundResults.get(gameId);
        if (roundResult) socket.emit('game:round_ended', roundResult);
      }

      // Came back inside the grace window? Tell everyone in the room and resume
      // the (possibly paused) turn timer with whatever time was left.
      if (wasInGrace) {
        disconnectedInGame.get(gameId)?.delete(user.id);
        io.to(`game:${gameId}`).emit('game:player_reconnected', { userId: user.id });

        const currentPlayer = state.players[state.currentPlayerIndex];
        if (state.status === 'playing' && currentPlayer.userId === user.id) {
          const remaining = pausedTurnRemainingMs.get(gameId);
          pausedTurnRemainingMs.delete(gameId);
          startTurnTimer(gameId, state, io, remaining);
        }
      }
    }
  });

  // Client-requested state sync — useful after connection hiccups
  socket.on('game:sync_request', ({ gameId }: { gameId: string }) => {
    const state = activeGames.get(gameId);
    if (!state) {
      socket.emit('game:error', { message: 'Game not active' });
      return;
    }
    const isPlayer = state.players.some((p: any) => p.userId === user.id);
    if (!isPlayer) return;

    const seq = gameStateSeq.get(gameId) ?? 0;
    const view = getPlayerView(state, user.id);
    socket.emit('game:state', { ...view, seq, gameId });
  });

  // Play a tile
  socket.on('game:move', ({ gameId, tile, side, flipped }: any) => {
    const state = activeGames.get(gameId);
    if (!state || state.status !== 'playing') return;

    const playerIndex = state.players.findIndex((p) => p.userId === user.id);
    if (playerIndex !== state.currentPlayerIndex) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    try {
      const newState = applyMove(state, playerIndex, tile, side, flipped);
      activeGames.set(gameId, newState);
      clearTurnTimer(gameId);

      recordMoveTime(gameId, user.id);
      checkRealtimeBotPattern(gameId, user.id, io);
      recordMove(gameId, {
        type: 'play',
        userId: user.id,
        playerIndex,
        timestamp: Date.now(),
        tile,
        side,
        flipped,
      });

      broadcastGameState(gameId, newState, io);

      if (newState.status === 'finished') {
        handleGameEnd(gameId, newState, io);
      } else {
        startTurnTimer(gameId, newState, io);
        scheduleBotTurn(gameId, newState, io);
      }
    } catch (err: any) {
      socket.emit('game:error', { message: err.message });
    }
  });

  // Draw from boneyard
  socket.on('game:draw', ({ gameId }: { gameId: string }) => {
    const state = activeGames.get(gameId);
    if (!state || state.status !== 'playing') return;

    const playerIndex = state.players.findIndex((p) => p.userId === user.id);
    if (playerIndex !== state.currentPlayerIndex) return;

    const newState = drawFromBoneyard(state, playerIndex);
    activeGames.set(gameId, newState);

    recordMoveTime(gameId, user.id);
    checkRealtimeBotPattern(gameId, user.id, io);
    recordMove(gameId, {
      type: 'draw',
      userId: user.id,
      playerIndex,
      timestamp: Date.now(),
    });

    broadcastGameState(gameId, newState, io);
    // Timer keeps running — drawing doesn't reset the turn clock.
    // The player still has whatever time remains on their turn to play or draw again.
  });

  // Pass turn
  socket.on('game:pass', ({ gameId }: { gameId: string }) => {
    const state = activeGames.get(gameId);
    if (!state || state.status !== 'playing') return;

    const playerIndex = state.players.findIndex((p) => p.userId === user.id);
    if (playerIndex !== state.currentPlayerIndex) return;

    const validMoves = getValidMoves(state, playerIndex);
    // In 4-player (2v2) games drawing is not allowed, so pass is always valid when no valid moves
    const is4Player = state.players.length >= 4;
    if (validMoves.length > 0 || (!is4Player && state.boneyard.length > 0)) {
      socket.emit('game:error', { message: 'Cannot pass — you must play or draw' });
      return;
    }

    const newState = applyPass(state, playerIndex);
    activeGames.set(gameId, newState);
    clearTurnTimer(gameId);

    recordMoveTime(gameId, user.id);
    checkRealtimeBotPattern(gameId, user.id, io);
    recordMove(gameId, {
      type: 'pass',
      userId: user.id,
      playerIndex,
      timestamp: Date.now(),
    });

    broadcastGameState(gameId, newState, io);

    if (newState.status === 'finished') {
      handleGameEnd(gameId, newState, io);
    } else {
      startTurnTimer(gameId, newState, io);
      scheduleBotTurn(gameId, newState, io);
    }
  });

  let lastEmojiAt = 0;
  socket.on('game:emoji', ({ gameId, emoji }: { gameId: string; emoji: string }) => {
    if (!activeGames.has(gameId)) return;
    if (typeof emoji !== 'string' || emoji.length > 8) return;
    const now = Date.now();
    if (now - lastEmojiAt < 2000) return;
    lastEmojiAt = now;
    io.to(`game:${gameId}`).emit('game:emoji', { userId: user.id, emoji, at: now });
  });

  socket.on('game:leave', async ({ gameId }: { gameId: string }) => {
    socket.leave(`game:${gameId}`);
    joinedGames.delete(gameId);
    try {
      await prisma.gamePlayer.updateMany({
        where: { gameId, userId: user.id },
        data: { connected: false },
      });
    } catch {}
    await forfeitGame(gameId, user.id, io, 'leave');
  });

  socket.on('disconnect', () => {
    const gameIds = [...joinedGames];
    joinedGames.clear();
    gameIds.forEach((gameId) => {
      void (async () => {
        try {
          await prisma.gamePlayer.updateMany({
            where: { gameId, userId: user.id },
            data: { connected: false },
          });
        } catch {}

      // Track in the per-game set so the reconnect handler can detect a
      // "came back from grace" event and emit the right broadcast.
      let set = disconnectedInGame.get(gameId);
      if (!set) { set = new Set(); disconnectedInGame.set(gameId, set); }
      set.add(user.id);

      const state = activeGames.get(gameId);
      const is4Player = (state?.players.length ?? 0) >= 4;

      // In 2v2 games, substitute immediately with a bot — no grace window.
      // This prevents 3 friends from exploiting the grace period to hand
      // a match to their team by having one player disconnect on purpose.
      if (is4Player && state && state.status === 'playing') {
        replaceWithBot(gameId, user.id, io);
        return;
      }

      // If it's THIS player's turn, freeze the turn timer with whatever ms
      // were left — the match shouldn't keep moving while they're offline.
      if (state && state.status === 'playing') {
        const currentPlayer = state.players[state.currentPlayerIndex];
        if (currentPlayer.userId === user.id) {
          const fullTimeoutMs = config.game.turnTimeoutSeconds * 1000;
          const elapsed = state.turnStartedAt ? Date.now() - state.turnStartedAt : 0;
          const remaining = Math.max(1000, fullTimeoutMs - elapsed);
          pausedTurnRemainingMs.set(gameId, remaining);
          clearTurnTimer(gameId);
        }
      }

      const graceMs = config.game.disconnectGraceSeconds * 1000;
      const deadlineAt = Date.now() + graceMs;

      // Let opponents see a "Player X disconnected — forfeit em N" banner.
      io.to(`game:${gameId}`).emit('game:player_disconnected', {
        userId: user.id,
        deadlineAt,
        graceMs,
      });

      const k = `${gameId}:${user.id}`;
      const t = setTimeout(() => {
        disconnectTimers.delete(k);
        disconnectedInGame.get(gameId)?.delete(user.id);
        pausedTurnRemainingMs.delete(gameId);
        forfeitGame(gameId, user.id, io, 'disconnect').catch(() => {});
      }, graceMs);
      disconnectTimers.set(k, t);
      logger.info('Grace period started for disconnected player', {
        gameId,
        userId: user.id,
        graceSeconds: config.game.disconnectGraceSeconds,
      });
      })();
    });
  });
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────

async function startGame(gameId: string, variant: DominoVariant, players: any[], betAmount: number, io: SocketServer) {
  if (betAmount > 0) {
    const deducted: string[] = [];
    let failed = false;

    for (const player of players) {
      if (player.is_bot) continue;
      try {
        const wallet = await prisma.wallet.findUnique({ where: { userId: player.userId } });
        if (!wallet) throw new Error('Wallet not found');
        await deductBet(wallet.id, betAmount);
        deducted.push(wallet.id);
      } catch (err: any) {
        logger.error('[startGame] Failed to deduct bet — aborting game', { userId: player.userId, gameId, betAmount, error: err?.message });
        failed = true;
        break;
      }
    }

    if (failed) {
      for (const walletId of deducted) {
        try { await refundBet(walletId, betAmount); } catch (err: any) {
          logger.error('[startGame] Refund failed — manual intervention required', { walletId, betAmount, gameId, err: err?.message });
        }
      }
      for (const player of players) {
        if (!player.is_bot) {
          io.to(`user:${player.userId}`).emit('queue:error', { message: 'Não foi possível iniciar a partida. Saldo insuficiente de um jogador.' });
        }
      }
      return;
    }
  }

  const playerData = players.map((p) => ({
    userId: p.userId,
    team: p.team,
    seat: p.seat,
    isBot: p.is_bot,
  }));

  const state = initGame(gameId, variant, playerData);
  activeGames.set(gameId, state);
  gameStateSeq.set(gameId, 0);

  // Initialise replay record with starting deal
  gameReplays.set(gameId, {
    gameId,
    variant,
    initialDeal: state.players.map((p) => ({ userId: p.userId, hand: p.hand })),
    initialBoneyard: [...state.boneyard],
    moves: [],
  });

  try {
    await prisma.game.update({ where: { id: gameId }, data: { status: 'PLAYING', started_at: new Date() } });
  } catch (err: any) {
    logger.warn('[startGame] Failed to mark game as PLAYING in DB', { gameId, err: err?.message });
  }

  broadcastGameState(gameId, state, io);
  startTurnTimer(gameId, state, io);
  scheduleBotTurn(gameId, state, io);

  const playerIds = playerData.map((p) => p.userId);
  logger.info('Game started', { gameId, players: playerIds });

  // GPS proximity check — flag matched players who are physically co-located
  const humanIds = playerData.filter((p) => !p.isBot).map((p) => p.userId);
  if (humanIds.length >= 2) {
    checkGpsProximity(humanIds, gameId).catch((err) =>
      logger.error('[AntifrAud] GPS proximity check failed', { gameId, err: err.message })
    );
  }

  matchLogger.info('match_start', {
    event: 'match_start',
    matchId: gameId,
    variant,
    betAmount,
    mode: players[0]?.mode,
    players: playerData.map((p) => ({ userId: p.userId, team: p.team, seat: p.seat, isBot: p.isBot })),
  });
}

function startTurnTimer(gameId: string, state: GameState, io: SocketServer, overrideMs?: number) {
  clearTurnTimer(gameId);
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.isBot) return;

  // Don't start the timer if the current player is currently in their
  // disconnect grace window — the match is paused until they're back or
  // the forfeit fires.
  const disconnectedSet = disconnectedInGame.get(gameId);
  if (disconnectedSet?.has(currentPlayer.userId)) return;

  const fullTimeoutMs = config.game.turnTimeoutSeconds * 1000;
  const timeoutMs = Math.max(1000, overrideMs ?? fullTimeoutMs);

  const timer = setTimeout(() => {
    const currentState = activeGames.get(gameId);
    if (!currentState || currentState.status !== 'playing') return;

    // Auto-play on timeout instead of auto-pass
    const timedOutIndex = currentState.currentPlayerIndex;
    const move = getBotMove(currentState, timedOutIndex);

    let newState: GameState;
    if (move.action === 'play' && move.tile && move.side) {
      newState = applyMove(currentState, timedOutIndex, move.tile, move.side, move.flipped ?? false);
      recordMove(gameId, {
        type: 'play',
        userId: currentPlayer.userId,
        playerIndex: timedOutIndex,
        timestamp: Date.now(),
        tile: move.tile,
        side: move.side,
        flipped: move.flipped ?? false,
      });
    } else if (move.action === 'draw') {
      newState = drawFromBoneyard(currentState, timedOutIndex);
      recordMove(gameId, {
        type: 'draw',
        userId: currentPlayer.userId,
        playerIndex: timedOutIndex,
        timestamp: Date.now(),
      });
      activeGames.set(gameId, newState);
      broadcastGameState(gameId, newState, io);
      startTurnTimer(gameId, newState, io);
      return;
    } else {
      newState = applyPass(currentState, timedOutIndex);
      recordMove(gameId, {
        type: 'pass',
        userId: currentPlayer.userId,
        playerIndex: timedOutIndex,
        timestamp: Date.now(),
      });
    }

    activeGames.set(gameId, newState);

    broadcastGameState(gameId, newState, io);
    io.to(`game:${gameId}`).emit('game:timeout', { userId: currentPlayer.userId });

    if (newState.status === 'finished') {
      handleGameEnd(gameId, newState, io);
    } else {
      startTurnTimer(gameId, newState, io);
      scheduleBotTurn(gameId, newState, io);
    }
  }, timeoutMs);

  turnTimers.set(gameId, timer);
}

function clearTurnTimer(gameId: string) {
  const timer = turnTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(gameId);
  }
}

function scheduleBotTurn(gameId: string, state: GameState, io: SocketServer) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer.isBot || state.status !== 'playing') return;

  // Bot thinks for 1-3 seconds
  const thinkTime = 1000 + Math.random() * 2000;
  setTimeout(() => {
    const currentState = activeGames.get(gameId);
    if (!currentState || currentState.status !== 'playing') return;

    const botIndex = currentState.currentPlayerIndex;
    const move = getBotMove(currentState, botIndex);

    const botPlayer = currentState.players[botIndex];
    let newState: GameState;
    if (move.action === 'play' && move.tile && move.side) {
      newState = applyMove(currentState, botIndex, move.tile, move.side, move.flipped ?? false);
      recordMove(gameId, {
        type: 'play',
        userId: botPlayer.userId,
        playerIndex: botIndex,
        timestamp: Date.now(),
        tile: move.tile,
        side: move.side,
        flipped: move.flipped ?? false,
      });
    } else if (move.action === 'draw') {
      newState = drawFromBoneyard(currentState, botIndex);
      recordMove(gameId, {
        type: 'draw',
        userId: botPlayer.userId,
        playerIndex: botIndex,
        timestamp: Date.now(),
      });
      activeGames.set(gameId, newState);
      broadcastGameState(gameId, newState, io);
      scheduleBotTurn(gameId, newState, io);
      return;
    } else {
      newState = applyPass(currentState, botIndex);
      recordMove(gameId, {
        type: 'pass',
        userId: botPlayer.userId,
        playerIndex: botIndex,
        timestamp: Date.now(),
      });
    }

    activeGames.set(gameId, newState);
    broadcastGameState(gameId, newState, io);

    if (newState.status === 'finished') {
      handleGameEnd(gameId, newState, io);
    } else {
      startTurnTimer(gameId, newState, io);
      scheduleBotTurn(gameId, newState, io);
    }
  }, thinkTime);
}

async function handleGameEnd(
  gameId: string,
  state: GameState,
  io: SocketServer,
  opts?: { status?: 'FINISHED' | 'ABANDONED' }
) {
  clearTurnTimer(gameId);

  let game: any = null;
  try {
    game = await prisma.game.findUnique({ where: { id: gameId } });
  } catch {
    game = null;
  }

  // Fallback to the in-memory volatile match if the DB row is missing — otherwise
  // finalizeMatch is skipped and the winner never gets credited (R$ 0,00 payout).
  if (!game) {
    const v = volatileMatches.get(gameId);
    if (v) {
      game = {
        id: v.gameId,
        mode: v.mode,
        bet_amount: v.betAmount,
        prize_pool: 0, // finalizeMatch will recompute from bet_amount
        tournamentId: null,
      };
      logger.warn('[handleGameEnd] DB game missing — using volatile match for finalize', { gameId });
    }
  }

  // ── Forfeit / Abandoned — end match immediately ──────────────────────────
  if (opts?.status === 'ABANDONED') {
    activeGames.delete(gameId);
    gameStateSeq.delete(gameId);
    disconnectedInGame.delete(gameId);
    pausedTurnRemainingMs.delete(gameId);
    pendingRoundResults.delete(gameId);
    if (game) {
      await finalizeMatch(gameId, state, game, io, 'ABANDONED');
    }
    return;
  }

  // ── Round ended — check if match is over ─────────────────────────────────
  const winType   = state.winType ?? 'simples';
  const points    = state.winnerTeam ? (WIN_POINTS[winType] ?? 1) : 0;
  const matchOver = !!state.matchWinnerTeam;

  // Pip totals per team — surfaced so blocked-game outcomes can be explained on the client.
  const teamPips: Record<number, number> = { 1: 0, 2: 0 };
  for (const p of state.players) {
    let pips = p.hand.reduce((sum, t) => sum + t[0] + t[1], 0);
    if (state.variant === 'L_E_L') {
      pips += p.hand.filter((t) => t[0] === t[1]).reduce((s, t) => s + t[0] + t[1], 0);
    }
    teamPips[p.team] = (teamPips[p.team] || 0) + pips;
  }
  const blocked = state.players.every((p) => p.hand.length > 0);

  // Notify clients of round result
  const roundEndedPayload = {
    roundNumber:     state.roundNumber,
    winnerTeam:      state.winnerTeam ?? null,
    winnerId:        state.winnerId ?? null,
    winType,
    points,
    matchScores:     state.matchScores,
    targetScore:     state.targetScore,
    matchOver,
    matchWinnerTeam: state.matchWinnerTeam ?? null,
    blocked,
    teamPips,
  };
  // Store so reconnecting players in the 4s inter-round pause can receive it
  if (!matchOver) pendingRoundResults.set(gameId, roundEndedPayload);
  io.to(`game:${gameId}`).emit('game:round_ended', roundEndedPayload);

  logger.info('Round ended', {
    gameId,
    round: state.roundNumber,
    winType,
    points,
    matchScores: state.matchScores,
    matchOver,
  });

  matchLogger.info('round_end', {
    event: 'round_end',
    matchId: gameId,
    round: state.roundNumber,
    winnerTeam: state.winnerTeam ?? null,
    winnerId: state.winnerId ?? null,
    winType,
    points,
    matchScores: state.matchScores,
    matchOver,
  });

  if (matchOver) {
    // Match is over — pay out and close the DB game
    activeGames.delete(gameId);
    gameStateSeq.delete(gameId);
    disconnectedInGame.delete(gameId);
    pausedTurnRemainingMs.delete(gameId);
    pendingRoundResults.delete(gameId);
    if (game) {
      await finalizeMatch(gameId, state, game, io, 'FINISHED');
    }
  } else {
    // Start next round after a 4-second pause (client shows round banner)
    setTimeout(() => {
      // CRITICAL FIX: Get FRESH state from activeGames, NOT the stale closure variable
      const freshState = activeGames.get(gameId);
      if (!freshState) return;
      pendingRoundResults.delete(gameId); // inter-round pause is over
      const nextState = initNextRound(freshState);
      activeGames.set(gameId, nextState);
      broadcastGameState(gameId, nextState, io);
      startTurnTimer(gameId, nextState, io);
      scheduleBotTurn(gameId, nextState, io);
    }, 4000);
  }
}

async function finalizeMatch(
  gameId: string,
  state: GameState,
  game: { prize_pool: number | any; mode: string; bet_amount: number | any; tournamentId: string | null },
  io: SocketServer,
  status: 'FINISHED' | 'ABANDONED'
) {
  const betAmount  = Number(game.bet_amount) || 0;
  let   prizePool  = Number(game.prize_pool);

  // Defensive fallback: if the stored prize_pool is missing/NaN/0 but the match
  // was paid, recompute from bet_amount so the winner is still credited. Prevents
  // R$ 0,00 payouts caused by stale rows or Decimal serialization quirks.
  if ((!Number.isFinite(prizePool) || prizePool <= 0) && betAmount > 0) {
    const houseEdge = await getHouseEdgePercent().catch(() => 0);
    prizePool = betAmount * state.players.length * (1 - houseEdge / 100);
    logger.warn('[finalizeMatch] prize_pool missing/zero — recomputed from bet', {
      gameId, betAmount, players: state.players.length, houseEdge, prizePool,
    });
  }

  // The overall match winner is whoever reached the target (or the team that didn't forfeit)
  const matchWinnerTeam = state.matchWinnerTeam ?? state.winnerTeam;
  const winningPlayers  = matchWinnerTeam
    ? state.players.filter((p) => p.team === matchWinnerTeam && !p.isBot)
    : [];

  const prizePerWinner = winningPlayers.length > 0 ? prizePool / winningPlayers.length : 0;

  for (const winner of winningPlayers) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: winner.userId } });
    if (wallet && prizePerWinner > 0) {
      await creditWin(wallet.id, prizePerWinner);
      logger.info('[finalizeMatch] credited winner', { gameId, userId: winner.userId, amount: prizePerWinner });
    } else if (!wallet) {
      logger.warn('[finalizeMatch] winner has no wallet — skipping credit', { gameId, userId: winner.userId });
    }
  }

  const replay = gameReplays.get(gameId) ?? null;
  gameReplays.delete(gameId);

  try {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status,
        winner_id:    state.winnerId    || null,
        winning_team: matchWinnerTeam   || null,
        finished_at:  new Date(),
        replay_data:  replay as any,
      },
    });

    for (const player of state.players) {
      const pips = player.hand.reduce((s, t) => s + t[0] + t[1], 0);
      await prisma.gamePlayer.updateMany({
        where: { gameId, userId: player.userId },
        data: { final_score: pips },
      });
    }
  } catch (err: any) {
    // Volatile / missing DB rows shouldn't block the wallet credit or the game:ended emit.
    logger.warn('[finalizeMatch] DB write skipped', { gameId, err: err?.message });
  }

  // Update partner-cooldown counters for 2v2 modes
  if (game.mode.includes('2V2')) {
    updatePartnerCooldownsAfterGame(
      game.mode,
      state.players.map((p) => ({ userId: p.userId, team: p.team, isBot: p.isBot ?? false }))
    ).catch((err) => logger.error('[Cooldown] Update failed', { gameId, err: err.message }));
  }

  io.to(`game:${gameId}`).emit('game:ended', {
    status,
    mode:          game.mode,
    betAmount:     Number(game.bet_amount),
    winnerId:      state.winnerId,
    winnerTeam:    matchWinnerTeam,
    matchScores:   state.matchScores,
    prizePool,
    prizePerWinner,
    players: state.players.map((p) => ({
      userId: p.userId,
      team:   p.team,
      finalHand: p.hand,
      pips: p.hand.reduce((s, t) => s + t[0] + t[1], 0),
    })),
  });

  const totalMoves = replay?.moves.length ?? 0;
  logger.info('Match ended', { gameId, matchWinnerTeam, prizePerWinner, matchScores: state.matchScores });

  // Flush move-timing data and update bot scores for all human players
  const timings = flushMoveTimings(gameId);
  for (const [userId, intervals] of timings) {
    updateBotScore(gameId, userId, intervals).catch((err) =>
      logger.error('[AntifrAud] Bot score update failed', { gameId, userId, err: err.message })
    );
  }

  // Award league points to human players (only for paid lobbies >= R$5)
  if (status === 'FINISHED') {
    for (const player of state.players.filter((p) => !p.isBot)) {
      const isWinner = matchWinnerTeam !== undefined && matchWinnerTeam !== null && player.team === matchWinnerTeam;
      awardMatchPoints(player.userId, Number(game.bet_amount), !!isWinner).catch(() => {});
    }
  }

  matchLogger.info('match_end', {
    event: 'match_end',
    matchId: gameId,
    status,
    mode: game.mode,
    betAmount: game.bet_amount,
    prizePool,
    prizePerWinner,
    matchWinnerTeam: matchWinnerTeam ?? null,
    winnerId: state.winnerId ?? null,
    matchScores: state.matchScores,
    rounds: state.roundNumber,
    totalMoves,
    players: state.players.map((p) => ({
      userId: p.userId,
      team: p.team,
      isBot: p.isBot,
      pips: p.hand.reduce((s, t) => s + t[0] + t[1], 0),
    })),
  });

  if (game.tournamentId) {
    advanceTournamentBracket(game.tournamentId, gameId, state.winnerId, matchWinnerTeam).catch((err) => {
      logger.error('[Tournament] Failed to advance bracket', { tournamentId: game.tournamentId, gameId, err: err.message });
    });
  }
}

/** Admin helper: force-end a game by making losingUserId lose, bypassing the bot guard. */
export async function adminForceEnd(gameId: string, losingUserId: string): Promise<void> {
  const io = _gameIo;
  if (!io) throw new Error('Socket server not initialised');

  const state = activeGames.get(gameId);
  if (!state || state.status !== 'playing') throw new Error('Game not active');

  const loser = state.players.find((p) => p.userId === losingUserId);
  if (!loser) throw new Error('Player not found in game');

  const winnerTeam = loser.team === 1 ? 2 : 1;
  const winner = state.players.find((p) => p.team === winnerTeam && !p.isBot)
    ?? state.players.find((p) => p.team === winnerTeam);

  const newState: GameState = {
    ...state,
    status: 'finished',
    winnerTeam,
    matchWinnerTeam: winnerTeam,
    winnerId: winner?.userId,
  };
  activeGames.set(gameId, newState);

  io.to(`game:${gameId}`).emit('game:forfeit', {
    forfeitedUserId: losingUserId,
    reason: 'leave',
    winnerId: winner?.userId,
    winnerTeam,
  });

  await handleGameEnd(gameId, newState, io, { status: 'ABANDONED' });
}

// In a 2v2 game, replace a disconnected/leaving human player with a bot so the
// match can continue instead of forfeiting. This prevents three friends from
// exploiting a 2v2 table by having one quit to hand the game to their team.
function replaceWithBot(gameId: string, leavingUserId: string, io: SocketServer) {
  const state = activeGames.get(gameId);
  if (!state || state.status !== 'playing') return false;

  const playerIndex = state.players.findIndex((p) => p.userId === leavingUserId);
  if (playerIndex === -1) return false;

  const botUserId = `bot_sub_${leavingUserId.slice(0, 8)}`;
  const newPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, userId: botUserId, isBot: true } : p
  );
  const newState: GameState = { ...state, players: newPlayers };
  activeGames.set(gameId, newState);

  io.to(`game:${gameId}`).emit('game:bot_substitution', {
    replacedUserId: leavingUserId,
    botUserId,
  });

  logger.info('Player replaced by bot in 2v2', { gameId, leavingUserId, botUserId });

  // If it was this player's turn, hand it to the bot immediately
  clearTurnTimer(gameId);
  scheduleBotTurn(gameId, newState, io);
  if (newState.players[newState.currentPlayerIndex].userId !== botUserId) {
    startTurnTimer(gameId, newState, io);
  }

  return true;
}

async function forfeitGame(gameId: string, forfeitingUserId: string, io: SocketServer, reason: 'leave' | 'disconnect') {
  const state = activeGames.get(gameId);
  if (!state || state.status !== 'playing') return;

  const forfeitingPlayer = state.players.find((p) => p.userId === forfeitingUserId);
  if (!forfeitingPlayer || forfeitingPlayer.isBot) return;

  // In 2v2, replace the leaving player with a bot instead of ending the match
  if (state.players.length >= 4) {
    replaceWithBot(gameId, forfeitingUserId, io);
    return;
  }

  const winnerTeam = forfeitingPlayer.team === 1 ? 2 : 1;
  const winner = state.players.find((p) => p.team === winnerTeam && !p.isBot) ?? state.players.find((p) => p.team === winnerTeam);
  const newState: GameState = {
    ...state,
    status: 'finished',
    winnerTeam,
    winnerId: winner?.userId,
  };

  activeGames.set(gameId, newState);

  io.to(`game:${gameId}`).emit('game:forfeit', {
    forfeitedUserId: forfeitingUserId,
    reason,
    winnerId: newState.winnerId,
    winnerTeam: newState.winnerTeam,
  });

  logger.info('Game forfeited', { gameId, forfeitingUserId, reason });

  await handleGameEnd(gameId, newState, io, { status: 'ABANDONED' });
}
