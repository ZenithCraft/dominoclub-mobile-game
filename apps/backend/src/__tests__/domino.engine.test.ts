import {
  generateTiles,
  shuffle,
  initGame,
  canPlayTile,
  getValidMoves,
  applyMove,
  applyPass,
  drawFromBoneyard,
  getBotMove,
  GameState,
  Tile,
} from '../game/domino.engine';

// ─── generateTiles ────────────────────────────────────────────────────────────

describe('generateTiles', () => {
  it('returns 28 tiles', () => {
    expect(generateTiles()).toHaveLength(28);
  });

  it('includes every [i,j] pair where 0 ≤ i ≤ j ≤ 6', () => {
    const tiles = generateTiles();
    for (let i = 0; i <= 6; i++) {
      for (let j = i; j <= 6; j++) {
        expect(tiles).toContainEqual([i, j]);
      }
    }
  });

  it('contains no duplicates', () => {
    const tiles = generateTiles();
    const strings = tiles.map((t) => t.join(','));
    expect(new Set(strings).size).toBe(28);
  });
});

// ─── shuffle ─────────────────────────────────────────────────────────────────

describe('shuffle', () => {
  it('returns an array with the same elements', () => {
    const tiles = generateTiles();
    const shuffled = shuffle(tiles);
    expect(shuffled).toHaveLength(tiles.length);
    expect(shuffled.sort()).toEqual(tiles.sort());
  });

  it('does not mutate the original array', () => {
    const tiles = generateTiles();
    const copy = [...tiles];
    shuffle(tiles);
    expect(tiles).toEqual(copy);
  });
});

// ─── initGame ─────────────────────────────────────────────────────────────────

const twoPlayers = [
  { userId: 'u1', team: 1, seat: 0, isBot: false },
  { userId: 'u2', team: 2, seat: 1, isBot: false },
];

const fourPlayers = [
  { userId: 'u1', team: 1, seat: 0, isBot: false },
  { userId: 'u2', team: 2, seat: 1, isBot: false },
  { userId: 'u3', team: 1, seat: 2, isBot: false },
  { userId: 'u4', team: 2, seat: 3, isBot: false },
];

describe('initGame', () => {
  it('gives 6 tiles to each of 2 players and leaves 16 in boneyard', () => {
    const state = initGame('g1', 'CARROCA', twoPlayers);
    expect(state.players[0].hand).toHaveLength(6);
    expect(state.players[1].hand).toHaveLength(6);
    expect(state.boneyard).toHaveLength(16);
  });

  it('gives 6 tiles to each of 4 players and leaves 4 in boneyard', () => {
    const state = initGame('g1', 'CARROCA', fourPlayers);
    state.players.forEach((p) => expect(p.hand).toHaveLength(6));
    expect(state.boneyard).toHaveLength(4);
  });

  it('all 28 tiles are accounted for across hands and boneyard', () => {
    const state = initGame('g1', 'CARROCA', twoPlayers);
    const allTiles = [
      ...state.players.flatMap((p) => p.hand),
      ...state.boneyard,
    ];
    expect(allTiles).toHaveLength(28);
  });

  it('starts with status "playing"', () => {
    const state = initGame('g1', 'CARROCA', twoPlayers);
    expect(state.status).toBe('playing');
  });

  it('first player holds the highest double', () => {
    const state = initGame('g1', 'CARROCA', twoPlayers);
    const firstPlayer = state.players[state.currentPlayerIndex];
    const doubles = firstPlayer.hand.filter((t) => t[0] === t[1]);
    // Either the first player has the highest double, or no doubles exist in any hand
    const allDoubles = state.players
      .flatMap((p) => p.hand)
      .filter((t) => t[0] === t[1]);
    if (allDoubles.length === 0) return; // no doubles — first player index is 0 by default
    const maxDouble = Math.max(...allDoubles.map((t) => t[0]));
    expect(doubles.some((t) => t[0] === maxDouble)).toBe(true);
  });

  it('initialises firstPlayMade as false', () => {
    const state = initGame('g1', 'CARROCA', twoPlayers);
    expect(state.firstPlayMade).toBe(false);
  });
});

