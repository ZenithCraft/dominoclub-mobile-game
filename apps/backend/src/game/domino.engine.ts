// ─────────────────────────────────────────────────────────────────
// DominoClub — Brazilian Domino Engine
// Supports: Carroça, L e L, Cruzada
// Scoring: Simples=1, Carroça=2, Lá e Lô=3, Cruzada=4 — first to 6 pts wins
// ─────────────────────────────────────────────────────────────────

export type Tile = [number, number]; // [left, right] pips

export interface PlacedTile {
  tile: Tile;
  side: 'left' | 'right' | 'top' | 'bottom'; // for Cruzada
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
  leftOpen: number;    // pip value open on the left end
  rightOpen: number;   // pip value open on the right end
  topOpen?: number;    // only for CRUZADA
  bottomOpen?: number; // only for CRUZADA
  currentPlayerIndex: number;
  turnCount: number;
  consecutivePasses: number;
  status: 'waiting' | 'playing' | 'finished';
  winnerId?: string;
  winnerTeam?: number;
  winType?: WinType;       // type of win for the current round
  turnStartedAt?: number;  // timestamp for timeout
  firstPlayMade: boolean;

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
    const j = Math.floor(Math.random() * (i + 1));
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
  const tilesPerPlayer = 7;
  const playerStates: PlayerState[] = players.map((p, i) => ({
    ...p,
    hand: allTiles.slice(i * tilesPerPlayer, (i + 1) * tilesPerPlayer),
    connected: true,
    passedLastTurn: false,
  }));

  const boneyard = allTiles.slice(players.length * tilesPerPlayer);
  const firstPlayerIndex = determineFirstMove(playerStates).playerIndex;

  return {
    id: gameId,
    variant,
    players: playerStates,
    board: [],
    boneyard,
    leftOpen: -1,
    rightOpen: -1,
    currentPlayerIndex: firstPlayerIndex,
    turnCount: 0,
    consecutivePasses: 0,
    status: 'playing',
    turnStartedAt: Date.now(),
    firstPlayMade: false,
    matchScores: { 1: 0, 2: 0 },
    roundNumber: 1,
    targetScore: TARGET_SCORE,
  };
}

