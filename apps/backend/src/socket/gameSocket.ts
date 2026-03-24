import { Server as SocketServer, Socket } from 'socket.io';
import { prisma } from '../services/prisma.service';
import { deductBet, creditWin } from '../services/wallet.service';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  GameState,
  initGame,
  applyMove,
  applyPass,
  drawFromBoneyard,
  getValidMoves,
  getBotMove,
  DominoVariant,
} from '../game/domino.engine';

export const activeGames = new Map<string, GameState>();
const turnTimers = new Map<string, NodeJS.Timeout>();

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

export function setupGameSocket(socket: Socket, io: SocketServer, user: { id: string; name: string; avatar: string | null }) {
  // Join game room
  socket.on('game:join', async ({ gameId }: { gameId: string }) => {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
    });

    if (!game) {
      socket.emit('game:error', { message: 'Game not found' });
      return;
    }

    const isPlayer = game.players.some((p) => p.userId === user.id);
    if (!isPlayer) {
      socket.emit('game:error', { message: 'You are not in this game' });
      return;
    }

    socket.join(`game:${gameId}`);

    // Update connected status
    await prisma.gamePlayer.updateMany({
      where: { gameId, userId: user.id },
      data: { connected: true },
    });

    // Initialize game state if not already active
    if (!activeGames.has(gameId)) {
      const allReady = game.players.every((p) => !p.is_bot);
      if (game.players.length === game.players.filter((p) => !p.is_bot).length) {
        // Start game
        await startGame(gameId, game.variant as DominoVariant, game.players, game.bet_amount, io);
      }
    } else {
      // Send current state to rejoining player
      const state = activeGames.get(gameId)!;
      const playerState = getPlayerView(state, user.id);
      socket.emit('game:state', playerState);
    }
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

  socket.on('game:leave', async ({ gameId }: { gameId: string }) => {
    socket.leave(`game:${gameId}`);
    await prisma.gamePlayer.updateMany({
      where: { gameId, userId: user.id },
      data: { connected: false },
    });
  });
}

async function startGame(gameId: string, variant: DominoVariant, players: any[], betAmount: number, io: SocketServer) {
  // Deduct bets
  for (const player of players) {
    if (!player.is_bot) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: player.userId } });
      if (wallet) {
        await deductBet(wallet.id, betAmount);
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

  // Initialise replay record with starting deal
  gameReplays.set(gameId, {
    gameId,
    variant,
    initialDeal: state.players.map((p) => ({ userId: p.userId, hand: p.hand })),
    initialBoneyard: [...state.boneyard],
    moves: [],
  });

  await prisma.game.update({ where: { id: gameId }, data: { status: 'PLAYING' } });

  broadcastGameState(gameId, state, io);
  startTurnTimer(gameId, state, io);
  scheduleBotTurn(gameId, state, io);

  logger.info('Game started', { gameId, players: playerData.map((p) => p.userId) });
}

function getPlayerView(state: GameState, userId: string): any {
  const playerIndex = state.players.findIndex((p) => p.userId === userId);
  return {
    ...state,
    players: state.players.map((p, i) => ({
      ...p,
      hand: i === playerIndex ? p.hand : p.hand.map(() => null), // hide other hands
    })),
    boneyard: state.boneyard.map(() => null), // hide boneyard tiles
  };
}

function broadcastGameState(gameId: string, state: GameState, io: SocketServer) {
  state.players.forEach((player) => {
    const view = getPlayerView(state, player.userId);
    io.to(`user:${player.userId}`).emit('game:state', view);
  });
}

function startTurnTimer(gameId: string, state: GameState, io: SocketServer) {
  clearTurnTimer(gameId);
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.isBot) return;

  const timer = setTimeout(() => {
    const currentState = activeGames.get(gameId);
    if (!currentState || currentState.status !== 'playing') return;

    // Auto-pass on timeout
    const timedOutIndex = currentState.currentPlayerIndex;
    const newState = applyPass(currentState, timedOutIndex);
    activeGames.set(gameId, newState);

    recordMove(gameId, {
      type: 'timeout',
      userId: currentPlayer.userId,
      playerIndex: timedOutIndex,
      timestamp: Date.now(),
    });

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

async function handleGameEnd(gameId: string, state: GameState, io: SocketServer) {
  clearTurnTimer(gameId);
  activeGames.delete(gameId);

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return;

  const prizePool = game.prize_pool;

  // Determine winning players
  const winningPlayers = state.winnerTeam
    ? state.players.filter((p) => p.team === state.winnerTeam && !p.isBot)
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
      status: 'FINISHED',
      winner_id: state.winnerId || null,
      winning_team: state.winnerTeam || null,
      finished_at: new Date(),
      replay_data: replay as any,
    },
  });

  // Update player scores
  for (const player of state.players) {
    const pips = player.hand.reduce((s, t) => s + t[0] + t[1], 0);
    await prisma.gamePlayer.updateMany({
      where: { gameId, userId: player.userId },
      data: { final_score: pips },
    });
  }

  io.to(`game:${gameId}`).emit('game:ended', {
    winnerId: state.winnerId,
    winnerTeam: state.winnerTeam,
    prizePool,
    prizePerWinner,
    players: state.players.map((p) => ({
      userId: p.userId,
      team: p.team,
      finalHand: p.hand,
      pips: p.hand.reduce((s, t) => s + t[0] + t[1], 0),
    })),
  });

  logger.info('Game ended', { gameId, winnerId: state.winnerId, winnerTeam: state.winnerTeam });
}
