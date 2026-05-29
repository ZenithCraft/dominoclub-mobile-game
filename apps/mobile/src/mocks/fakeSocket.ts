import { useAuthStore } from '../store/auth.store';

type Listener = (...args: any[]) => void;
type Tile = [number, number];
type Side = 'left' | 'right';

// ─── All tiles that have image assets (27/28 — [4,4] missing) ────────────────
const VISIBLE_TILES: Tile[] = [
  [6,6],[5,6],[5,5],[4,6],[4,4],  // [4,5] has no image asset
  [3,6],[3,5],[3,4],[3,3],[2,6],[2,5],
  [2,4],[2,3],[2,2],[1,6],[1,5],[1,4],
  [1,3],[1,2],[1,1],[0,6],[0,5],[0,4],
  [0,3],[0,2],[0,1],[0,0],
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Find highest double across all hands; returns { tile, playerIdx } or null
function findHighestDouble(players: any[]): { tile: Tile; playerIdx: number } | null {
  for (let pip = 6; pip >= 0; pip--) {
    for (let pi = 0; pi < players.length; pi++) {
      const hand: Tile[] = players[pi].hand ?? [];
      if (hand.some((t) => t && t[0] === pip && t[1] === pip)) {
        return { tile: [pip, pip], playerIdx: pi };
      }
    }
  }
  return null;
}

function findPlay(
  tile: Tile,
  leftOpen: number,
  rightOpen: number,
  firstPlayMade: boolean,
  requiredFirstTile?: Tile | null,
): { side: Side; flipped: boolean } | null {
  if (!firstPlayMade) {
    // Must play the required opening tile
    if (requiredFirstTile && (tile[0] !== requiredFirstTile[0] || tile[1] !== requiredFirstTile[1])) return null;
    return { side: 'left', flipped: false };
  }
  if (leftOpen !== -1) {
    if (tile[1] === leftOpen) return { side: 'left', flipped: false };
    if (tile[0] === leftOpen && tile[0] !== tile[1]) return { side: 'left', flipped: true };
  }
  if (rightOpen !== -1) {
    if (tile[0] === rightOpen) return { side: 'right', flipped: false };
    if (tile[1] === rightOpen && tile[0] !== tile[1]) return { side: 'right', flipped: true };
  }
  return null;
}

function applyMove(state: any, playerIdx: number, tile: Tile, side: Side, flipped: boolean): any {
  const players = state.players.map((p: any, i: number) => {
    if (i !== playerIdx) return p;
    // guard nulls — normalised hand may contain null slots
    const hand = p.hand.filter(
      (t: any) =>
        t &&
        !(
          (t[0] === tile[0] && t[1] === tile[1]) ||
          (t[0] === tile[1] && t[1] === tile[0])
        )
    );
    return { ...p, hand };
  });

  const board = [...state.board, { tile, side, flipped }];

  let { leftOpen, rightOpen, firstPlayMade } = state;
  const effective: Tile = flipped ? [tile[1], tile[0]] : tile;
  if (!firstPlayMade) {
    firstPlayMade = true;
    leftOpen  = effective[0];
    rightOpen = effective[1];
  } else {
    if (side === 'left')  leftOpen  = effective[0];
    else                  rightOpen = effective[1];
  }

  const nextIdx = (playerIdx + 1) % players.length;

  // Check win: player emptied their hand
  const winner = players[playerIdx];
  const status = winner.hand.length === 0 ? 'finished' : 'playing';

  return {
    ...state,
    players,
    board,
    leftOpen,
    rightOpen,
    firstPlayMade,
    requiredFirstTile: null,
    currentPlayerIndex: nextIdx,
    turnCount: state.turnCount + 1,
    consecutivePasses: 0,
    status,
  };
}

// ─── FakeSocket class ─────────────────────────────────────────────────────────

class FakeSocket {
  private listeners = new Map<string, Listener[]>();
  private onceMap   = new Map<string, Listener[]>();
  private lastQueueMode: string | null = null;
  private state: any = null;
  readonly connected = true;
  readonly id = 'demo-socket';

  on(event: string, cb: Listener) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(cb);
    this.listeners.set(event, arr);
    return this;
  }

  once(event: string, cb: Listener) {
    const arr = this.onceMap.get(event) ?? [];
    arr.push(cb);
    this.onceMap.set(event, arr);
    return this;
  }

  off(event: string, cb?: Listener) {
    if (cb) {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== cb));
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  emit(event: string, ...args: any[]) {
    switch (event) {

      case 'queue:join': {
        this.lastQueueMode = args[0]?.mode ?? null;
        this.state = null; // always start fresh when going through matchmaking
        const gameId = this.lastQueueMode?.includes('1V1') ? 'demo-1' : 'demo-2v2';
        setTimeout(() => this._trigger('game:found', { gameId }), 800);
        break;
      }

      case 'game:join': {
        // If state was pre-seeded (e.g. by the dev mock useEffect), always use it
        if (this.state !== null) {
          const s = this.state;
          setTimeout(() => this._trigger('game:state', s), 800);
          setTimeout(() => {
            if (this.state?.players?.[this.state.currentPlayerIndex]?.isBot) {
              this._botTurn();
            }
          }, 2000);
          break;
        }

        const gameId = args[0]?.gameId ?? 'demo-1';
        const myId   = useAuthStore.getState().user?.id ?? 'p1';
        const myName = useAuthStore.getState().user?.name ?? 'Você';
        const is2v2  = String(gameId).includes('2v2');
        this.lastQueueMode = null;

        const deck = shuffle(VISIBLE_TILES);

        if (is2v2) {
          const players2v2 = [
            { userId: myId, name: myName,   team: 1, seat: 0, hand: deck.slice(0,  6) as Tile[], isBot: false, connected: true },
            { userId: 'p2', name: 'Ana',    team: 2, seat: 1, hand: deck.slice(6,  12) as Tile[], isBot: true,  connected: true },
            { userId: 'p3', name: 'Pedro',  team: 1, seat: 2, hand: deck.slice(12, 18) as Tile[], isBot: true,  connected: true },
            { userId: 'p4', name: 'Carlos', team: 2, seat: 3, hand: deck.slice(18, 24) as Tile[], isBot: true,  connected: true },
          ];
          const firstDouble2v2 = findHighestDouble(players2v2);
          this.state = {
            id: gameId, mode: 'RECREATIONAL_2V2', variant: 'CARROCA',
            players: players2v2,
            board: [], leftOpen: -1, rightOpen: -1,
            currentPlayerIndex: firstDouble2v2?.playerIdx ?? 0, turnCount: 0,
            status: 'playing', boneyard: [] as Tile[], firstPlayMade: false,
            requiredFirstTile: firstDouble2v2?.tile ?? null,
            matchScores: { 1: 0, 2: 0 }, roundNumber: 1, targetScore: 6,
            consecutivePasses: 0,
          };
        } else {
          const players1v1 = [
            { userId: myId, name: myName,     team: 1, seat: 0, hand: deck.slice(0, 6) as Tile[], isBot: false, connected: true },
            { userId: 'p2', name: 'Fuad HBK', team: 2, seat: 1, hand: deck.slice(6, 12) as Tile[], isBot: true,  connected: true },
          ];
          const firstDouble1v1 = findHighestDouble(players1v1);
          this.state = {
            id: gameId, mode: 'ARENA_1V1', variant: 'CARROCA',
            players: players1v1,
            board: [], leftOpen: -1, rightOpen: -1,
            currentPlayerIndex: firstDouble1v1?.playerIdx ?? 0, turnCount: 0,
            status: 'playing', boneyard: deck.slice(12) as Tile[], firstPlayMade: false,
            requiredFirstTile: firstDouble1v1?.tile ?? null,
            matchScores: { 1: 0, 2: 0 }, roundNumber: 1, targetScore: 6,
            consecutivePasses: 0,
          };
        }

        setTimeout(() => this._trigger('game:state', this.state), 800);
        if (this.state.players[this.state.currentPlayerIndex]?.isBot) {
          setTimeout(() => this._botTurn(), 2000);
        }
        break;
      }

      case 'game:move': {
        const { tile, side, flipped } = args[0] ?? {};
        if (!this.state || !tile) break;
        const idx = this.state.currentPlayerIndex;
        // Enforce the required opening tile (highest double) on the first play of a round.
        if (!this.state.firstPlayMade && this.state.requiredFirstTile) {
          const r = this.state.requiredFirstTile as Tile;
          const matches =
            (tile[0] === r[0] && tile[1] === r[1]) ||
            (tile[0] === r[1] && tile[1] === r[0]);
          if (!matches) {
            this._trigger('game:error', { message: 'A primeira pedra deve ser a maior dupla' });
            break;
          }
        }
        this.state = applyMove(this.state, idx, tile as Tile, side, flipped);
        this._trigger('game:state', this.state);
        if (this.state.status === 'finished') {
          setTimeout(() => this._triggerEnd(), 600);
        } else {
          setTimeout(() => this._botTurn(), 1200);
        }
        break;
      }

      case 'game:draw': {
        if (!this.state || this.state.boneyard.length === 0) break;
        const idx    = this.state.currentPlayerIndex;
        const [drawn, ...rest] = this.state.boneyard;
        this.state = {
          ...this.state,
          boneyard: rest,
          players: this.state.players.map((p: any, i: number) =>
            i === idx ? { ...p, hand: [...p.hand, drawn] } : p
          ),
        };
        this._trigger('game:state', this.state);
        break;
      }

      case 'game:pass': {
        if (!this.state) break;
        const consecutivePasses = (this.state.consecutivePasses ?? 0) + 1;
        const numPlayers = this.state.players.length;
        if (consecutivePasses >= numPlayers) {
          this.state = { ...this.state, status: 'finished', consecutivePasses };
          this._trigger('game:state', this.state);
          setTimeout(() => this._triggerEnd(), 600);
          break;
        }
        this.state = {
          ...this.state,
          currentPlayerIndex: (this.state.currentPlayerIndex + 1) % numPlayers,
          turnCount: this.state.turnCount + 1,
          consecutivePasses,
        };
        this._trigger('game:state', this.state);
        setTimeout(() => this._botTurn(), 1200);
        break;
      }

      case 'game:sync_request': {
        if (this.state) {
          setTimeout(() => this._trigger('game:state', this.state), 80);
        }
        break;
      }

      default: break;
    }
    return this;
  }

  // ── Bot AI ──────────────────────────────────────────────────────────────────

  private _botTurn() {
    if (!this.state || this.state.status !== 'playing') return;
    const idx    = this.state.currentPlayerIndex;
    const player = this.state.players[idx];
    if (!player?.isBot) return;

    const { leftOpen, rightOpen, firstPlayMade, boneyard, requiredFirstTile } = this.state;

    // Try to play a tile
    for (const tile of player.hand as Tile[]) {
      if (!tile) continue;
      const play = findPlay(tile, leftOpen, rightOpen, firstPlayMade, requiredFirstTile);
      if (play) {
        this.state = applyMove(this.state, idx, tile, play.side, play.flipped);
        this._trigger('game:state', this.state);
        if (this.state.status === 'finished') {
          setTimeout(() => this._triggerEnd(), 600);
        } else {
          const next = this.state.players[this.state.currentPlayerIndex];
          if (next?.isBot) setTimeout(() => this._botTurn(), 1200);
        }
        return;
      }
    }

    // Draw from boneyard
    if (boneyard.length > 0) {
      const [drawn, ...rest] = this.state.boneyard;
      this.state = {
        ...this.state,
        boneyard: rest,
        players: this.state.players.map((p: any, i: number) =>
          i === idx ? { ...p, hand: [...p.hand, drawn] } : p
        ),
      };
      this._trigger('game:state', this.state);
      setTimeout(() => this._botTurn(), 1200);
      return;
    }

    // Pass
    const consecutivePasses = (this.state.consecutivePasses ?? 0) + 1;
    const numPlayers = this.state.players.length;
    if (consecutivePasses >= numPlayers) {
      // All players passed with empty boneyard — blocked game, trigger end
      this.state = { ...this.state, status: 'finished', consecutivePasses };
      this._trigger('game:state', this.state);
      setTimeout(() => this._triggerEnd(), 600);
      return;
    }
    this.state = {
      ...this.state,
      currentPlayerIndex: (this.state.currentPlayerIndex + 1) % numPlayers,
      turnCount: this.state.turnCount + 1,
      consecutivePasses,
    };
    this._trigger('game:state', this.state);
    const next = this.state.players[this.state.currentPlayerIndex];
    if (next?.isBot) setTimeout(() => this._botTurn(), 1200);
  }

  private _triggerEnd() {
    if (!this.state) return;

    const prevScores = this.state.matchScores ?? { 1: 0, 2: 0 };
    const newScores: Record<number, number> = { ...prevScores };
    const targetScore: number = this.state.targetScore ?? 6;
    const roundNumber: number = this.state.roundNumber ?? 1;

    // Determine the round outcome.
    const handWinner = this.state.players.find(
      (p: any) => (p.hand?.filter(Boolean).length ?? 0) === 0
    );

    let winnerTeam: number | null = null;
    let winType: string = 'simples';
    let points = 0;

    if (handWinner) {
      // Win by emptying the hand — win type from the last placed tile.
      const lastBoardTile = this.state.board[this.state.board.length - 1];
      const lastTile = lastBoardTile?.tile as [number, number] | undefined;
      winType = lastTile && lastTile[0] === lastTile[1] ? 'carroca' : 'simples';
      points = winType === 'carroca' ? 2 : 1;
      winnerTeam = handWinner.team ?? null;
    } else {
      // Blocked game — count remaining pips per team. Fewer pips wins 1 point.
      // Only a true pip tie counts as an empate (draw).
      const teamPips: Record<number, number> = {};
      this.state.players.forEach((p: any) => {
        const pips = (p.hand ?? []).reduce(
          (sum: number, t: Tile) => sum + (t ? t[0] + t[1] : 0),
          0
        );
        teamPips[p.team] = (teamPips[p.team] ?? 0) + pips;
      });
      const teams = Object.keys(teamPips).map(Number);
      if (teams.length >= 2) {
        const sorted = [...teams].sort((a, b) => teamPips[a] - teamPips[b]);
        const lower = sorted[0];
        const higher = sorted[sorted.length - 1];
        if (teamPips[lower] !== teamPips[higher]) {
          winnerTeam = lower;
          winType = 'simples';
          points = 1;
        }
        // else: equal pips → empate (winnerTeam stays null)
      }
    }

    if (winnerTeam !== null) {
      newScores[winnerTeam] = (newScores[winnerTeam] ?? 0) + points;
    }

    const matchOver = (newScores[1] ?? 0) >= targetScore || (newScores[2] ?? 0) >= targetScore;
    const matchWinnerTeam = matchOver ? ((newScores[1] ?? 0) >= targetScore ? 1 : 2) : null;

    // winnerId for the result screen: prefer the hand winner, else first player on the winning team.
    const winnerPlayer =
      handWinner ??
      (winnerTeam !== null
        ? this.state.players.find((p: any) => p.team === winnerTeam) ?? null
        : null);

    this._trigger('game:round_ended', {
      roundNumber,
      winnerTeam,
      winnerId:        winnerPlayer?.userId ?? null,
      winType,
      points,
      matchScores:     newScores,
      targetScore,
      matchOver,
      matchWinnerTeam,
    });

    if (matchOver) {
      setTimeout(() => {
        this._trigger('game:ended', {
          winnerId:       winnerPlayer?.userId ?? null,
          winnerTeam:     matchWinnerTeam,
          prizePool:      0,
          prizePerWinner: 0,
        });
      }, 3500);
      return;
    }

    // Restart next round after 4 s (banner shows for 3.5 s).
    setTimeout(() => {
      const deck = shuffle([...VISIBLE_TILES]);
      const tilesPerPlayer = 6;
      const playerCount = this.state.players.length;
      const is2v2 = playerCount >= 4;
      const players = this.state.players.map((p: any, i: number) => ({
        ...p,
        hand: deck.slice(i * tilesPerPlayer, (i + 1) * tilesPerPlayer) as Tile[],
      }));
      // 1v1 keeps a boneyard (fresh tiles); 2v2 deals everything (matches the initial deal).
      const boneyard = (is2v2 ? [] : deck.slice(playerCount * tilesPerPlayer)) as Tile[];
      const opener = findHighestDouble(players);
      this.state = {
        ...this.state,
        players,
        board: [], leftOpen: -1, rightOpen: -1,
        boneyard,
        firstPlayMade: false, status: 'playing',
        turnCount: 0,
        consecutivePasses: 0,
        currentPlayerIndex: opener?.playerIdx ?? 0,
        requiredFirstTile: opener?.tile ?? null,
        matchScores: newScores,
        roundNumber: roundNumber + 1,
      };
      this._trigger('game:state', this.state);
      if (this.state.players[this.state.currentPlayerIndex]?.isBot) {
        setTimeout(() => this._botTurn(), 1200);
      }
    }, 4000);
  }

  _trigger(event: string, ...args: any[]) {
    (this.listeners.get(event) ?? []).forEach((cb) => cb(...args));
    (this.onceMap.get(event) ?? []).forEach((cb) => cb(...args));
    this.onceMap.delete(event);
  }

  setInitialState(state: any) {
    // If it's a fresh game with no board, re-deal shuffled hands so bots get a proper mix
    if (state && (!state.board || state.board.length === 0) && !state.firstPlayMade) {
      const deck = shuffle([...VISIBLE_TILES]);
      // FIX: Always deal 6 tiles per player
      const tilesPerPlayer = 6;
      const players = state.players.map((p: any, i: number) => ({
        ...p,
        hand: deck.slice(i * tilesPerPlayer, (i + 1) * tilesPerPlayer),
      }));
      // Determine who holds the highest double — they go first and must play it
      const opener = findHighestDouble(players);
      this.state = {
        ...state,
        players,
        currentPlayerIndex: opener ? opener.playerIdx : 0,
        requiredFirstTile: opener ? opener.tile : null,
      };
    } else {
      this.state = state;
    }
  }

  disconnect() {}
}

export const fakeSocket = new FakeSocket();

// Fake online count
setTimeout(() => fakeSocket._trigger('online:count', { count: 6654 }), 600);
setInterval(() => {
  fakeSocket._trigger('online:count', { count: 5000 + Math.floor(Math.random() * 4000) });
}, 8000);
