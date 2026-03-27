import { useAuthStore } from '../store/auth.store';

type Listener = (...args: any[]) => void;

class FakeSocket {
  private listeners  = new Map<string, Listener[]>();
  private onceMap    = new Map<string, Listener[]>();
  private lastQueueMode: string | null = null;
  readonly connected = true;
  readonly id        = 'demo-socket';

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
    if (event === 'queue:join') {
      this.lastQueueMode = args[0]?.mode ?? null;
      setTimeout(() => {
        const gameId = this.lastQueueMode?.includes('2V2') ? 'demo-2v2' : 'demo-1';
        this._trigger('game:found', { gameId });
      }, 800);
    }
    if (event === 'game:join') {
      const gameId = args[0]?.gameId ?? 'demo-1';
      // Use the actual logged-in user's ID so myHand resolves correctly
      const myId = useAuthStore.getState().user?.id ?? 'p1';
      const is2v2 = String(gameId).includes('2v2') || this.lastQueueMode?.includes('2V2');
      const state = is2v2
        ? {
            id: gameId,
            mode: 'RECREATIONAL_2V2',
            variant: 'CARROCA',
            players: [
              { userId: myId, name: useAuthStore.getState().user?.name ?? 'Você', team: 1, seat: 0, hand: [[6,6],[6,5],[5,3],[2,1],[0,0],[4,2],[1,1]], isBot: false, connected: true },
              { userId: 'p2', name: 'Adversário 1', team: 2, seat: 1, hand: [[2,2],[3,4],[5,0],[6,1],[4,0],[3,0],[2,0]], isBot: false, connected: true },
              { userId: 'p3', name: 'Parceiro', team: 1, seat: 2, hand: [[1,2],[2,6],[0,1],[4,4],[5,5],[3,3],[0,6]], isBot: false, connected: true },
              { userId: 'p4', name: 'Adversário 2', team: 2, seat: 3, hand: [[1,1],[1,6],[2,5],[3,6],[4,6],[0,5],[0,3]], isBot: false, connected: true },
            ],
            board: [],
            leftOpen: -1,
            rightOpen: -1,
            currentPlayerIndex: 0,
            turnCount: 1,
            status: 'playing',
            boneyard: Array.from({ length: 14 }).fill(null),
            firstPlayMade: false,
          }
        : {
            id: gameId,
            mode: 'ARENA_1V1',
            variant: 'CARROCA',
            players: [
              { userId: myId, name: useAuthStore.getState().user?.name ?? 'Você', team: 1, seat: 0, hand: [[6,6],[6,5],[5,3],[2,1],[0,0],[4,2],[1,1]], isBot: false, connected: true },
              { userId: 'p2', name: 'Fuad HBK', team: 2, seat: 1, hand: [[2,2],[3,4],[5,0],[6,1],[4,0],[3,0],[2,0]], isBot: false, connected: true },
            ],
            board: [],
            leftOpen: -1,
            rightOpen: -1,
            currentPlayerIndex: 0,
            turnCount: 1,
            status: 'playing',
            boneyard: Array.from({ length: 14 }).fill(null),
            firstPlayMade: false,
          };
      setTimeout(() => this._trigger('game:state', state), 200);
    }
    if (event === 'game:move') {
      // no-op for demo
    }
    return this;
  }

  _trigger(event: string, ...args: any[]) {
    (this.listeners.get(event) ?? []).forEach((cb) => cb(...args));
    (this.onceMap.get(event) ?? []).forEach((cb) => cb(...args));
    this.onceMap.delete(event);
  }

  disconnect() {}
}

export const fakeSocket = new FakeSocket();

// Emit a fake online count shortly after boot, then periodically
setTimeout(() => fakeSocket._trigger('online:count', { count: 6654 }), 600);
setInterval(() => {
  fakeSocket._trigger('online:count', { count: 5000 + Math.floor(Math.random() * 4000) });
}, 8000);