function tileEquals(a: Tile, b: Tile) {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

function compareNonDouble(a: Tile, b: Tile) {
  const aMax = Math.max(a[0], a[1]);
  const bMax = Math.max(b[0], b[1]);
  if (aMax !== bMax) return bMax - aMax;
  const aMin = Math.min(a[0], a[1]);
  const bMin = Math.min(b[0], b[1]);
  if (aMin !== bMin) return bMin - aMin;
  return 0;
}

function determineFirstMove(players: PlayerState[]): { playerIndex: number; tile: Tile } {
  let bestDouble: { playerIndex: number; tile: Tile } | null = null;
  let bestNonDouble: { playerIndex: number; tile: Tile } | null = null;

  for (let idx = 0; idx < players.length; idx++) {
    const p = players[idx];
    for (const tile of p.hand) {
      if (tile[0] === tile[1]) {
        if (!bestDouble || tile[0] > bestDouble.tile[0]) bestDouble = { playerIndex: idx, tile };
      } else {
        if (!bestNonDouble || compareNonDouble(tile, bestNonDouble.tile) < 0) bestNonDouble = { playerIndex: idx, tile };
      }
    }
  }

  return bestDouble ?? bestNonDouble ?? { playerIndex: 0, tile: [0, 0] };
}

/**
 * Start a fresh round within an ongoing match.
 * Keeps matchScores, roundNumber+1, players list.
 */
export function initNextRound(state: GameState): GameState {
  const allTiles = shuffle(generateTiles());
  const tilesPerPlayer = 7;

  const players: PlayerState[] = state.players.map((p, i) => ({
    ...p,
    hand: allTiles.slice(i * tilesPerPlayer, (i + 1) * tilesPerPlayer),
    connected: p.connected,
    passedLastTurn: false,
  }));

  const boneyard = allTiles.slice(players.length * tilesPerPlayer);
  const firstPlayerIndex = determineFirstMove(players).playerIndex;

  return {
    id: state.id,
    variant: state.variant,
    players,
    board: [],
    boneyard,
    leftOpen: -1,
    rightOpen: -1,
    currentPlayerIndex: firstPlayerIndex,
    turnCount: 0,
    consecutivePasses: 0,
    status: 'playing',
    turnStartedAt: Date.now(),
    firstPlayMade: false,
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
 * Detect the win type based on the last tile played.
 *
 * Rules (Brazilian domino scoring):
 *  - Cruzada  (4 pts): last tile is a double AND both ends had equal pips (tile fits either end)
 *  - Lá e Lô  (3 pts): last tile is NOT a double AND both ends had equal pips (tile fits either end)
 *  - Carroça  (2 pts): last tile is a double
 *  - Simples  (1 pt) : plain win
 */
function detectWinType(tile: Tile, leftOpen: number, rightOpen: number, firstPlayMade: boolean): WinType {
  if (!firstPlayMade) return 'simples'; // very first tile of the game
  const isDouble = tile[0] === tile[1];
  const bothEndsEqual = leftOpen === rightOpen;
  if (isDouble && bothEndsEqual) return 'cruzada';
  if (isDouble) return 'carroca';
  if (bothEndsEqual) return 'lelo';
  return 'simples';
}

export function canPlayTile(state: GameState, tile: Tile): { side: 'left' | 'right' | 'top' | 'bottom'; flipped: boolean }[] {
  if (!state.firstPlayMade) {
    return [{ side: 'left', flipped: false }]; // first tile goes anywhere
  }

  const plays: { side: 'left' | 'right' | 'top' | 'bottom'; flipped: boolean }[] = [];

  const checkEnd = (open: number, side: 'left' | 'right' | 'top' | 'bottom') => {
    if (open === -1) return;
    const isLeftLike = side === 'left' || side === 'top';
    if (isLeftLike) {
      if (tile[1] === open) plays.push({ side, flipped: false });
      if (tile[0] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
    } else {
      if (tile[0] === open) plays.push({ side, flipped: false });
      if (tile[1] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
    }
  };

  checkEnd(state.leftOpen, 'left');
  checkEnd(state.rightOpen, 'right');
  if (state.variant === 'CRUZADA') {
    if (state.topOpen !== undefined) checkEnd(state.topOpen, 'top');
    if (state.bottomOpen !== undefined) checkEnd(state.bottomOpen, 'bottom');
  }

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
  side: 'left' | 'right' | 'top' | 'bottom',
  flipped: boolean
): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const player = s.players[playerIndex];

  if (!s.firstPlayMade) {
    const required = determineFirstMove(s.players);
    if (playerIndex !== required.playerIndex || !tileEquals(tile, required.tile)) {
      throw new Error(`First move must be ${required.tile[0]}-${required.tile[1]}`);
    }
  }

  if (s.firstPlayMade) {
    const allowed = canPlayTile(s, tile);
    if (!allowed.some((p) => p.side === side && p.flipped === flipped)) {
      throw new Error('Illegal move');
    }
  }

  // Capture open ends BEFORE placing (needed for win type detection)
  const prevLeftOpen  = s.leftOpen;
  const prevRightOpen = s.rightOpen;
  const wasFirstPlay  = s.firstPlayMade;

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
    s.leftOpen = effectiveTile[0];
    s.rightOpen = effectiveTile[1];
    s.firstPlayMade = true;

    // In Cruzada, if first tile is a double, the cross opens immediately
    if (s.variant === 'CRUZADA' && tile[0] === tile[1]) {
      s.topOpen = tile[0];
      s.bottomOpen = tile[0];
    }
  } else {
    s.board.push(placed);
    switch (side) {
      case 'left':  s.leftOpen   = effectiveTile[0]; break;
      case 'right': s.rightOpen  = effectiveTile[1]; break;
      case 'top':   s.topOpen    = effectiveTile[0]; break;
      case 'bottom':s.bottomOpen = effectiveTile[1]; break;
    }

    // Cruzada: first double played opens perpendicular sides
    if (s.variant === 'CRUZADA' && tile[0] === tile[1] && s.topOpen === undefined) {
      s.topOpen    = tile[0];
      s.bottomOpen = tile[0];
    }
  }

  s.turnCount++;
  s.turnStartedAt = Date.now();

  // Check win condition: player emptied hand
  if (player.hand.length === 0) {
    const winType = detectWinType(tile, prevLeftOpen, prevRightOpen, wasFirstPlay);
    const points  = WIN_POINTS[winType];
    s.status    = 'finished';
    s.winnerId  = player.userId;
    s.winnerTeam = player.team;
    s.winType   = winType;
    s.matchScores = {
      ...s.matchScores,
      [player.team]: (s.matchScores[player.team] ?? 0) + points,
    };
    // Check if match is over
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
    s.status = 'finished';
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
  // Count pips for each team
  const teamPips: Record<number, number> = { 1: 0, 2: 0 };
  state.players.forEach((p) => {
    const pips = p.hand.reduce((sum, tile) => sum + tile[0] + tile[1], 0);
    teamPips[p.team] = (teamPips[p.team] || 0) + pips;

    // L e L variant: doubles count double
    if (state.variant === 'L_E_L') {
      const doubleBonus = p.hand
        .filter((t) => t[0] === t[1])
        .reduce((sum, t) => sum + t[0] + t[1], 0);
      teamPips[p.team] += doubleBonus;
    }
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
    // Blocked game always scores simples (1 pt)
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
  side?: 'left' | 'right' | 'top' | 'bottom';
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
