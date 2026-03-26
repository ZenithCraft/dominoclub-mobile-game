type Listener = (...args: any[]) => void;

class FakeSocket {
  private listeners  = new Map<string, Listener[]>();
  private onceMap    = new Map<string, Listener[]>();
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
      // Simulate "no match found" in demo mode after 2 s
      setTimeout(() => {
        this._trigger('queue:error', { message: '[DEMO] Partidas indisponíveis no modo demonstração' });
      }, 2000);
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
