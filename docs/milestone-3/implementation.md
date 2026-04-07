# Milestone 3 — Implementation Details

---

## 1. Matchmaking — Variant-Aware Queue

**Files:** `apps/backend/src/services/matchmaking.service.ts` · `apps/backend/src/socket/index.ts`

### QueueEntry schema

```typescript
export interface QueueEntry {
  userId:    string;
  socketId:  string;
  betAmount: number;
  variant:   'CARROCA' | 'L_E_L' | 'CRUZADA';  // ← new
  mode:      'ARENA_1V1' | 'CUP_1V1' | 'TOURNAMENT_2V2' | 'RECREATIONAL_2V2';
  joinedAt:  number;
  isBot?:    boolean;
}
```

### Matching condition (1v1)

```typescript
// Before (Milestone 2): bet tolerance only
if (diff <= config.game.matchmakingBetTolerance) { ... }

// After (Milestone 3): variant must also match
if (a.variant !== b.variant) continue;
if (diff <= config.game.matchmakingBetTolerance) { ... }
```

This prevents a CRUZADA player from being matched with a CARROCA player even if their bets are identical.

### Matching condition (2v2)

The 2v2 path now also requires all four players to share the same variant. The matching algorithm scans the sorted-by-bet queue and finds the first group of four with a consistent `variant` value:

```typescript
for (let i = 0; i <= sorted.length - 4; i++) {
  const candidate = sorted[i].variant;
  const group = sorted.slice(i)
    .filter((e) => e.variant === candidate)
    .slice(0, 4);
  if (group.length < 4) continue;
  createMatch(group, mode);
  return;
}
```

### Variant propagation through the stack

```
queue:join { mode, betAmount, variant? }
  → validated in socket/index.ts (default 'CARROCA' if absent)
  → stored in QueueEntry.variant
  → tryMatch() guards on variant equality
  → createMatch() reads players[0].variant → prisma.game.create { variant }
  → startGame() reads game.variant from DB → initGame(gameId, variant, players)
  → GameState.variant used by engine for CRUZADA cross-arm logic and L_E_L scoring
```

Prior to this milestone `createMatch()` did not write `variant` to the database — the game defaulted to `CARROCA` regardless of player selection.

### Input validation (socket/index.ts)

Three guards are applied before `enqueue()` is called:

```typescript
if (!VALID_MODES.includes(data.mode as any))
  → emit queue:error { message: 'Modo de jogo inválido' }

if (typeof data.betAmount !== 'number' || data.betAmount < 0)
  → emit queue:error { message: 'Valor de aposta inválido' }

// variant defaults to CARROCA if absent or unrecognised
const variant = VALID_VARIANTS.includes(data.variant) ? data.variant : 'CARROCA';
```

The wallet balance check (already in Milestone 2) runs after these guards.

---

## 2. Stale Queue Cleanup

**File:** `apps/backend/src/services/matchmaking.service.ts`

### Design

Stale entries can accumulate when:
- A player's bot timer fires but the bot fails to create (e.g. DB is down)
- A player disconnects without emitting `queue:leave` (handled by the disconnect listener but defensive cleanup is useful)
- A queue entry is created in a mode with very few concurrent users

```typescript
const QUEUE_STALE_MS = 5 * 60 * 1000; // 5 minutes

export function startQueueCleanup(
  onExpired: (userId: string, socketId: string) => void
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    queues.forEach((queue) => {
      for (let i = queue.length - 1; i >= 0; i--) {
        const entry = queue[i];
        if (!entry.isBot && now - entry.joinedAt > QUEUE_STALE_MS) {
          queue.splice(i, 1);
          logger.info('Queue entry expired (stale)', { userId: entry.userId, mode: entry.mode });
          onExpired(entry.userId, entry.socketId);
        }
      }
    });
  }, 30_000);
}
```

Walking the queue backwards (high index to 0) avoids index-shift bugs when splicing during iteration.

### Notification to the client

`createSocketServer()` starts the cleanup interval and converts expirations into a socket event:

```typescript
startQueueCleanup((userId, _socketId) => {
  io.to(`user:${userId}`).emit('queue:expired', {
    message: 'Tempo de espera esgotado. Tente novamente.',
  });
});
```

The private room `user:<userId>` was already established at connection time (Milestone 2), so no additional room join is needed.

---

## 3. State Synchronization — Sequence Numbers

