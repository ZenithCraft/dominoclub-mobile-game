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

function firstPlay(tile: Tile): { side: Side; flipped: boolean } {
  return { side: 'left', flipped: false };
}

function findPlay(
  tile: Tile,
  leftOpen: number,
  rightOpen: number,
  firstPlayMade: boolean,
): { side: Side; flipped: boolean } | null {
  if (!firstPlayMade) return firstPlay(tile);
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
    currentPlayerIndex: nextIdx,
    turnCount: state.turnCount + 1,
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
        const gameId = this.lastQueueMode?.includes('2V2') ? 'demo-2v2' : 'demo-1';
        setTimeout(() => this._trigger('game:found', { gameId }), 800);
        break;
      }

      case 'game:join': {
        // If state was pre-seeded (e.g. by the dev mock useEffect), just re-emit it
        if (this.state !== null) {
          setTimeout(() => this._trigger('game:state', this.state), 200);
          break;
        }

        const gameId = args[0]?.gameId ?? 'demo-1';
        const myId   = useAuthStore.getState().user?.id ?? 'p1';
        const myName = useAuthStore.getState().user?.name ?? 'Você';
        const is2v2  = String(gameId).includes('2v2') || !!this.lastQueueMode?.includes('2V2');

        const deck = shuffle(VISIBLE_TILES);

        if (is2v2) {
          // 27 tiles available (all except [1,2]): deal 7 each, last bot gets 6
          this.state = {
            id: gameId, mode: 'RECREATIONAL_2V2', variant: 'CARROCA',
            players: [
              { userId: myId,  name: myName,        team: 1, seat: 0, hand: deck.slice(0,  7), isBot: false, connected: true },
              { userId: 'p2',  name: 'Adversário 1', team: 2, seat: 1, hand: deck.slice(7,  14), isBot: true,  connected: true },
              { userId: 'p3',  name: 'Parceiro',     team: 1, seat: 2, hand: deck.slice(14, 21), isBot: true,  connected: true },
              { userId: 'p4',  name: 'Adversário 2', team: 2, seat: 3, hand: deck.slice(21, 27), isBot: true,  connected: true },
            ],
            board: [], leftOpen: -1, rightOpen: -1,
            currentPlayerIndex: 0, turnCount: 1,
            status: 'playing', boneyard: [], firstPlayMade: false,
          };
        } else {
          // 1v1: 7 + 7 player tiles, 7 boneyard — all from visible set
          this.state = {
            id: gameId, mode: 'ARENA_1V1', variant: 'CARROCA',
            players: [
              { userId: myId, name: myName,    team: 1, seat: 0, hand: deck.slice(0, 7), isBot: false, connected: true },
              { userId: 'p2', name: 'Fuad HBK', team: 2, seat: 1, hand: deck.slice(7,14), isBot: true,  connected: true },
            ],
            board: [], leftOpen: -1, rightOpen: -1,
            currentPlayerIndex: 0, turnCount: 1,
            status: 'playing', boneyard: deck.slice(14), firstPlayMade: false,
          };
        }

        setTimeout(() => this._trigger('game:state', this.state), 200);
        break;
      }

      case 'game:move': {
        const { tile, side, flipped } = args[0] ?? {};
        if (!this.state || !tile) break;
        const idx = this.state.currentPlayerIndex;
        this.state = applyMove(this.state, idx, tile as Tile, side, flipped);
        this._trigger('game:state', this.state);
        if (this.state.status === 'finished') {
          setTimeout(() => this._triggerEnd(), 600);
        } else {
          setTimeout(() => this._botTurn(), 900);
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
        this.state = {
          ...this.state,
          currentPlayerIndex: (this.state.currentPlayerIndex + 1) % this.state.players.length,
          turnCount: this.state.turnCount + 1,
        };
        this._trigger('game:state', this.state);
        setTimeout(() => this._botTurn(), 900);
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

    const { leftOpen, rightOpen, firstPlayMade, boneyard } = this.state;

    // Try to play a tile
    for (const tile of player.hand as Tile[]) {
      if (!tile) continue;
      const play = findPlay(tile, leftOpen, rightOpen, firstPlayMade);
      if (play) {
        this.state = applyMove(this.state, idx, tile, play.side, play.flipped);
        this._trigger('game:state', this.state);
        if (this.state.status === 'finished') {
          setTimeout(() => this._triggerEnd(), 600);
        } else {
          const next = this.state.players[this.state.currentPlayerIndex];
          if (next?.isBot) setTimeout(() => this._botTurn(), 900);
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
      setTimeout(() => this._botTurn(), 600);
      return;
    }

    // Pass
    this.state = {
      ...this.state,
      currentPlayerIndex: (this.state.currentPlayerIndex + 1) % this.state.players.length,
      turnCount: this.state.turnCount + 1,
    };
    this._trigger('game:state', this.state);
    const next = this.state.players[this.state.currentPlayerIndex];
    if (next?.isBot) setTimeout(() => this._botTurn(), 900);
  }

  private _triggerEnd() {
    const winner = this.state?.players.find((p: any) => p.hand.length === 0);
    this._trigger('game:ended', {
      winnerId:      winner?.userId ?? null,
      winnerTeam:    winner?.team ?? null,
      prizePool:     0,
      prizePerWinner: 0,
    });
  }

  _trigger(event: string, ...args: any[]) {
    (this.listeners.get(event) ?? []).forEach((cb) => cb(...args));
    (this.onceMap.get(event) ?? []).forEach((cb) => cb(...args));
    this.onceMap.delete(event);
  }

  setInitialState(state: any) {
    this.state = state;
  }

  disconnect() {}
}

export const fakeSocket = new FakeSocket();

// Fake online count
setTimeout(() => fakeSocket._trigger('online:count', { count: 6654 }), 600);
setInterval(() => {
  fakeSocket._trigger('online:count', { count: 5000 + Math.floor(Math.random() * 4000) });
}, 8000);
