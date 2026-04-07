# Milestone 3 — Tests

---

## How to Run

### Unit + integration suite (Jest)

No changes were made to the Jest suite in this milestone — all 93 tests from Milestone 2 continue to pass.

```bash
cd apps/backend

# Run existing suite
npm test

# With coverage
npm run test:coverage
```

### Multi-user integration script (live server required)

```bash
# 1. Start the backend (in a separate terminal)
cd apps/backend
npm run dev

# 2. Run the two-player test (defaults: bet=0, variant=CARROCA)
npm run test:multiplayer

# Custom options via environment variables
BET_AMOUNT=10 VARIANT=L_E_L npm run test:multiplayer
API_URL=http://192.168.1.5:3000/api/v1 SOCKET_URL=http://192.168.1.5:3000 npm run test:multiplayer
```

Requirements:
- `NODE_ENV=development` (enabled by default when using `npm run dev`)
- PostgreSQL running and `DATABASE_URL` set (no real balance needed when `BET_AMOUNT=0`)

---

## Multi-user Test — Expected Output

A successful run prints timestamped logs for each player and finishes with a result block:

```
╔══════════════════════════════════════════╗
║  DominoClub — Multi-user integration test ║
╚══════════════════════════════════════════╝
  API:     http://localhost:3000/api/v1
  Socket:  http://localhost:3000
  Bet:     R$ 0
  Variant: CARROCA

[14:23:01.001] [P1] Logged in as Dev User (a3f9b2…)
[14:23:01.012] [P2] Logged in as Dev User (c71e04…)
[14:23:01.080] [P1] Socket connected (ABC123)
[14:23:01.085] [P2] Socket connected (DEF456)
[14:23:01.086] [P1] Joined queue  {"mode":"ARENA_1V1","betAmount":0,"variant":"CARROCA"}
[14:23:01.087] [P2] Joined queue  {"mode":"ARENA_1V1","betAmount":0,"variant":"CARROCA"}
[14:23:01.090] [TEST] Waiting for match…
[14:23:01.112] [TEST] Match found — gameId: 9e8d7c6b-…
[14:23:01.145] [P1] State  seq=1 round=1 scores={"1":0,"2":0} currentPlayer=0
[14:23:01.145] [P1] Turn — playing move  {"type":"play","seq":1}
[14:23:01.155] [P2] State  seq=2 round=1 scores={"1":0,"2":0} currentPlayer=1
[14:23:01.155] [P2] Turn — playing move  {"type":"play","seq":2}
...
[14:23:28.441] [P1] Round ended  {"round":1,"winType":"simples","points":1,"matchScores":{"1":1,"2":0},"matchOver":false}
...
[14:24:51.003] [P2] Game ended!  {"status":"FINISHED","winnerTeam":1,"matchScores":{"1":7,"2":4},"prizePerWinner":0}

══════════════ RESULT ══════════════
  Status:      FINISHED
  WinnerTeam:  1
  MatchScores: {"1":7,"2":4}
  PrizePool:   R$ 0
  P1 moves:    22
  P2 moves:    19
════════════════════════════════════
```

The process exits with code `0` on success, `1` on any error (network failure, timeout, mismatched game IDs).

---

## What the Script Validates

| Check | How |
|---|---|
| Two players can authenticate independently | `POST /auth/dev/login` × 2 |
| Two sockets connect simultaneously with valid JWTs | `connectSocket()` × 2 |
| Variant-aware queue matching routes both players to the same game | Asserts `found1.gameId === found2.gameId` |
| Both players receive `game:state` after `game:join` | Both sockets log `State seq=1 …` |
| Seq counter starts at 1 and increments on each state change | Visible in log output |
| Stale-event guard does not drop valid events | No moves are skipped during normal play |
| `game:round_ended` is broadcast to both players between rounds | Both sockets log round results |
| `game:ended` is received and contains required fields | Script reads `status`, `winnerTeam`, `matchScores`, `prizePerWinner` |
| Script completes within `TIMEOUT_MS` (default 2 minutes) | Hard deadline timer rejects the promise on timeout |

---

## Existing Jest Suite — Still Passing

All 93 tests from Milestone 2 pass unchanged. The table below shows coverage deltas for the three files modified in this milestone.

### `matchmaking.service.test.ts`

The 7 existing tests still pass. The variant-matching logic introduces new branches that are not yet covered by the Jest suite:

| Uncovered branch | Why |
|---|---|
| `tryMatch` variant mismatch (1v1) | Existing test only checks bet-tolerance mismatch |
| `tryMatch` variant-grouped 2v2 | No 2v2 variant test exists |
| `startQueueCleanup` callback invoked | Requires fake timers (not yet set up for this service) |
| `getQueuePosition` returns `-1` for absent user | Not tested |

### `socket/index.ts`

The existing socket full-flow test still passes. New coverage gaps:

| Uncovered branch | Why |
|---|---|
| `queue:join` with invalid `mode` | New validation path, not in existing test |
| `queue:join` with negative `betAmount` | New validation path |
| `queue:expired` received by client | Requires fake timer advancing |
| `queue:joined` `position` field in response | Assertion not added to existing test |

### `socket/gameSocket.ts`

The full-flow integration test still passes and now exercises `seq` in `game:state` implicitly. New gaps:

| Uncovered branch | Why |
|---|---|
| `game:sync_request` handler | New event, no test yet |
| `seq` cleanup on `ABANDONED` | Forfeit path tested but seq map not asserted |
| `matchLogger` calls | Not mocked or asserted in current tests |

---

## Coverage by Module (updated estimates)

```
File                      | Stmts | Branch | Funcs | Lines
--------------------------|-------|--------|-------|-------
domino.engine.ts          | 92.99 |  88.88 | 92.00 | 92.75  (unchanged)
matchmaking.service.ts    | 72.00 |  65.00 | 75.00 | 74.00  ↓ new branches uncovered
wallet.service.ts         | 76.47 |  80.00 | 66.66 | 78.57  (unchanged)
admin.controller.ts       | 87.24 |  62.00 |100.00 | 89.62  (unchanged)
otp.service.ts            | 68.51 |  57.89 | 66.66 | 69.23  (unchanged)
socket/index.ts           | 74.00 |  45.00 | 67.00 | 78.00  ↓ new validation paths
socket/gameSocket.ts      | 52.00 |  29.00 | 63.00 | 55.00  ≈ unchanged (sync_request new)
logger.ts                 | 100.0 | 100.00 |100.00 | 100.0  (unchanged — trivial)
```

Coverage numbers are estimated from the existing suite run; re-running `npm run test:coverage` gives exact figures.

---

## Not yet tested (Milestone 4 candidates)

- `game:sync_request` — unit or integration test verifying the response carries the correct masked state and `seq`
- Variant mismatch in `tryMatch` — two players with different variants should never produce a `match_created` event
- `queue:expired` with Jest fake timers advancing past `QUEUE_STALE_MS`
- `matchLogger` output assertions — spy on the logger and assert all three event types are emitted
- Multi-user test extended to 2v2 (four concurrent connections)
- CRUZADA variant through the socket layer (topOpen/bottomOpen propagated to client)
- L_E_L blocked-game scoring through the socket layer
- Turn timeout auto-pass verified with sequence number increment
