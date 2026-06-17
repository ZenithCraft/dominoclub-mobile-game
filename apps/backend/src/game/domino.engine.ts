import { randomInt } from 'crypto';

// ─────────────────────────────────────────────────────────────────
// DominoClub — Brazilian Domino Engine
//
// Variants (rule sets):
//   CARROCA — standard blocked-game resolution (lower pip total wins, 1 pt)
//   L_E_L   — doubles count double in blocked-game pip totals
//   CRUZADA — reserved; currently plays like CARROCA
//
// Scoring (win types — apply to ALL variants):
//   Simples (1 pt)  — plain win
//   Carroça (2 pts) — winning tile is a double
//   Lá e Lô (3 pts) — winning tile makes both open ends equal
//   Cruzada (4 pts) — winning tile is a double AND both ends equal
//
// First to reach TARGET_SCORE (6) wins the match.
// ─────────────────────────────────────────────────────────────────

export type Tile = [number, number]; // [left, right] pips

export interface PlacedTile {
  tile:    Tile;
  side:    'left' | 'right';
  flipped: boolean; // whether tile was placed right-to-left
}

export type DominoVariant = 'CARROCA' | 'L_E_L' | 'CRUZADA';

export type WinType = 'simples' | 'carroca' | 'lelo' | 'cruzada';

// Points awarded per win type
export const WIN_POINTS: Record<WinType, number> = {
  simples: 1,
  carroca: 2,
  lelo:    3,
  cruzada: 4,
};

export const TARGET_SCORE = 6;

export interface GameState {
  id: string;
  variant: DominoVariant;
  players: PlayerState[];
  board: PlacedTile[];
  boneyard: Tile[];
  leftOpen:  number;   // pip value open on the left end  (-1 = board empty)
  rightOpen: number;   // pip value open on the right end (-1 = board empty)
  currentPlayerIndex: number;
  turnCount: number;
  consecutivePasses: number;
  status: 'waiting' | 'playing' | 'finished';
  winnerId?: string;
  winnerTeam?: number;
  winType?: WinType;       // type of win for the current round
  turnStartedAt?: number;  // timestamp for timeout
  firstPlayMade: boolean;
  requiredFirstTile?: Tile; // the tile that MUST be played first

  // Match tracking — persists across rounds
  matchScores: Record<number, number>; // { 1: pts, 2: pts }
  roundNumber: number;                 // 1-based
  targetScore: number;                 // default 6
  matchWinnerTeam?: number;            // set when match is over
}

export interface PlayerState {
  userId: string;
  team: number; // 1 or 2
  seat: number; // 0-3
  hand: Tile[];
  isBot: boolean;
  connected: boolean;
  passedLastTurn: boolean;
}

// Generate full set of 28 domino tiles
export function generateTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      tiles.push([i, j]);
    }
  }
  return tiles;
}

// Fisher-Yates shuffle
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function initGame(
  gameId: string,
  variant: DominoVariant,
  players: { userId: string; team: number; seat: number; isBot: boolean }[]
): GameState {
  const allTiles = shuffle(generateTiles());
  // FIX: Always 6 tiles per player (consistent with fakeSocket and user requirement)
  const tilesPerPlayer = 6;

  const playerStates: PlayerState[] = players.map((p, i) => ({
    ...p,
    hand: allTiles.slice(i * tilesPerPlayer, (i + 1) * tilesPerPlayer),
    connected: true,
    passedLastTurn: false,
  }));

  const boneyard = allTiles.slice(players.length * tilesPerPlayer);
  console.log(`[INIT GAME] Boneyard: ${boneyard.length}, Hands: ${playerStates.map(p => p.hand.length).join(', ')}`);
  const firstPlayInfo = findFirstPlayer(playerStates);

  return {
    id: gameId,
    variant,
    players: playerStates,
    board: [],
    boneyard,
    leftOpen: -1,
    rightOpen: -1,
    currentPlayerIndex: firstPlayInfo.index,
    turnCount: 0,
    consecutivePasses: 0,
    status: 'playing',
    turnStartedAt: Date.now(),
    firstPlayMade: false,
    requiredFirstTile: firstPlayInfo.tile,
    matchScores: { 1: 0, 2: 0 },
    roundNumber: 1,
    targetScore: TARGET_SCORE,
  };
}