// ─── canPlayTile ──────────────────────────────────────────────────────────────

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'g1',
    variant: 'CARROCA',
    players: [],
    board: [],
    boneyard: [],
    leftOpen: -1,
    rightOpen: -1,
    currentPlayerIndex: 0,
    turnCount: 0,
    consecutivePasses: 0,
    status: 'playing',
    firstPlayMade: false,
    matchScores: { 1: 0, 2: 0 },
    roundNumber: 1,
    targetScore: 6,
    ...overrides,
  };
}

describe('canPlayTile', () => {
  it('any tile is playable as the first play (single left slot)', () => {
    const state = makeState({ firstPlayMade: false });
    const plays = canPlayTile(state, [3, 5]);
    expect(plays).toHaveLength(1);
    expect(plays[0].side).toBe('left');
  });

  it('tile matching leftOpen is playable on the left', () => {
    const state = makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 });
    const plays = canPlayTile(state, [2, 3]);
    expect(plays.some((p) => p.side === 'left' && !p.flipped)).toBe(true);
  });

  it('tile matching rightOpen is playable on the right', () => {
    const state = makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 });
    const plays = canPlayTile(state, [6, 1]);
    expect(plays.some((p) => p.side === 'right' && !p.flipped)).toBe(true);
  });

  it('tile needs flipping when second pip matches open end', () => {
    const state = makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 });
    const plays = canPlayTile(state, [3, 1]);
    expect(plays.some((p) => p.side === 'left' && p.flipped)).toBe(true);
  });

  it('double does not generate a flipped entry', () => {
    const state = makeState({ firstPlayMade: true, leftOpen: 5, rightOpen: 2 });
    const plays = canPlayTile(state, [5, 5]);
    expect(plays.every((p) => !p.flipped)).toBe(true);
  });

  it('unmatching tile returns empty array', () => {
    const state = makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 });
    const plays = canPlayTile(state, [1, 2]);
    expect(plays).toHaveLength(0);
  });

});

// ─── win-type scoring (Simples / Carroça / Lá-e-Lô / Cruzada) ────────────────
//
// These rules apply to the FINAL board state after the last tile is placed:
//   simples (1)  — plain win
//   carroca (2)  — last tile is a double
//   lelo    (3)  — last tile is NOT a double, post-move ends are equal
//   cruzada (4)  — last tile is a double, post-move ends are equal
//
// Bug regression guard: the scoring previously read PRE-move open ends, so a
// 2:6 played with ends [2,6] was scored as simples (since 2 ≠ 6 pre-move)
// instead of lelo (post-move both ends become 6).

describe('applyMove — win-type scoring', () => {
  const winState = (hand: Tile[], leftOpen: number, rightOpen: number): GameState => makeState({
    firstPlayMade: true,
    leftOpen,
    rightOpen,
    players: [
      { userId: 'p1', team: 1, seat: 0, hand, isBot: false, connected: true, passedLastTurn: false },
      { userId: 'p2', team: 2, seat: 1, hand: [[0, 0]], isBot: false, connected: true, passedLastTurn: false },
    ],
    board: [{ tile: [leftOpen, rightOpen] as Tile, side: 'left', flipped: false }],
  });

  it('scores Lá-e-Lô (3 pts) when the bridging tile makes both ends equal — played on left', () => {
    // ends: 2 | 6, hand: [2,6]. Play left flipped: 2 connects to left, leftOpen becomes 6.
    const s = applyMove(winState([[2, 6]], 2, 6), 0, [2, 6], 'left', true);
    expect(s.winType).toBe('lelo');
    expect(s.matchScores[1]).toBe(3);
  });

  it('scores Lá-e-Lô (3 pts) when the bridging tile makes both ends equal — played on right', () => {
    // ends: 2 | 6, hand: [2,6]. Play right flipped: 6 connects to right, rightOpen becomes 2.
    const s = applyMove(winState([[2, 6]], 2, 6), 0, [2, 6], 'right', true);
    expect(s.winType).toBe('lelo');
    expect(s.matchScores[1]).toBe(3);
  });

  it('scores Cruzada (4 pts) when a double matches both ends', () => {
    // ends: 6 | 6, hand: [6,6]. Both ends remain 6, tile is a double.
    const s = applyMove(winState([[6, 6]], 6, 6), 0, [6, 6], 'left', false);
    expect(s.winType).toBe('cruzada');
    expect(s.matchScores[1]).toBe(4);
  });

  it('scores Carroça (2 pts) when the last tile is a double but ends differ post-move', () => {
    // ends: 3 | 5, hand: [3,3]. Play 3:3 on left. leftOpen stays 3, rightOpen stays 5.
    const s = applyMove(winState([[3, 3]], 3, 5), 0, [3, 3], 'left', false);
    expect(s.winType).toBe('carroca');
    expect(s.matchScores[1]).toBe(2);
  });

  it('scores Simples (1 pt) when ends differ post-move and the tile is not a double', () => {
    // ends: 1 | 4, hand: [1,2]. Play 1:2 on left flipped: leftOpen becomes 2 (≠4).
    const s = applyMove(winState([[1, 2]], 1, 4), 0, [1, 2], 'left', true);
    expect(s.winType).toBe('simples');
    expect(s.matchScores[1]).toBe(1);
  });
});

