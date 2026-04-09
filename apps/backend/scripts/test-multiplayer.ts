/**
 * DominoClub — Multi-user integration test script
 *
 * Simulates two human players going through the full flow:
 *   dev-login → socket connect → queue:join → game:found → game:join → auto-play → game:ended
 *
 * Usage:
 *   npx ts-node scripts/test-multiplayer.ts
 *   API_URL=http://localhost:3000 npx ts-node scripts/test-multiplayer.ts
 *
 * Requirements:
 *   - Backend running with NODE_ENV=development (enables /auth/dev/login)
 *   - At least two dev users seeded (the endpoint creates them on demand)
 */

import { io as SocketClient, Socket } from 'socket.io-client';
import axios from 'axios';

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL    = process.env.API_URL    || 'http://localhost:3001/api/v1';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3001';
const BET_AMOUNT = Number(process.env.BET_AMOUNT ?? 0);
const VARIANT    = process.env.VARIANT    || 'CARROCA';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 300_000); // 5 minutes max

// ─── Types (mirror the engine) ────────────────────────────────────────────────

type Tile = [number, number] | null;
type Side = 'left' | 'right' | 'top' | 'bottom';

interface PlayerView {
  userId: string;
  team: number;
  hand: Tile[];
}

interface GameStateView {
  id: string;
  variant: string;
  status: string;
  players: PlayerView[];
  leftOpen: number;
  rightOpen: number;
  topOpen?: number;
  bottomOpen?: number;
  currentPlayerIndex: number;
  firstPlayMade: boolean;
  boneyard: null[]; // tiles hidden; length = count
  matchScores: Record<number, number>;
  roundNumber: number;
  targetScore: number;
  seq: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(prefix: string, msg: string, data?: any) {
  const time = new Date().toISOString().substring(11, 23);
  const extra = data ? `  ${JSON.stringify(data)}` : '';
  console.log(`[${time}] [${prefix}] ${msg}${extra}`);
}

async function devLogin(label: string, index: number): Promise<{ token: string; userId: string; name: string }> {
  // Use distinct phone numbers per player so they get distinct user records
  const phone = `+5599000000${String(index).padStart(2, '0')}`;
  const res = await axios.post(`${API_URL}/auth/dev/login`, { phone, name: `Test Player ${index}` });
  const { accessToken, user } = res.data;
  log(label, `Logged in as ${user.name} (${user.id.slice(0, 8)}…)`);
  return { token: accessToken, userId: user.id, name: user.name };
}

function connectSocket(label: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = SocketClient(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.once('connect', () => {
      log(label, `Socket connected (${socket.id})`);
      resolve(socket);
    });
    socket.once('connect_error', (err) => reject(err));
  });
}

/**
 * Determines the best move for a player given the current game state.
 * Replicates the core of canPlayTile from the engine (client side).
 */
function pickMove(
  state: GameStateView,
  myIndex: number
): { type: 'play'; tile: Tile; side: Side; flipped: boolean } | { type: 'draw' } | { type: 'pass' } | null {
  if (state.currentPlayerIndex !== myIndex) return null;
  if (state.status !== 'playing') return null;

  const hand = state.players[myIndex].hand.filter((t): t is [number, number] => t !== null);

  if (!state.firstPlayMade) {
    // First move — play any tile on the left side
    if (hand.length === 0) return { type: 'pass' };
    return { type: 'play', tile: hand[0], side: 'left', flipped: false };
  }

  const openEnds: Array<{ side: Side; value: number }> = [];
  if (state.leftOpen  >= 0) openEnds.push({ side: 'left',   value: state.leftOpen });
  if (state.rightOpen >= 0) openEnds.push({ side: 'right',  value: state.rightOpen });
  if (state.topOpen    != null) openEnds.push({ side: 'top',    value: state.topOpen });
  if (state.bottomOpen != null) openEnds.push({ side: 'bottom', value: state.bottomOpen });

  for (const tile of hand) {
    for (const end of openEnds) {
      // Mirror the engine's canPlayTile logic (side-dependent flipping)
      const isLeftLike = end.side === 'left' || end.side === 'top';
      if (isLeftLike) {
        if (tile[1] === end.value) return { type: 'play', tile, side: end.side, flipped: false };
        if (tile[0] === end.value && tile[0] !== tile[1]) return { type: 'play', tile, side: end.side, flipped: true };
      } else {
        if (tile[0] === end.value) return { type: 'play', tile, side: end.side, flipped: false };
        if (tile[1] === end.value && tile[0] !== tile[1]) return { type: 'play', tile, side: end.side, flipped: true };
      }
    }
  }

  // No match — draw if possible
  if (state.boneyard.length > 0) return { type: 'draw' };

  return { type: 'pass' };
}

// ─── Player session ───────────────────────────────────────────────────────────

interface PlayerSession {
  label: string;
  userId: string;
  token: string;
  socket: Socket;
  myIndex: number;
  gameId: string | null;
  lastSeq: number;
  movesPlayed: number;
}

function createSession(label: string, userId: string, token: string, socket: Socket): PlayerSession {
  return { label, userId, token, socket, myIndex: -1, gameId: null, lastSeq: -1, movesPlayed: 0 };
}