// Find player with highest double (goes first); falls back to highest pip tile
function findFirstPlayer(players: PlayerState[]): { index: number; tile: Tile } {
  let firstPlayerIndex = 0;
  let highestDouble = -1;
  let highestPips = -1;
  let bestDouble: Tile | null = null;
  let bestNormalTile: Tile | null = null;
  let normalPlayerIndex = 0;

  players.forEach((p, idx) => {
    p.hand.forEach((tile) => {
      const pips = tile[0] + tile[1];
      if (tile[0] === tile[1] && tile[0] > highestDouble) {
        highestDouble = tile[0];
        firstPlayerIndex = idx;
        bestDouble = tile;
      }
      if (pips > highestPips) {
        highestPips = pips;
        normalPlayerIndex = idx;
        bestNormalTile = tile;
      }
    });
  });

  if (bestDouble) {
    return { index: firstPlayerIndex, tile: bestDouble };
  }
  return { index: normalPlayerIndex, tile: bestNormalTile! };
}

/**
 * Start a fresh round within an ongoing match.
 * Keeps matchScores, roundNumber+1, players list.
 */
export function initNextRound(state: GameState): GameState {
  const allTiles = shuffle(generateTiles());

  // EMERGENCY FIX: Force 2-player mode for 1v1 games
  // For some reason, players.length might be wrong, so we check both length and actual unique userIds
  const uniquePlayers = state.players.filter((p, i, arr) => arr.findIndex(x => x.userId === p.userId) === i);
  const playerCount = uniquePlayers.length;
  // FIX: Always 6 tiles per player
  const tilesPerPlayer = 6;

  const players: PlayerState[] = uniquePlayers.map((p, i) => {
    const startIdx = i * tilesPerPlayer;
    const endIdx = (i + 1) * tilesPerPlayer;
    const hand = allTiles.slice(startIdx, endIdx);
    return {
      ...p,
      hand,
      connected: p.connected,
      passedLastTurn: false,
    };
  });

  const boneyard = allTiles.slice(playerCount * tilesPerPlayer);
  const firstPlayInfo = findFirstPlayer(players);

  return {
    id: state.id,
    variant: state.variant,
    players,
    board: [],
    boneyard,
    leftOpen: -1,
    rightOpen: -1,
    currentPlayerIndex: firstPlayInfo.index,
    turnCount: 0,
    consecutivePasses: 0,
    status: 'playing',
    turnStartedAt: Date.now(),
    firstPlayMade: false,
    requiredFirstTile: firstPlayInfo.tile,
    matchScores: { ...state.matchScores },
    roundNumber: state.roundNumber + 1,
    targetScore: state.targetScore,
    winType: undefined,
    winnerId: undefined,
    winnerTeam: undefined,
    matchWinnerTeam: undefined,
  };
}

/**
 * Detect the win type based on the FINAL board state after the last tile is placed.
 *
 * Rules (Brazilian domino scoring):
 *  - Cruzada  (4 pts): last tile is a double AND both open ends are equal after placement
 *  - Lá e Lô  (3 pts): last tile is NOT a double AND both open ends are equal after placement
 *  - Carroça  (2 pts): last tile is a double
 *  - Simples  (1 pt) : plain win
 *
 * NOTE: leftOpen / rightOpen must be the POST-MOVE values.
 */