// ─── getValidMoves ────────────────────────────────────────────────────────────

describe('getValidMoves', () => {
  it('returns moves only for tiles that can be played', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 }),
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[3, 1], [2, 2], [6, 4]], connected: true, passedLastTurn: false },
      ],
    };
    const moves = getValidMoves(state, 0);
    // [3,1] matches leftOpen=3; [6,4] matches rightOpen=6; [2,2] matches nothing
    expect(moves).toHaveLength(2);
    expect(moves.map((m) => m.tile)).toContainEqual([3, 1]);
    expect(moves.map((m) => m.tile)).toContainEqual([6, 4]);
  });

  it('returns all tiles as valid for the very first move', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: false }),
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[0, 0], [1, 2], [6, 6]], connected: true, passedLastTurn: false },
      ],
    };
    const moves = getValidMoves(state, 0);
    expect(moves).toHaveLength(3);
  });
});

// ─── applyMove ────────────────────────────────────────────────────────────────

describe('applyMove', () => {
  function stateWithHand(hand: Tile[], overrides: Partial<GameState> = {}): GameState {
    return {
      ...makeState({ firstPlayMade: false, ...overrides }),
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand, connected: true, passedLastTurn: false },
        { userId: 'u2', team: 2, seat: 1, isBot: false, hand: [[0, 0]], connected: true, passedLastTurn: false },
      ],
    };
  }

  it('removes the played tile from the player hand', () => {
    const state = stateWithHand([[3, 5], [1, 2]]);
    const next = applyMove(state, 0, [3, 5], 'left', false);
    expect(next.players[0].hand).not.toContainEqual([3, 5]);
    expect(next.players[0].hand).toContainEqual([1, 2]);
  });

  it('adds tile to board', () => {
    const state = stateWithHand([[3, 5]]);
    const next = applyMove(state, 0, [3, 5], 'left', false);
    expect(next.board).toHaveLength(1);
    expect(next.board[0].tile).toEqual([3, 5]);
  });

  it('sets leftOpen and rightOpen correctly on first play (no flip)', () => {
    const state = stateWithHand([[3, 5]]);
    const next = applyMove(state, 0, [3, 5], 'left', false);
    expect(next.leftOpen).toBe(3);
    expect(next.rightOpen).toBe(5);
  });

  it('sets leftOpen correctly on first play when flipped', () => {
    const state = stateWithHand([[3, 5]]);
    const next = applyMove(state, 0, [3, 5], 'left', true);
    // flipped: effective tile is [5,3], so leftOpen=5, rightOpen=3
    expect(next.leftOpen).toBe(5);
    expect(next.rightOpen).toBe(3);
  });

  it('updates leftOpen when playing on the left', () => {
    const state = stateWithHand([[1, 3]], { firstPlayMade: true, leftOpen: 3, rightOpen: 6 });
    const next = applyMove(state, 0, [1, 3], 'left', false);
    expect(next.leftOpen).toBe(1);
  });

  it('updates rightOpen when playing on the right', () => {
    const state = stateWithHand([[6, 2]], { firstPlayMade: true, leftOpen: 3, rightOpen: 6 });
    const next = applyMove(state, 0, [6, 2], 'right', false);
    // effective tile [6,2] on right side: rightOpen becomes effectiveTile[1] = 2
    expect(next.rightOpen).toBe(2);
  });

  it('advances currentPlayerIndex to next player', () => {
    // Need 2 tiles so emptying one tile does not end the game
    const state = stateWithHand([[3, 5], [1, 2]]);
    const next = applyMove(state, 0, [3, 5], 'left', false);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('wraps currentPlayerIndex back to 0 after last player', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6, currentPlayerIndex: 1 }),
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[0, 0]], connected: true, passedLastTurn: false },
        { userId: 'u2', team: 2, seat: 1, isBot: false, hand: [[6, 1], [2, 2]], connected: true, passedLastTurn: false },
      ],
    };
    const next = applyMove(state, 1, [6, 1], 'right', false);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('sets status to finished when player empties hand', () => {
    const state = stateWithHand([[3, 5]]);
    const next = applyMove(state, 0, [3, 5], 'left', false);
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBe('u1');
    expect(next.winnerTeam).toBe(1);
  });

  it('throws if tile is not in player hand', () => {
    const state = stateWithHand([[1, 2]]);
    expect(() => applyMove(state, 0, [3, 5], 'left', false)).toThrow('Tile not in hand');
  });

  it('throws on illegal move (tile does not match open ends)', () => {
    const state = stateWithHand([[1, 2]], { firstPlayMade: true, leftOpen: 3, rightOpen: 6 });
    expect(() => applyMove(state, 0, [1, 2], 'left', false)).toThrow('Illegal move');
  });

  it('resets consecutivePasses to 0 after a move', () => {
    const state = { ...stateWithHand([[3, 5]]), consecutivePasses: 2 };
    const next = applyMove(state, 0, [3, 5], 'left', false);
    expect(next.consecutivePasses).toBe(0);
  });

});

