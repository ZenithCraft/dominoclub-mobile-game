// ─────────────────────────────────────────────────────────────────
// DominoClub — Brazilian Domino Engine
// Supports: Carroça, L e L, Cruzada
// ─────────────────────────────────────────────────────────────────

export type Tile = [number, number]; // [left, right] pips

export interface PlacedTile {
  tile: Tile;
  side: 'left' | 'right' | 'top' | 'bottom'; // for Cruzada
  flipped: boolean; // whether tile was placed right-to-left
}

export type DominoVariant = 'CARROCA' | 'L_E_L' | 'CRUZADA';

export interface GameState {
  id: string;
  variant: DominoVariant;
  players: PlayerState[];
  board: PlacedTile[];
  boneyard: Tile[];
  leftOpen: number;   // pip value open on the left end
  rightOpen: number;  // pip value open on the right end
  topOpen?: number;   // only for CRUZADA
  bottomOpen?: number; // only for CRUZADA
  currentPlayerIndex: number;
  turnCount: number;
  consecutivePasses: number;
  status: 'waiting' | 'playing' | 'finished';
  winnerId?: string;
  winnerTeam?: number;
  turnStartedAt?: number; // timestamp for timeout
  firstPlayMade: boolean;
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
  const tilesPerPlayer = players.length === 2 ? 7 : 7;
  const playerStates: PlayerState[] = players.map((p, i) => ({
    ...p,
    hand: allTiles.slice(i * tilesPerPlayer, (i + 1) * tilesPerPlayer),
    connected: true,
    passedLastTurn: false,
  }));

  const boneyard = allTiles.slice(players.length * tilesPerPlayer);

  // Determine who goes first: player with the highest double
  let firstPlayerIndex = 0;
  let highestDouble = -1;
  playerStates.forEach((p, idx) => {
    p.hand.forEach((tile) => {
      if (tile[0] === tile[1] && tile[0] > highestDouble) {
        highestDouble = tile[0];
        firstPlayerIndex = idx;
      }
    });
  });

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
  };
}

export function canPlayTile(state: GameState, tile: Tile): { side: 'left' | 'right' | 'top' | 'bottom'; flipped: boolean }[] {
  if (!state.firstPlayMade) {
    return [{ side: 'left', flipped: false }]; // first tile goes anywhere
  }

  const plays: { side: 'left' | 'right' | 'top' | 'bottom'; flipped: boolean }[] = [];

  const checkEnd = (open: number, side: 'left' | 'right' | 'top' | 'bottom') => {
    if (open === -1) return;
    if (tile[0] === open) plays.push({ side, flipped: false });
    if (tile[1] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
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
      case 'left':
        s.leftOpen = effectiveTile[0];
        break;
      case 'right':
        s.rightOpen = effectiveTile[1];
        break;
      case 'top':
        s.topOpen = effectiveTile[0];
        break;
      case 'bottom':
        s.bottomOpen = effectiveTile[1];
        break;
    }

    // Cruzada: first double played opens perpendicular sides
    if (s.variant === 'CRUZADA' && tile[0] === tile[1] && s.topOpen === undefined) {
      s.topOpen = tile[0];
      s.bottomOpen = tile[0];
    }
  }

  s.turnCount++;
  s.turnStartedAt = Date.now();

  // Check win condition: player emptied hand
  if (player.hand.length === 0) {
    s.status = 'finished';
    s.winnerId = player.userId;
    s.winnerTeam = player.team;
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
  const winner = teams.sort((a, b) => teamPips[a] - teamPips[b])[0];

  if (teamPips[teams[0]] === teamPips[teams[1]]) {
    // Tie — no winner
    state.winnerId = undefined;
    state.winnerTeam = undefined;
  } else {
    state.winnerTeam = winner;
    const winningPlayer = state.players.find((p) => p.team === winner);
    state.winnerId = winningPlayer?.userId;
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

  // Simple AI: prefer to play the tile that blocks opponent (highest pip tile first)
  const sorted = validMoves.sort((a, b) => {
    const aMax = Math.max(a.tile[0], a.tile[1]);
    const bMax = Math.max(b.tile[0], b.tile[1]);
    return bMax - aMax;
  });

  const best = sorted[0];
  const play = best.plays[0];
  return { action: 'play', tile: best.tile, side: play.side, flipped: play.flipped };
}