function detectWinType(
  tile: Tile,
  leftOpen: number,
  rightOpen: number,
  boardWasEmpty: boolean
): WinType {
  if (boardWasEmpty) return 'simples'; // only tile on the board — no end conditions to check
  const isDouble     = tile[0] === tile[1];
  const bothEndsEqual = leftOpen === rightOpen;
  if (isDouble && bothEndsEqual) return 'cruzada';
  if (isDouble)                  return 'carroca';
  if (bothEndsEqual)             return 'lelo';
  return 'simples';
}

export function canPlayTile(state: GameState, tile: Tile): { side: 'left' | 'right'; flipped: boolean }[] {
  if (!state.firstPlayMade) {
    // If there is a required first tile, only that tile can be played
    if (state.requiredFirstTile) {
      if (
        (tile[0] === state.requiredFirstTile[0] && tile[1] === state.requiredFirstTile[1]) ||
        (tile[0] === state.requiredFirstTile[1] && tile[1] === state.requiredFirstTile[0])
      ) {
        return [{ side: 'left', flipped: false }];
      }
      return [];
    }
    return [{ side: 'left', flipped: false }];
  }

  const plays: { side: 'left' | 'right'; flipped: boolean }[] = [];

  const checkEnd = (open: number, side: 'left' | 'right') => {
    if (open === -1) return;
    if (side === 'left') {
      // connecting tile[1] to the left open; tile[0] becomes the new left open
      if (tile[1] === open) plays.push({ side, flipped: false });
      if (tile[0] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
    } else {
      // connecting tile[0] to the right open; tile[1] becomes the new right open
      if (tile[0] === open) plays.push({ side, flipped: false });
      if (tile[1] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
    }
  };

  checkEnd(state.leftOpen, 'left');
  checkEnd(state.rightOpen, 'right');

  return plays;
}

export function getValidMoves(state: GameState, playerIndex: number): { tile: Tile; plays: ReturnType<typeof canPlayTile> }[] {
  const player = state.players[playerIndex];
  return player.hand
    .map((tile) => ({ tile, plays: canPlayTile(state, tile) }))
    .filter((m) => m.plays.length > 0);
}

export function applyMove(
  state: GameState,
  playerIndex: number,
  tile: Tile,
  side: 'left' | 'right',
  flipped: boolean
): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const player = s.players[playerIndex];

  if (s.firstPlayMade) {
    const allowed = canPlayTile(s, tile);
    if (!allowed.some((p) => p.side === side && p.flipped === flipped)) {
      throw new Error('Illegal move');
    }
  } else {
    const allowed = canPlayTile(s, tile);
    if (allowed.length === 0) throw new Error('Illegal first move');
  }

  // Was the board empty before this move? (needed for win-type detection)
  const boardWasEmpty = !s.firstPlayMade;

  // Remove tile from hand
  const idx = player.hand.findIndex((t) => t[0] === tile[0] && t[1] === tile[1]);
  if (idx === -1) throw new Error('Tile not in hand');
  player.hand.splice(idx, 1);
  player.passedLastTurn = false;
  s.consecutivePasses = 0;

  const placed: PlacedTile = { tile, side, flipped };
  const effectiveTile: Tile = flipped ? [tile[1], tile[0]] : tile;

  if (!s.firstPlayMade) {
    s.board.push(placed);
    s.leftOpen  = effectiveTile[0];
    s.rightOpen = effectiveTile[1];
    s.firstPlayMade = true;
  } else {
    s.board.push(placed);
    switch (side) {
      case 'left':  s.leftOpen  = effectiveTile[0]; break;
      case 'right': s.rightOpen = effectiveTile[1]; break;
    }
  }

  s.turnCount++;
  s.turnStartedAt = Date.now();

  // Check win condition: player emptied hand
  if (player.hand.length === 0) {
    // IMPORTANT: detectWinType MUST receive POST-MOVE open ends.
    // Lá e Lô / Cruzada are decided by what the board looks like AFTER the
    // winning tile is placed (e.g. playing 2:6 with pre-move ends 2,6 leaves
    // both ends at 6 → lelo). Reading pre-move ends scores it as simples.
    const postLeftOpen  = s.leftOpen;
    const postRightOpen = s.rightOpen;
    const winType = detectWinType(tile, postLeftOpen, postRightOpen, boardWasEmpty);
    const points  = WIN_POINTS[winType];
    s.status     = 'finished';
    s.winnerId   = player.userId;
    s.winnerTeam = player.team;
    s.winType    = winType;
    s.matchScores = {
      ...s.matchScores,
      [player.team]: (s.matchScores[player.team] ?? 0) + points,
    };
    if (s.matchScores[player.team] >= s.targetScore) {
      s.matchWinnerTeam = player.team;
    }
    return s;
  }

  s.currentPlayerIndex = (playerIndex + 1) % s.players.length;
  return s;
}

export function applyPass(state: GameState, playerIndex: number): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  s.players[playerIndex].passedLastTurn = true;
  s.consecutivePasses++;
  s.turnCount++;
  s.turnStartedAt = Date.now();
  s.currentPlayerIndex = (playerIndex + 1) % s.players.length;

  // All players passed — game is blocked
  if (s.consecutivePasses >= s.players.length) {
    s.status  = 'finished';
    s.winType = 'simples';
    resolveBlockedGame(s);
  }

  return s;
}