// ─── applyPass ────────────────────────────────────────────────────────────────

describe('applyPass', () => {
  function twoPlayerState(extras: Partial<GameState> = {}): GameState {
    return {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6, ...extras }),
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[1, 2]], connected: true, passedLastTurn: false },
        { userId: 'u2', team: 2, seat: 1, isBot: false, hand: [[0, 0]], connected: true, passedLastTurn: false },
      ],
    };
  }

  it('increments consecutivePasses', () => {
    const state = twoPlayerState({ consecutivePasses: 0 });
    const next = applyPass(state, 0);
    expect(next.consecutivePasses).toBe(1);
  });

  it('marks player passedLastTurn', () => {
    const state = twoPlayerState();
    const next = applyPass(state, 0);
    expect(next.players[0].passedLastTurn).toBe(true);
  });

  it('advances currentPlayerIndex', () => {
    const state = twoPlayerState({ currentPlayerIndex: 0 });
    const next = applyPass(state, 0);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('game is blocked when all players pass consecutively', () => {
    // Both players already passed once; this is the second pass
    const state = twoPlayerState({ consecutivePasses: 1 });
    const next = applyPass(state, 1);
    expect(next.status).toBe('finished');
  });

  it('blocked game resolves to team with fewer pips', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6, consecutivePasses: 1 }),
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[1, 0]], connected: true, passedLastTurn: false }, // 1 pip
        { userId: 'u2', team: 2, seat: 1, isBot: false, hand: [[6, 6]], connected: true, passedLastTurn: false }, // 12 pips
      ],
    };
    const next = applyPass(state, 1);
    expect(next.winnerTeam).toBe(1); // team 1 wins (fewer pips)
  });

  it('blocked game with equal pips has no winner', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6, consecutivePasses: 1 }),
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[3, 3]], connected: true, passedLastTurn: false }, // 6 pips
        { userId: 'u2', team: 2, seat: 1, isBot: false, hand: [[4, 2]], connected: true, passedLastTurn: false }, // 6 pips
      ],
    };
    const next = applyPass(state, 1);
    expect(next.status).toBe('finished');
    expect(next.winnerId).toBeUndefined();
    expect(next.winnerTeam).toBeUndefined();
  });
});

// ─── drawFromBoneyard ─────────────────────────────────────────────────────────