**File:** `apps/backend/src/socket/gameSocket.ts`

### Problem

Socket.io delivers events in order over a single TCP connection but a reconnect or transport upgrade can result in two `game:state` events arriving out of order:

1. Server emits state at seq=5 (player's move)
2. Client disconnects briefly
3. Server emits state at seq=6 (opponent's move) — buffered
4. Client reconnects; server sends current state at seq=6 via `game:join` re-join
5. Client receives the buffered seq=6 first, then the explicit seq=6 again

Without sequencing, the client cannot tell which is current. With `seq` the client can drop any event where `seq <= lastSeq`.

### Implementation

```typescript
// In-memory per-game counter — not persisted (no DB schema change needed)
const gameStateSeq = new Map<string, number>();

function broadcastGameState(gameId: string, state: GameState, io: SocketServer) {
  const seq = (gameStateSeq.get(gameId) ?? 0) + 1;
  gameStateSeq.set(gameId, seq);

  state.players.forEach((player) => {
    const view = getPlayerView(state, player.userId); // mask opponent hands
    io.to(`user:${player.userId}`).emit('game:state', { ...view, seq });
  });
}
```

The counter is deleted on game end (both `FINISHED` and `ABANDONED`) to prevent unbounded map growth:

```typescript
// In handleGameEnd():
activeGames.delete(gameId);
gameStateSeq.delete(gameId);   // ← cleanup
```

The reconnect path also supplies the current `seq`:

```typescript
// In game:join handler (reconnect branch):
const seq = gameStateSeq.get(gameId) ?? 0;
const playerState = getPlayerView(state, user.id);
socket.emit('game:state', { ...playerState, seq });
```

### Client-side guard (recommended pattern)

```typescript
// In the mobile game store or GameScreen:
let lastSeq = -1;
socket.on('game:state', (state) => {
  if (state.seq <= lastSeq) return; // discard stale/duplicate
  lastSeq = state.seq;
  setGame(state);
});
```

---

## 4. Explicit State Resync — `game:sync_request`

**File:** `apps/backend/src/socket/gameSocket.ts`

### When to use

- App was backgrounded and the OS killed the socket connection
- Client suspects it may have missed a state update (e.g. poor network conditions)
- After a transport upgrade from polling to WebSocket

### Handler

```typescript
socket.on('game:sync_request', ({ gameId }: { gameId: string }) => {
  const state = activeGames.get(gameId);
  if (!state) {
    socket.emit('game:error', { message: 'Game not active' });
    return;
  }
  const isPlayer = state.players.some((p) => p.userId === user.id);
  if (!isPlayer) return; // silent reject — not in this game

  const seq = gameStateSeq.get(gameId) ?? 0;
  const view = getPlayerView(state, user.id);
  socket.emit('game:state', { ...view, seq });
});
```

The response is unicast to the requesting socket only (not broadcast). The `seq` value reflects the current counter so the client can apply the same guard as normal state events.

---

## 5. Structured Match Logs

**Files:** `apps/backend/src/utils/logger.ts` · `apps/backend/src/socket/gameSocket.ts`

### matchLogger

```typescript
export const matchLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/matches.log' }),
  ],
});
```

`logs/matches.log` is always written — both in `development` and `production`. The regular `logs/combined.log` is only written in production.

### Event schema

Each line in `logs/matches.log` is a self-contained JSON object. The `event` field is the discriminator.

#### `match_start`

```json
{
  "timestamp": "2026-04-06T14:23:01.452Z",
  "level": "info",
  "message": "match_start",
  "event": "match_start",
  "matchId": "a1b2c3d4-...",
  "variant": "CARROCA",
  "betAmount": 10,
  "mode": "ARENA_1V1",
  "players": [
    { "userId": "...", "team": 1, "seat": 0, "isBot": false },
    { "userId": "...", "team": 2, "seat": 1, "isBot": false }
  ]
}
```

#### `round_end`

```json
{
  "timestamp": "2026-04-06T14:24:18.100Z",
  "level": "info",
  "message": "round_end",
  "event": "round_end",
  "matchId": "a1b2c3d4-...",
  "round": 1,
  "winnerTeam": 1,
  "winnerId": "user-uuid",
  "winType": "carroca",
  "points": 2,
  "matchScores": { "1": 2, "2": 0 },
  "matchOver": false
}
```

#### `match_end`

```json
{
  "timestamp": "2026-04-06T14:26:45.880Z",
  "level": "info",
  "message": "match_end",
  "event": "match_end",
  "matchId": "a1b2c3d4-...",
  "status": "FINISHED",
  "mode": "ARENA_1V1",
  "betAmount": 10,
  "prizePool": 18,
  "prizePerWinner": 18,
  "matchWinnerTeam": 1,
  "winnerId": "user-uuid",
  "matchScores": { "1": 7, "2": 3 },
  "rounds": 4,
  "totalMoves": 62,
  "players": [
    { "userId": "...", "team": 1, "isBot": false, "pips": 0 },
    { "userId": "...", "team": 2, "isBot": false, "pips": 14 }
  ]
}
```

### Querying match logs

Because every line is valid JSON, standard tools work without special parsers:

```bash
# All events for a specific match
grep '"matchId":"a1b2c3d4"' logs/matches.log | jq .

# All match_end events today
grep '"event":"match_end"' logs/matches.log | jq 'select(.timestamp | startswith("2026-04-06"))'

# Average moves per completed match
grep '"event":"match_end"' logs/matches.log | jq '.totalMoves' | awk '{sum+=$1; n++} END {print sum/n}'

# All forfeited matches
grep '"status":"ABANDONED"' logs/matches.log | jq '{matchId, winnerId: .winnerId}'
```

---

## 6. Multi-user Test Script

**File:** `apps/backend/scripts/test-multiplayer.ts`

### Architecture

The script is a standalone Node.js process (no test runner) that creates **two** Socket.io client connections against a running backend.

```
main()
  ├── devLogin('P1') ──┐  POST /auth/dev/login (parallel)
  ├── devLogin('P2') ──┘
  ├── connectSocket('P1', token1)
  ├── connectSocket('P2', token2)
  ├── P1.emit('queue:join', ...)
  ├── P2.emit('queue:join', ...)
  ├── await game:found on both sockets (validates same gameId)
  ├── P1.emit('game:join', { gameId })
  ├── P2.emit('game:join', { gameId })
  └── play loop
        on game:state → pickMove() → emit game:move | game:draw | game:pass
        on game:ended → print result → process.exit(0)
```

### Move picker (client-side engine replica)

`pickMove()` implements the same rules as `canPlayTile()` in the server engine:

```
1. If firstPlayMade is false → play any tile on 'left' side (first move)
2. Build openEnds from leftOpen, rightOpen, topOpen, bottomOpen
3. For each tile in hand:
     for each open end:
       if tile[0] === end.value → play, flipped: false
       if tile[1] === end.value → play, flipped: true
4. No match → draw (if boneyard.length > 0)
5. No match + empty boneyard → pass
```

### Stale state guard

The script applies the same `seq` guard recommended for the mobile client:

```typescript
const handleState = (session: PlayerSession) => (state: GameStateView) => {
  if (state.seq <= session.lastSeq) return; // discard stale
  session.lastSeq = state.seq;
  playNextMove(session, state);
};
```

### Limitations

- Requires `NODE_ENV=development` (the `/auth/dev/login` endpoint is disabled in production)
- Does not cover CRUZADA (`topOpen` / `bottomOpen`) — the move picker handles it structurally but the default variant used is `CARROCA`
- Does not test 2v2 (four simultaneous connections would be needed)
- The script is not a Jest test and does not assert specific game outcomes beyond both players ending in the same game and a `game:ended` event being received

---

## Summary of Changes

| File | Type | What changed |
|---|---|---|
| `src/services/matchmaking.service.ts` | Modified | `QueueEntry.variant`; variant-aware `tryMatch`; `createMatch` passes variant to DB; bot inherits variant; `startQueueCleanup`; `getQueuePosition` |
| `src/socket/index.ts` | Modified | Input validation; variant defaulting; starts queue cleanup; `queue:joined` includes `position`; imports `getQueuePosition` |
| `src/socket/gameSocket.ts` | Modified | `gameStateSeq` map; seq in `broadcastGameState`; seq cleanup on game end; `game:sync_request` handler; `matchLogger` calls in `startGame`, `handleGameEnd`, `finalizeMatch`; reconnect logs |
| `src/utils/logger.ts` | Modified | Added `matchLogger` export |
| `scripts/test-multiplayer.ts` | Created | Full two-player integration test script |
| `package.json` | Modified | `"test:multiplayer"` script added |
