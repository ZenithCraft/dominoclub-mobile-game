import { Server as SocketServer, Socket } from 'socket.io';
import { prisma } from '../services/prisma.service';
import { deductBet, creditWin } from '../services/wallet.service';
import { advanceTournamentBracket, setTournamentIo, cancelAndRefundTournament, startTournament } from '../services/tournament.service';
import { config } from '../config';
import { logger, matchLogger } from '../utils/logger';
import { checkGpsProximity, updateBotScore } from '../middleware/antifraud.middleware';
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
import { volatileMatches } from '../services/matchmaking.service';

export const activeGames = new Map<string, GameState>();
const turnTimers = new Map<string, NodeJS.Timeout>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();

// Per-game monotonically increasing sequence counter.
// Included in every game:state emission so clients can discard stale events.
const gameStateSeq = new Map<string, number>();

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

function flushMoveTimings(gameId: string): Map<string, number[]> {
  const result = new Map<string, number[]>();
  const prefix = `${gameId}:`;
  for (const [key, intervals] of playerMoveIntervals) {
    if (key.startsWith(prefix)) {
      result.set(key.slice(prefix.length), intervals);
      playerMoveIntervals.delete(key);
      playerLastMoveAt.delete(key);
    }
  }
  return result;
}

// ─── Tournament auto-cancel scheduler ────────────────────────────────────────