describe('drawFromBoneyard', () => {
  it('adds a tile to the player hand', () => {
    const state: GameState = {
      ...makeState(),
      boneyard: [[2, 3], [5, 6]],
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[1, 1]], connected: true, passedLastTurn: false },
      ],
    };
    const next = drawFromBoneyard(state, 0);
    expect(next.players[0].hand).toHaveLength(2);
  });

  it('removes the last tile from boneyard', () => {
    const state: GameState = {
      ...makeState(),
      boneyard: [[2, 3], [5, 6]],
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [], connected: true, passedLastTurn: false },
      ],
    };
    const next = drawFromBoneyard(state, 0);
    expect(next.boneyard).toHaveLength(1);
    expect(next.players[0].hand).toContainEqual([5, 6]); // pop() returns last element
  });

  it('does nothing when boneyard is empty', () => {
    const state: GameState = {
      ...makeState(),
      boneyard: [],
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [[1, 2]], connected: true, passedLastTurn: false },
      ],
    };
    const next = drawFromBoneyard(state, 0);
    expect(next.players[0].hand).toHaveLength(1);
  });

  it('does not mutate original state', () => {
    const state: GameState = {
      ...makeState(),
      boneyard: [[2, 3]],
      players: [
        { userId: 'u1', team: 1, seat: 0, isBot: false, hand: [], connected: true, passedLastTurn: false },
      ],
    };
    drawFromBoneyard(state, 0);
    expect(state.boneyard).toHaveLength(1);
    expect(state.players[0].hand).toHaveLength(0);
  });
});

// ─── getBotMove ───────────────────────────────────────────────────────────────

describe('getBotMove', () => {
  it('returns "draw" when no valid moves and boneyard has tiles', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 }),
      boneyard: [[1, 1]],
      players: [
        { userId: 'bot', team: 1, seat: 0, isBot: true, hand: [[2, 2]], connected: true, passedLastTurn: false },
      ],
    };
    const move = getBotMove(state, 0);
    expect(move.action).toBe('draw');
  });

  it('returns "pass" when no valid moves and boneyard is empty', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 }),
      boneyard: [],
      players: [
        { userId: 'bot', team: 1, seat: 0, isBot: true, hand: [[2, 2]], connected: true, passedLastTurn: false },
      ],
    };
    const move = getBotMove(state, 0);
    expect(move.action).toBe('pass');
  });

  it('returns "play" with a valid tile when moves exist', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 3, rightOpen: 6 }),
      boneyard: [],
      players: [
        { userId: 'bot', team: 1, seat: 0, isBot: true, hand: [[3, 1], [2, 2]], connected: true, passedLastTurn: false },
      ],
    };
    const move = getBotMove(state, 0);
    expect(move.action).toBe('play');
    expect(move.tile).toBeDefined();
    expect(move.side).toBeDefined();
  });

  it('prefers higher-pip tiles (greedy strategy)', () => {
    // Board: leftOpen=5, rightOpen=6. [5,3] max pip=5, [6,6] max pip=6 — bot must pick [6,6]
    const state: GameState = {
      ...makeState({ firstPlayMade: true, leftOpen: 5, rightOpen: 6 }),
      boneyard: [],
      players: [
        { userId: 'bot', team: 1, seat: 0, isBot: true, hand: [[5, 3], [6, 6]], connected: true, passedLastTurn: false },
      ],
    };
    const move = getBotMove(state, 0);
    expect(move.tile).toEqual([6, 6]); // max pip 6 > max pip 5
  });

  it('first play always returns a play action', () => {
    const state: GameState = {
      ...makeState({ firstPlayMade: false }),
      boneyard: [],
      players: [
        { userId: 'bot', team: 1, seat: 0, isBot: true, hand: [[4, 3]], connected: true, passedLastTurn: false },
      ],
    };
    const move = getBotMove(state, 0);
    expect(move.action).toBe('play');
  });
});

// ─── Full game simulation ─────────────────────────────────────────────────────

describe('full game simulation', () => {
  it('completes a 2-player game without errors', () => {
    let state = initGame('sim1', 'CARROCA', twoPlayers);
    let maxTurns = 500;

    while (state.status === 'playing' && maxTurns-- > 0) {
      const idx = state.currentPlayerIndex;
      const player = state.players[idx];
      const moves = getValidMoves(state, idx);

      if (moves.length > 0) {
        const best = moves[0];
        state = applyMove(state, idx, best.tile, best.plays[0].side, best.plays[0].flipped);
      } else if (state.boneyard.length > 0) {
        state = drawFromBoneyard(state, idx);
      } else {
        state = applyPass(state, idx);
      }
    }

    expect(state.status).toBe('finished');
  });
});
