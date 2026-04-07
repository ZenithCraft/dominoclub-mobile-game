# Milestone 3 — Matchmaking & Stability

> **Status:** Complete
> **Completion date:** April 2026
> **Goal:** 1v1 matchmaking queue hardening · state synchronization guarantees · multi-user integration testing · structured match logging

---

## Table of Contents

- [What was delivered](#what-was-delivered)
- [Implementation details](./implementation.md)
- [Test coverage](./tests.md)

---

## What was delivered

### 1. Matchmaking Queue — Variant Support & Input Validation

The existing in-memory queue was extended to carry a **game variant** (`CARROCA`, `L_E_L`, `CRUZADA`) so that players are only matched with opponents who chose the same ruleset.

- `QueueEntry` gains a `variant` field; the field is mandatory internally but the `queue:join` socket event accepts it as optional (defaults to `CARROCA` for backwards-compatibility with older clients)
- `tryMatch()` now guards on `a.variant === b.variant` before comparing bet amounts — players with different variants never match
- Bot injection inherits the waiting player's variant, so the bot always plays by the same rules as the human
- `createMatch()` passes `variant` to `prisma.game.create` — previously the DB record relied on the schema default (`CARROCA`) regardless of what the player selected
- `queue:join` validates all three input fields before accepting the entry:
  - `mode` must be one of `ARENA_1V1 | CUP_1V1 | TOURNAMENT_2V2 | RECREATIONAL_2V2`
  - `betAmount` must be a non-negative number
  - `variant`, if provided, must be one of the three supported values
- `queue:joined` now returns `{ mode, betAmount, variant, position, botWaitSeconds }` — `position` is the 1-based slot in the queue so the client can display "Position 2 in queue"

### 2. Stale Queue Cleanup

Queue entries that do not find a match within 5 minutes are automatically evicted.

- `startQueueCleanup()` runs a 30-second interval that walks all queues and removes entries older than `QUEUE_STALE_MS` (5 min)
- The evicted player's socket receives `queue:expired { message }` so the UI can reset to the mode-select screen
- Bot entries are never evicted (they only exist for the duration of the injection window)

### 3. State Synchronization — Sequence Numbers

Every `game:state` emission now carries a monotonically increasing sequence number (`seq`).

- `gameStateSeq: Map<string, number>` tracks a per-game counter in memory; it starts at 0 when the game is initialized and increments on every call to `broadcastGameState()`
- `seq` is appended to the event payload **after** the masked player view is constructed, so it does not affect game logic
- Clients can implement a one-line guard to drop stale events: `if (state.seq <= lastSeq) return`
- The counter is deleted from the map when the game ends (both `FINISHED` and `ABANDONED`) to prevent memory leaks

### 4. Explicit State Resync — `game:sync_request`

A new socket event lets clients explicitly request the current game state at any time.

- `game:sync_request { gameId }` → server responds with the current masked `game:state` + `seq` on the requesting socket only (not broadcast)
- The server verifies the requesting socket belongs to a player in the game before sending
- Designed for use after tab-switch, backgrounding, or any situation where the client suspects it may have missed events

### 5. Structured Match Logs — `logs/matches.log`

A dedicated Winston logger (`matchLogger`) writes one JSON line per significant match event, always — in both development and production.

Three event types are logged per match:

| Event | When | Key fields |
|---|---|---|
| `match_start` | `startGame()` | `matchId`, `variant`, `betAmount`, `players[]` (team, seat, isBot) |
| `round_end` | `handleGameEnd()` per round | `matchId`, `round`, `winnerTeam`, `winType`, `points`, `matchScores` |
| `match_end` | `finalizeMatch()` | `matchId`, `status`, `prizePool`, `prizePerWinner`, `matchWinnerTeam`, `rounds`, `totalMoves`, `players[]` (pips remaining) |

`logs/matches.log` is separate from `logs/combined.log` so match events can be queried independently without filtering through general server noise.

### 6. Multi-user Integration Test Script

`scripts/test-multiplayer.ts` runs a full two-player match end-to-end against a live server.

```
npx ts-node scripts/test-multiplayer.ts
# or
npm run test:multiplayer
```

The script:
1. Calls `POST /auth/dev/login` twice to obtain two distinct JWT tokens
2. Opens two Socket.io connections, one per player
3. Both emit `queue:join` → server matches them into the same game
4. Both emit `game:join` → game initialises, state broadcast begins
5. Each socket auto-plays moves on `game:state`: first valid tile → draw → pass (in that priority)
6. Listens for `game:round_ended` to log score progression and `game:ended` to print the final result
7. Validates that both players landed in the **same** `gameId`; exits non-zero if they did not

Output:

```
══════════════ RESULT ══════════════
  Status:      FINISHED
  WinnerTeam:  1
  MatchScores: {"1":7,"2":3}
  PrizePool:   R$ 0
  P1 moves:    18
  P2 moves:    14
════════════════════════════════════
```

Environment variables accepted:

| Variable | Default | Purpose |
|---|---|---|
| `API_URL` | `http://localhost:3000/api/v1` | Backend REST base |
| `SOCKET_URL` | `http://localhost:3000` | Socket.io endpoint |
| `BET_AMOUNT` | `0` | Bet per player (R$) |
| `VARIANT` | `CARROCA` | Game variant |
| `TIMEOUT_MS` | `120000` | Max duration before the script aborts |

---

## Quick Links

| Document | Content |
|---|---|
| [implementation.md](./implementation.md) | Design decisions, flows, code references |
| [tests.md](./tests.md) | How to run the test script, known gaps, next steps |
| [../backend-architecture.md](../backend-architecture.md) | Full Socket.io event and REST API reference |