export function initTournamentScheduler(io: SocketServer) {
  setTournamentIo(io);
  const intervalMs = config.env === 'development' ? 2_000 : 60_000;
  setInterval(async () => {
    try {
      const overdue = await prisma.tournament.findMany({
        where: {
          status: { in: ['OPEN', 'FULL'] },
          starts_at: { lte: new Date() },
        },
        select: { id: true, current_players: true },
      });
      for (const t of overdue) {
        if (t.current_players < 2) {
          cancelAndRefundTournament(t.id).catch((e) =>
            logger.error('[Tournament] Auto-cancel failed', { id: t.id, err: e.message })
          );
        } else {
          startTournament(t.id).catch((e) =>
            logger.error('[Tournament] Auto-start failed', { id: t.id, err: e.message })
          );
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
    io.to(`user:${player.userId}`).emit('game:state', { ...view, seq });
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
    if (pending) {
      clearTimeout(pending);
      disconnectTimers.delete(k);
      logger.info('Player reconnected within grace period', { gameId, userId: user.id });
    }

    // Initialize game state if not already active
    if (!activeGames.has(gameId)) {
      await startGame(gameId, game.variant as DominoVariant, game.players, game.bet_amount, io);
    } else {
      // Send current state to rejoining/reconnecting player
      const state = activeGames.get(gameId)!;
      const seq = gameStateSeq.get(gameId) ?? 0;
      const playerState = getPlayerView(state, user.id);
      socket.emit('game:state', { ...playerState, seq });
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
    socket.emit('game:state', { ...view, seq });
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
    recordMove(gameId, {
      type: 'draw',
      userId: user.id,
      playerIndex,
      timestamp: Date.now(),
    });

    broadcastGameState(gameId, newState, io);
    clearTurnTimer(gameId);
    startTurnTimer(gameId, newState, io);
  });

  // Pass turn
  socket.on('game:pass', ({ gameId }: { gameId: string }) => {
    const state = activeGames.get(gameId);
    if (!state || state.status !== 'playing') return;

    const playerIndex = state.players.findIndex((p) => p.userId === user.id);
    if (playerIndex !== state.currentPlayerIndex) return;

    // Can only pass if no valid moves AND boneyard is empty
    const validMoves = getValidMoves(state, playerIndex);
    if (validMoves.length > 0 || state.boneyard.length > 0) {
      socket.emit('game:error', { message: 'Cannot pass — you must play or draw' });
      return;
    }

    const newState = applyPass(state, playerIndex);
    activeGames.set(gameId, newState);
    clearTurnTimer(gameId);

    recordMoveTime(gameId, user.id);
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

  // Player reaction (emoji)
  socket.on('game:emoji', ({ gameId, emoji }: { gameId: string; emoji: string }) => {
    if (!activeGames.has(gameId)) return;
    io.to(`game:${gameId}`).emit('game:emoji', { userId: user.id, emoji, at: Date.now() });
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
      const k = `${gameId}:${user.id}`;
      const t = setTimeout(() => {
        disconnectTimers.delete(k);
        forfeitGame(gameId, user.id, io, 'disconnect').catch(() => {});
      }, config.game.disconnectGraceSeconds * 1000);
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
  // Deduct bets
  if (betAmount > 0) {
    for (const player of players) {
      if (!player.is_bot) {
        try {
          const wallet = await prisma.wallet.findUnique({ where: { userId: player.userId } });
          if (wallet) {
            await deductBet(wallet.id, betAmount);
          }
        } catch {}
      }
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
    await prisma.game.update({ where: { id: gameId }, data: { status: 'PLAYING' } });
  } catch {}

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

function startTurnTimer(gameId: string, state: GameState, io: SocketServer) {
  clearTurnTimer(gameId);
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.isBot) return;

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
  }, config.game.turnTimeoutSeconds * 1000);

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

  // ── Forfeit / Abandoned — end match immediately ──────────────────────────
  if (opts?.status === 'ABANDONED') {
    activeGames.delete(gameId);
    gameStateSeq.delete(gameId);
    if (game) {
      await finalizeMatch(gameId, state, game, io, 'ABANDONED');
    }
    return;
  }

  // ── Round ended — check if match is over ─────────────────────────────────
  const winType   = state.winType ?? 'simples';
  const points    = state.winnerTeam ? (WIN_POINTS[winType] ?? 1) : 0;
  const matchOver = !!state.matchWinnerTeam;

  // Notify clients of round result
  io.to(`game:${gameId}`).emit('game:round_ended', {
    roundNumber:     state.roundNumber,
    winnerTeam:      state.winnerTeam ?? null,
    winnerId:        state.winnerId ?? null,
    winType,
    points,
    matchScores:     state.matchScores,
    targetScore:     state.targetScore,
    matchOver,
    matchWinnerTeam: state.matchWinnerTeam ?? null,
  });

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
    if (game) {
      await finalizeMatch(gameId, state, game, io, 'FINISHED');
    }
  } else {
    // Start next round after a 4-second pause (client shows round banner)
    setTimeout(() => {
      const nextState = initNextRound(state);
      activeGames.set(gameId, nextState);
      broadcastGameState(gameId, nextState, io);
      startTurnTimer(gameId, nextState, io);
      scheduleBotTurn(gameId, nextState, io);
      logger.info('Next round started', { gameId, round: nextState.roundNumber });
    }, 4000);
  }
}

async function finalizeMatch(
  gameId: string,
  state: GameState,
  game: { prize_pool: number; mode: string; bet_amount: number; tournamentId: string | null },
  io: SocketServer,
  status: 'FINISHED' | 'ABANDONED'
) {
  const prizePool = game.prize_pool;

  // The overall match winner is whoever reached 7 pts (or team that didn't forfeit)
  const matchWinnerTeam = state.matchWinnerTeam ?? state.winnerTeam;
  const winningPlayers  = matchWinnerTeam
    ? state.players.filter((p) => p.team === matchWinnerTeam && !p.isBot)
    : [];

  const prizePerWinner = winningPlayers.length > 0 ? prizePool / winningPlayers.length : 0;

  for (const winner of winningPlayers) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: winner.userId } });
    if (wallet) await creditWin(wallet.id, prizePerWinner);
  }

  const replay = gameReplays.get(gameId) ?? null;
  gameReplays.delete(gameId);

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

  io.to(`game:${gameId}`).emit('game:ended', {
    status,
    mode:          game.mode,
    betAmount:     game.bet_amount,
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

async function forfeitGame(gameId: string, forfeitingUserId: string, io: SocketServer, reason: 'leave' | 'disconnect') {
  const state = activeGames.get(gameId);
  if (!state || state.status !== 'playing') return;

  const forfeitingPlayer = state.players.find((p) => p.userId === forfeitingUserId);
  if (!forfeitingPlayer || forfeitingPlayer.isBot) return;

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