function waitForEvent<T = any>(socket: Socket, event: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function playNextMove(session: PlayerSession, state: GameStateView) {
  const move = pickMove(state, session.myIndex);
  if (!move) return; // not my turn

  log(session.label, `Turn — playing move`, { type: move.type, seq: state.seq });

  if (move.type === 'play') {
    session.socket.emit('game:move', {
      gameId: session.gameId,
      tile: move.tile,
      side: move.side,
      flipped: move.flipped,
    });
    session.movesPlayed++;
  } else if (move.type === 'draw') {
    session.socket.emit('game:draw', { gameId: session.gameId });
  } else {
    session.socket.emit('game:pass', { gameId: session.gameId });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  DominoClub — Multi-user integration test ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  API:     ${API_URL}`);
  console.log(`  Socket:  ${SOCKET_URL}`);
  console.log(`  Bet:     R$ ${BET_AMOUNT}`);
  console.log(`  Variant: ${VARIANT}`);
  console.log('');

  // 1. Login both players
  const [p1data, p2data] = await Promise.all([
    devLogin('P1', 1),
    devLogin('P2', 2),
  ]);

  // 2. Connect sockets
  const [s1, s2] = await Promise.all([
    connectSocket('P1', p1data.token),
    connectSocket('P2', p2data.token),
  ]);

  const p1 = createSession('P1', p1data.userId, p1data.token, s1);
  const p2 = createSession('P2', p2data.userId, p2data.token, s2);

  // 3. Both join queue simultaneously
  const joinQueue = (session: PlayerSession) => {
    session.socket.emit('queue:join', {
      mode: 'ARENA_1V1',
      betAmount: BET_AMOUNT,
      variant: VARIANT,
    });
    log(session.label, 'Joined queue', { mode: 'ARENA_1V1', betAmount: BET_AMOUNT, variant: VARIANT });
  };

  joinQueue(p1);
  joinQueue(p2);

  // 4. Wait for game:found on both
  log('TEST', 'Waiting for match…');
  const [found1, found2] = await Promise.all([
    waitForEvent<{ gameId: string }>(s1, 'game:found'),
    waitForEvent<{ gameId: string }>(s2, 'game:found'),
  ]);

  if (found1.gameId !== found2.gameId) {
    throw new Error(`Players matched into different games! ${found1.gameId} vs ${found2.gameId}`);
  }
  const gameId = found1.gameId;
  p1.gameId = gameId;
  p2.gameId = gameId;

  log('TEST', `Match found — gameId: ${gameId}`);

  // 5. Both join the game room
  s1.emit('game:join', { gameId });
  s2.emit('game:join', { gameId });

  // 6. Play the game — auto-play on game:state events
  const gameResult = await new Promise<{ session: PlayerSession; data: any }>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Game did not finish within timeout')), TIMEOUT_MS);

    const handleError = (session: PlayerSession) => (err: { message: string }) => {
      log(session.label, `ERROR: ${err.message}`);
      // Don't reject — errors like 'Not your turn' are ignorable race conditions
    };

    const handleState = (session: PlayerSession) => (state: GameStateView) => {
      // Ignore stale events
      if (state.seq <= session.lastSeq) return;
      session.lastSeq = state.seq;

      if (session.myIndex === -1) {
        session.myIndex = state.players.findIndex((p) => p.userId === session.userId);
      }

      log(session.label, `State seq=${state.seq} round=${state.roundNumber} scores=${JSON.stringify(state.matchScores)} currentPlayer=${state.currentPlayerIndex}`);
      playNextMove(session, state);
    };

    const handleRoundEnd = (session: PlayerSession) => (data: any) => {
      log(session.label, 'Round ended', {
        round: data.roundNumber,
        winType: data.winType,
        points: data.points,
        matchScores: data.matchScores,
        matchOver: data.matchOver,
      });
    };

    const handleGameEnd = (session: PlayerSession) => (data: any) => {
      clearTimeout(deadline);
      log(session.label, 'Game ended!', {
        status: data.status,
        winnerTeam: data.winnerTeam,
        matchScores: data.matchScores,
        prizePerWinner: data.prizePerWinner,
      });
      resolve({ session, data });
    };

    for (const session of [p1, p2]) {
      session.socket.on('game:state', handleState(session));
      session.socket.on('game:error', handleError(session));
      session.socket.on('game:round_ended', handleRoundEnd(session));
      session.socket.once('game:ended', handleGameEnd(session));
      session.socket.once('game:forfeit', (data) => {
        log(session.label, 'Forfeit received', data);
        clearTimeout(deadline);
        resolve({ session, data });
      });
    }
  });

  // 7. Print result
  console.log('');
  console.log('══════════════ RESULT ══════════════');
  console.log(`  Status:      ${gameResult.data.status}`);
  console.log(`  WinnerTeam:  ${gameResult.data.winnerTeam ?? 'n/a'}`);
  console.log(`  MatchScores: ${JSON.stringify(gameResult.data.matchScores ?? {})}`);
  console.log(`  PrizePool:   R$ ${gameResult.data.prizePool ?? 0}`);
  console.log(`  P1 moves:    ${p1.movesPlayed}`);
  console.log(`  P2 moves:    ${p2.movesPlayed}`);
  console.log('════════════════════════════════════');
  console.log('');

  s1.disconnect();
  s2.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