export function drawFromBoneyard(state: GameState, playerIndex: number): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  if (s.boneyard.length === 0) return s;

  const tile = s.boneyard.pop()!;
  s.players[playerIndex].hand.push(tile);
  return s;
}

function resolveBlockedGame(state: GameState): void {
  // Count pips per team; L_E_L variant: doubles count double
  const teamPips: Record<number, number> = { 1: 0, 2: 0 };
  state.players.forEach((p) => {
    let pips = p.hand.reduce((sum, t) => sum + t[0] + t[1], 0);
    if (state.variant === 'L_E_L') {
      // Doubles count their face value a second time
      const doubleBonus = p.hand.filter((t) => t[0] === t[1]).reduce((sum, t) => sum + t[0] + t[1], 0);
      pips += doubleBonus;
    }
    teamPips[p.team] = (teamPips[p.team] || 0) + pips;
  });

  const teams = Object.keys(teamPips).map(Number);
  const [lower, higher] = teams.sort((a, b) => teamPips[a] - teamPips[b]);

  if (teamPips[lower] === teamPips[higher]) {
    // Tie — no winner, no points awarded
    state.winnerId   = undefined;
    state.winnerTeam = undefined;
    state.winType    = undefined;
  } else {
    state.winnerTeam = lower;
    const winningPlayer = state.players.find((p) => p.team === lower);
    state.winnerId = winningPlayer?.userId;
    // Blocked game always scores 1 pt (simples)
    state.matchScores = {
      ...state.matchScores,
      [lower]: (state.matchScores[lower] ?? 0) + 1,
    };
    if (state.matchScores[lower] >= state.targetScore) {
      state.matchWinnerTeam = lower;
    }
  }
}

export function getBotMove(state: GameState, playerIndex: number): {
  action: 'play' | 'pass' | 'draw';
  tile?: Tile;
  side?: 'left' | 'right';
  flipped?: boolean;
} {
  const validMoves = getValidMoves(state, playerIndex);

  if (validMoves.length === 0) {
    if (state.boneyard.length > 0) return { action: 'draw' };
    return { action: 'pass' };
  }

  // Simple AI: prefer highest-pip tile first
  const sorted = validMoves.sort((a, b) => {
    const aMax = Math.max(a.tile[0], a.tile[1]);
    const bMax = Math.max(b.tile[0], b.tile[1]);
    return bMax - aMax;
  });

  const best = sorted[0];
  const play = best.plays[0];
  return { action: 'play', tile: best.tile, side: play.side, flipped: play.flipped };
}
