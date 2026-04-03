# Milestone 2 — Tests

---

## Final Result

```
Test Suites: 8 passed  (1 skipped — requires real database in CI)
Tests:       93 passed  (8 skipped — same condition)
Snapshots:   0
Time:        ~7.5 s
```

---

## How to Run

```bash
cd apps/backend

# Unit + integration (no real database required)
npm test

# With coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

> `jest` is installed at the monorepo root (`../../node_modules`). To run it
> directly from the terminal without npm scripts:
> ```bash
> node ../../node_modules/jest/bin/jest.js --runInBand
> ```

---

## Test Suites

### 1. `domino.engine.test.ts` — 55 tests (Unit)

Pure engine — no mocks, no I/O.

| Group | What it validates |
|---|---|
| `generateTiles` | 28 tiles, no duplicates, every `[i,j]` pair present |
| `shuffle` | Same elements as input, original array not mutated |
| `initGame` | 7/7/14 distribution (1v1) and 7×4/0 (2v2), initial status, first player holds the highest double |
| `canPlayTile` | First move always valid · left/right fit · flip required · double produces no extra flipped entry · CRUZADA validates top/bottom |
| `getValidMoves` | Correctly filters playable tiles from the player's hand |
| `applyMove` | Removes tile from hand · adds to board · updates leftOpen/rightOpen · advances index (including wrap) · detects win · throws on unknown tile or illegal move · CRUZADA opens cross arm on first double |
| `applyPass` | Increments consecutivePasses · marks passedLastTurn · advances index · detects blocked game · resolves by lowest pip · tie produces no winner |
| `drawFromBoneyard` | Adds tile to hand · removes from boneyard · no-op when boneyard empty · does not mutate original state |
| `getBotMove` | Draws when no valid moves and boneyard non-empty · passes when no valid moves and boneyard empty · prefers highest-value tile |
| `full game simulation` | Complete 2-player game runs to completion without runtime errors |

**Edge cases covered:**
- Player index wrapping (last player → first player)
- Tile not in hand
- Illegal move (pip does not match open end)
- All players passing consecutively
- Pip tie in a blocked game

---

### 2. `otp.service.test.ts` — 7 tests (Unit)

| Test | What it validates |
|---|---|
| Generation | Numeric string with configurable length · different values across calls |
| `sendOtp` + `verifyOtp` | Wrong code rejected · no OTP sent returns false · lockout after maxAttempts · resend cooldown enforced · expired OTP rejected |

---

### 3. `wallet.service.test.ts` — 12 tests (Unit with Prisma mock)

| Test | What it validates |
|---|---|
| `deductBet` | Deducts from real only (no bonus) · deducts from bonus only (sufficient) · splits bet across bonus + real · throws on insufficient balance · throws when wallet not found · writes a BET transaction |
| `creditWin` | Increments real_balance · writes a WIN transaction |
| `deposit` | Minimum R$20 enforced · delegates to `createPixCharge` |
| `withdraw` | Minimum R$20 enforced · delegates to `processWithdrawal` |

---

### 4. `matchmaking.service.test.ts` — 7 tests (Unit with Prisma mock)

| Test | What it validates |
|---|---|
| Queue | Enqueueing the same user twice replaces the first entry · dequeue removes the entry |
| 1v1 match | Compatible pair creates a match · bet difference above tolerance does not match |
| 2v2 match | 4 players create a match · 3 players do not |
| DB write | `prisma.game.create` called with correct mode, bet_amount, and player data |

---

### 5. `gameflow.integration.test.ts` — 1 test (Integration with mocks)

**Scenario:** `"deducts bet from both players and credits prize to the winner"`

Simulates the complete wallet flow integrated with the game:

```
1. Two users with an initial balance
2. deductBet() called for both
3. creditWin() called for the winner
4. Assert winner balance = initial − bet + prize
5. Assert loser balance  = initial − bet
6. Assert ledger entries: 1× BET each, 1× WIN for the winner
```

> This is the most important test for Milestone 2: it validates that money
> flows correctly end-to-end without leaking.

---

### 6. `pix.webhook.integration.test.ts` — 1 test (HTTP integration)

**Scenario:** `"processes each txid exactly once"`

Sends the same webhook payload twice with the same `txid` and asserts the balance is credited **only once** (idempotency). Protects against double-credit from Banco Inter retries.

---

### 7. `socket.fullflow.integration.test.ts` — 1 test (Socket.io end-to-end)

**Scenario:** `"queue → match → join → reconnects within grace → plays → pays prize"`

The most complex test (~1.4 s). Covers:

```
1. Two Socket.io clients connect with valid JWTs
2. Both emit queue:join
3. matchmakingEvents fires match_created
4. Both receive game:found and emit game:join
5. game:state received — correct initial state
6. Player B disconnects
7. Player B reconnects within the grace period (15 s)
8. game:state re-delivered to B (reconnection successful)
9. Move loop runs until a winner — game:ended received
10. Assert prize pool in the game:ended event
11. Assert creditWin called for the winner
```

---

### 8. `admin.integration.test.ts` — 15 tests (HTTP integration)

| Test | What it validates |
|---|---|
| Login | 401 with invalid credentials |
| Stats | Auth required · returns expected shape with computed revenue |
| Users | Paginated user list returned |
| Ban | PATCH updates `is_banned` |
| Games | List includes computed `duration` field |
| Replay | 404 when game does not exist |
| Transactions | Paginated list + pending withdrawal total |
| Approve | Validates type/status before approving |
| Reject | Rolls back balance + marks transaction FAILED |
| Tournaments | List · creation with field validation · start via service · cancel with refund |

---

### 9. `auth.integration.test.ts` — (Skipped locally)

**Execution condition:** `DATABASE_URL` set **and** `NODE_ENV=test`

This suite uses Supertest against the real Express app and requires a Postgres test database. It auto-skips in local development. In CI (GitHub Actions with a `services.postgres` container) it runs normally.

Tests the full OTP flow, JWT refresh, and profile endpoints against real HTTP.

---

## Coverage by Module

```
File                      | Stmts | Branch | Funcs | Lines
--------------------------|-------|--------|-------|-------
domino.engine.ts          | 92.99 |  88.88 | 92.00 | 92.75  ← core well covered
matchmaking.service.ts    | 79.59 |  72.41 | 78.26 | 81.25
wallet.service.ts         | 76.47 |  80.00 | 66.66 | 78.57
admin.controller.ts       | 87.24 |  62.00 |100.00 | 89.62
admin.middleware.ts       | 84.61 |  50.00 |100.00 | 84.61
otp.service.ts            | 68.51 |  57.89 | 66.66 | 69.23
socket/index.ts           | 78.78 |  50.00 | 69.23 | 82.53
socket/gameSocket.ts      | 51.93 |  28.73 | 61.90 | 54.58  ← limited by mock
pix.service.ts            | 23.52 |   5.26 | 12.50 | 24.69  ← requires Inter API
auth.service.ts           | 12.67 |   0.00 |  0.00 | 14.75  ← requires real DB
tournament.service.ts     |  8.10 |   0.00 |  0.00 |  9.09  ← requires real DB
```

### Why some modules have low coverage

- **`pix.service.ts` (23%)** — Most of the code involves HTTP calls to Banco Inter. Tests cover the happy path via a mocked webhook but not the production mTLS branch. Contract tests will be added once sandbox credentials are available.

- **`auth.service.ts` / `tournament.service.ts` (< 15%)** — Both depend heavily on Prisma with real transactions. They are covered by `auth.integration.test.ts` which runs in CI against a real database.

- **`gameSocket.ts` (51%)** — The full-flow test covers the main path (join → move → end → reconnect). Uncovered branches include: CRUZADA/L_E_L variants in the socket layer, turn timeout with fake timers, bot draw/pass actions, and forfeit via `game:leave`. These will be added in Milestone 3.

---

## Mock Strategy

Jest's `moduleNameMapper` redirects `prisma.service` to `src/__mocks__/prisma.service.ts`. The mock exposes a `prisma` object with:

- Methods configurable per test via `jest.fn()`
- `jest.clearAllMocks()` in `beforeEach` for full isolation between tests
- Identical typing to the real client (based on `@prisma/client`)

This allows business logic (wallet, matchmaking, admin) to be tested without a database, keeping the suite fast (< 10 s) and deterministic.

---

## Not yet tested (Milestone 3)

- CRUZADA and L_E_L variants through the Socket.io layer
- Turn timeout with Jest fake timers
- Bot `draw` and `pass` actions in the socket (only `play` is currently covered)
- Full tournament bracket (seeding, elimination rounds, final, payout)
- `auth.service.ts` + `cpf.service.ts` (require CI with a real database)
- Withdrawal in production with real PIX credentials
