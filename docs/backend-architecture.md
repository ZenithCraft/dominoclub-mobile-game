# DominoClub — Backend Architecture & Database Design

> Focus: **Milestone 2** — Game logic + 1v1 gameplay integrated with wallet (deposit → play → payout + reconnection)

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Database Schema](#2-database-schema)
   - [Entity-Relationship Summary](#entity-relationship-summary)
   - [Models](#models)
   - [Enums](#enums)
3. [REST API Reference](#3-rest-api-reference)
   - [Auth](#auth-apiv1auth)
   - [Wallet](#wallet-apiv1wallet)
   - [Game (HTTP)](#game-http-apiv1game)
   - [Admin](#admin-apiv1admin)
4. [Socket.io Event Reference](#4-socketio-event-reference)
   - [Connection & Auth](#connection--auth)
   - [Matchmaking](#matchmaking-events)
   - [Gameplay](#gameplay-events)
5. [Core Services](#5-core-services)
   - [Domino Engine](#domino-engine)
   - [Matchmaking Service](#matchmaking-service)
   - [Wallet & PIX Service](#wallet--pix-service)
   - [Tournament Service](#tournament-service)
   - [Anti-Fraud Middleware](#anti-fraud-middleware)
6. [Full Game Flow: Deposit → Play → Payout](#6-full-game-flow-deposit--play--payout)
7. [Reconnection Flow](#7-reconnection-flow)
8. [Configuration Reference](#8-configuration-reference)

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express |
| Real-time | Socket.io (WebSocket + polling fallback) |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache / Scale | Redis (optional — enables horizontal Socket.io scaling) |
| PIX Payments | Banco Inter API (mTLS in production, mock in dev) |
| CPF Validation | SERPRO API (mock mode available) |
| Auth | OTP via SMS (Zenvia / Twilio / mock) + JWT (access 15m / refresh 7d) |

---

## 2. Database Schema

### Entity-Relationship Summary

```
User  1──1  Wallet  1──N  Transaction
User  1──N  GamePlayer  N──1  Game
User  1──N  TournamentPlayer  N──1  Tournament
User  1──N  FraudLog
Game  N──1  Tournament
```

### Models

---

#### `User`

Core identity. Stores auth state, geolocation, anti-fraud fingerprints, and ban status.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `phone` | String UNIQUE | Primary identifier — Brazilian format |
| `cpf` | String? UNIQUE | Required before withdrawal |
| `email` | String? UNIQUE | Optional |
| `name` | String? | Display name |
| `avatar` | String? | URL |
| `gps_lat / gps_lng` | Float? | Last known GPS for geofencing |
| `device_id` | String? | Hardware fingerprint — indexed for multi-account detection |
| `ip_address` | String? | Last known IP — indexed for multi-account detection |
| `is_banned` | Boolean | Default false |
| `ban_reason` | String? | |
| `bot_score` | Float | 0–1 probability — set by anti-fraud engine |
| `cpf_verified` | Boolean | Verified via SERPRO |
| `phone_verified` | Boolean | Verified via OTP |
| `otp_code` | String? | Hashed 6-digit code |
| `otp_expires_at` | DateTime? | OTP expiry window |
| `refresh_token` | String? | Current valid refresh token |
| `created_at / updated_at` | DateTime | |

**Indexes:** `phone`, `cpf`, `device_id`, `ip_address`

---

#### `Wallet`

One wallet per user. Tracks real and bonus balances separately.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `userId` | String UNIQUE FK → User | |
| `real_balance` | Float | Real money (BRL) — used for withdrawals |
| `bonus_balance` | Float | Promotional credit — spent before real balance |
| `rollover_remaining` | Float | Wagering requirement remaining before withdrawal is allowed |
| `created_at / updated_at` | DateTime | |

---

#### `Transaction`

Immutable ledger entry. Every balance change creates one row.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `walletId` | FK → Wallet | |
| `type` | `TransactionType` | DEPOSIT / WITHDRAWAL / BET / WIN / BONUS / REFUND / FEE |
| `amount` | Float | Positive = credit, Negative = debit |
| `balance_after` | Float? | Snapshot of real_balance after this transaction |
| `pix_id` | String? | Banco Inter `txid` / `e2eid` |
| `pix_qr_code` | Text? | Pix Copia e Cola string (deposit QR) |
| `pix_key` | String? | Destination PIX key (withdrawals) |
| `description` | String? | Human-readable note |
| `status` | `TransactionStatus` | PENDING / COMPLETED / FAILED / CANCELLED |
| `metadata` | Json? | Raw Banco Inter API response |
| `created_at / updated_at` | DateTime | |

**Indexes:** `walletId`, `pix_id`, `status`, `created_at`

---

#### `Game`

One row per game session. Stores configuration, result, and full replay.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `mode` | `GameMode` | ARENA_1V1 / CUP_1V1 / TOURNAMENT_2V2 / RECREATIONAL_2V2 |
| `variant` | `DominoVariant` | CARROCA / L_E_L / CRUZADA |
| `status` | `GameStatus` | WAITING / PLAYING / FINISHED / CANCELLED / ABANDONED |
| `bet_amount` | Float | Per-player buy-in |
| `prize_pool` | Float | `bet_amount × players × (1 - house_edge%)` |
| `house_fee` | Float | Platform cut |
| `winner_id` | FK? → User | 1v1 individual winner |
| `winning_team` | Int? | 1 or 2 — for 2v2 games |
| `replay_data` | Json? | Full `ReplayData` object (initial deal + all moves) |
| `room_code` | String? UNIQUE | Short code for private games |
| `tournamentId` | FK? → Tournament | Null for non-tournament |
| `tournament_round` | Int? | 1-based round number |
| `created_at / updated_at / finished_at` | DateTime | |

**Indexes:** `status`, `mode`, `created_at`, `tournamentId`

---

#### `GamePlayer`

Join table: which users sat at which seat in a game.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `gameId` | FK → Game | |
| `userId` | FK → User | |
| `team` | Int | 1 or 2 |
| `seat` | Int | 0–3 (position at table) |
| `final_score` | Int? | Pip count remaining in hand at game end |
| `is_bot` | Boolean | True for bot-injected opponents |
| `connected` | Boolean | Live connection status — drives reconnect logic |
| `joined_at` | DateTime | |

**Unique constraints:** `(gameId, userId)`, `(gameId, seat)`

---

#### `Tournament`

Tournament bracket container.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | String | Display name |
| `mode` | `GameMode` | |
| `variant` | `DominoVariant` | |
| `status` | `TournamentStatus` | OPEN / FULL / IN_PROGRESS / FINISHED / CANCELLED |
| `entry_fee` | Float | Per-player buy-in |
| `prize_pool` | Float | Accumulated from entries |
| `max_players` | Int | Power of 2 (4, 8, 16…) |
| `current_players` | Int | Auto-incremented on join |
| `current_round` | Int | 0 = not started |
| `starts_at` | DateTime | Scheduled start |
| `finished_at` | DateTime? | |
| `created_at / updated_at` | DateTime | |

---

#### `TournamentPlayer`

Join table: tracks elimination and prize per player.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tournamentId` | FK → Tournament | |
| `userId` | FK → User | |
| `eliminated_at` | DateTime? | Null if still active |
| `final_position` | Int? | 1 = champion |
| `prize_won` | Float | Credited on elimination or win |
| `joined_at` | DateTime | |

---

#### `FraudLog`

Immutable fraud event audit trail.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `userId` | FK → User | Suspect user |
| `type` | `FraudType` | See enum below |
| `details` | Json | Raw evidence (IPs, device IDs, coordinates…) |
| `ip_address` | String? | Snapshot at time of event |
| `device_id` | String? | Snapshot at time of event |
| `resolved` | Boolean | Admin can mark as reviewed |
| `created_at` | DateTime | |

---

### Enums

| Enum | Values |
|---|---|
| `GameMode` | `ARENA_1V1`, `CUP_1V1`, `TOURNAMENT_2V2`, `RECREATIONAL_2V2` |
| `GameStatus` | `WAITING`, `PLAYING`, `FINISHED`, `CANCELLED`, `ABANDONED` |
| `DominoVariant` | `CARROCA`, `L_E_L`, `CRUZADA` |
| `TransactionType` | `DEPOSIT`, `WITHDRAWAL`, `BET`, `WIN`, `BONUS`, `REFUND`, `FEE` |
| `TransactionStatus` | `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `TournamentStatus` | `OPEN`, `FULL`, `IN_PROGRESS`, `FINISHED`, `CANCELLED` |
| `FraudType` | `MULTI_ACCOUNT_DEVICE`, `MULTI_ACCOUNT_IP`, `SUSPICIOUS_GPS`, `GEOLOCATION_OUTSIDE_BRAZIL`, `RAPID_FIRE_BETS`, `BOT_PATTERN`, `COLLUSION_SUSPECTED`, `UNUSUAL_WIN_RATE` |

---

## 3. REST API Reference

Base path: `POST /api/v1`

All protected routes require header: `Authorization: Bearer <access_token>`

---

### Auth (`/api/v1/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/otp/send` | Public | Send 6-digit OTP to phone |
| POST | `/otp/verify` | Public | Verify OTP → returns `accessToken` + `refreshToken` |
| POST | `/dev/login` | Public (dev only) | Bypass OTP for testing |
| POST | `/token/refresh` | Public | Exchange refresh token for new access token |
| POST | `/logout` | JWT | Invalidate refresh token |
| GET | `/me` | JWT | Get current user profile |
| PUT | `/profile` | JWT | Update name / avatar |
| POST | `/cpf/verify` | JWT | Submit CPF for SERPRO verification |
| DELETE | `/account` | JWT | LGPD right to erasure |
| POST | `/data-export` | JWT | LGPD data export request |
| POST | `/self-exclusion` | JWT | Jogo Responsável — self-exclusion |

---

### Wallet (`/api/v1/wallet`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | Get wallet balances + last 20 transactions |
| POST | `/deposit` | JWT | Create PIX charge → returns `{ txid, qrCode, transactionId }` |
| POST | `/withdraw` | JWT | Initiate PIX withdrawal to user's key |
| GET | `/transaction/:id` | JWT | Get single transaction status |
| POST | `/pix/webhook` | None (Inter calls this) | Banco Inter webhook — confirms deposits |

**Deposit body:** `{ amount: number }`  (minimum R$20)

**Withdraw body:** `{ amount: number, pixKey: string }`  (minimum R$20, requires zero `rollover_remaining`)

---

### Game HTTP (`/api/v1/game`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/history` | JWT | Paginated game history for current user |
| GET | `/active` | JWT | Current active game (if any) |
| GET | `/tournaments` | JWT | List open/in-progress tournaments |
| POST | `/tournaments/:id/join` | JWT | Join tournament — deducts entry fee |
| GET | `/:id/replay` | JWT | Fetch full replay data for a finished game |

---

### Admin (`/api/v1/admin`)

> Protected by admin JWT issued at `/admin/login`. Requires `ADMIN_USERNAME` + `ADMIN_PASSWORD`.

| Method | Path | Description |
|---|---|---|
| POST | `/login` | Admin login → admin JWT |
| GET | `/stats` | Platform stats (DAU, revenue, active games…) |
| GET | `/users` | Paginated user list with fraud scores |
| PATCH | `/users/:id/ban` | Ban / unban a user |
| GET | `/games` | Paginated game list with filters |
| GET | `/games/:id/replay` | Full replay (same as user but no ownership check) |
| GET | `/transactions` | Paginated transaction list |
| PATCH | `/transactions/:id/approve` | Approve pending withdrawal |
| PATCH | `/transactions/:id/reject` | Reject withdrawal — refunds balance |
| GET | `/tournaments` | List all tournaments |
| POST | `/tournaments` | Create a tournament |
| POST | `/tournaments/:id/start` | Manually start a tournament |
| POST | `/tournaments/:id/cancel` | Cancel and refund all entries |

---

## 4. Socket.io Event Reference

**Auth:** Pass JWT in `socket.handshake.auth.token` on connect.

On connection each socket auto-joins a private room `user:<userId>` — used to deliver `game:found` and per-player `game:state` events.

---

### Connection & Auth

| Direction | Event | Payload | Description |
|---|---|---|---|
| Server → Client | `online:count` | `{ count: number }` | Live online player count |
| Server → Client | `queue:stats` | `Record<mode, { total, byBet }>` | Queue depths per mode |

---

### Matchmaking Events

| Direction | Event | Payload | Description |
|---|---|---|---|
| Client → Server | `queue:join` | `{ mode: string, betAmount: number }` | Enter matchmaking queue |
| Client → Server | `queue:leave` | — | Leave queue |
| Server → Client | `queue:joined` | `{ mode, betAmount, botWaitSeconds }` | Confirmed in queue |
| Server → Client | `queue:left` | — | Confirmed out of queue |
| Server → Client | `queue:error` | `{ message }` | e.g. Insufficient balance |
| Server → Client | `game:found` | `{ gameId, betAmount, mode }` | Match created — client should emit `game:join` |

> Bot injection: if no human opponent found within `botInjectWaitSeconds` (default 5s), a bot is injected and a game is created automatically.

---

### Gameplay Events

| Direction | Event | Payload | Description |
|---|---|---|---|
| Client → Server | `game:join` | `{ gameId }` | Join game room + receive initial state |
| Client → Server | `game:move` | `{ gameId, tile, side, flipped }` | Play a tile |
| Client → Server | `game:draw` | `{ gameId }` | Draw from boneyard |
| Client → Server | `game:pass` | `{ gameId }` | Pass turn (only valid when no moves + boneyard empty) |
| Client → Server | `game:emoji` | `{ gameId, emoji }` | Broadcast reaction emoji to table |
| Client → Server | `game:leave` | `{ gameId }` | Voluntarily forfeit and leave |
| Server → Client | `game:state` | `GameState` (player view) | Full game state — opponent hands are masked to `null` |
| Server → Client | `game:ended` | `{ status, winnerId, winnerTeam, prizePool, prizePerWinner, players[] }` | Game over summary |
| Server → Client | `game:forfeit` | `{ forfeitedUserId, reason, winnerId, winnerTeam }` | A player forfeited |
| Server → Client | `game:timeout` | `{ userId }` | A player's turn timed out (auto-passed) |
| Server → Client | `game:error` | `{ message }` | Validation error (illegal move, wrong turn…) |

---

## 5. Core Services

### Domino Engine

**File:** [apps/backend/src/game/domino.engine.ts](apps/backend/src/game/domino.engine.ts)

Pure functional engine — no I/O, fully testable.

**Tile set:** 28 tiles `[0,0]` → `[6,6]`. Fisher-Yates shuffled at game start.

**Distribution:** 7 tiles per player (both 1v1 and 2v2). Remainder goes to boneyard.

**First player:** Whoever holds the highest double.

**Variants supported:**

| Variant | Blocked-game scoring | Board layout |
|---|---|---|
| `CARROCA` | Lowest total pip count wins | Linear (left / right) |
| `L_E_L` | Lowest pip count wins; doubles count double | Linear |
| `CRUZADA` | Lowest pip count wins | Cross (left / right / top / bottom) — second arm opens on first double played |

**Key functions:**

| Function | Description |
|---|---|
| `initGame(gameId, variant, players)` | Shuffle, deal, determine first player → `GameState` |
| `canPlayTile(state, tile)` | Returns valid `{ side, flipped }` options for a tile |
| `getValidMoves(state, playerIndex)` | All playable tiles for a player |
| `applyMove(state, playerIndex, tile, side, flipped)` | Validates legality, removes tile from hand, updates open ends, checks win |
| `applyPass(state, playerIndex)` | Advances turn; if all players consecutively pass → `resolveBlockedGame()` |
| `drawFromBoneyard(state, playerIndex)` | Pops one tile from boneyard into player hand |
| `getBotMove(state, playerIndex)` | Simple AI: plays highest-value tile first; draws if no moves; passes if boneyard empty |

**Win conditions:**
- Player empties hand → immediate win
- All players pass consecutively → blocked game → team with lowest pip count wins (ties = no winner)

---

### Matchmaking Service

**File:** [apps/backend/src/services/matchmaking.service.ts](apps/backend/src/services/matchmaking.service.ts)

In-memory queues (one per mode). On match:

1. Two players' bet amounts are compared — must be within `matchmakingBetTolerance` (default 10%)
2. `Game` row created in DB with `prize_pool = betAmount × players × (1 - houseEdge%)`
3. `matchmakingEvents` emits `match_created` → Socket.io layer sends `game:found` to both players

**Bot injection:** If a player waits longer than `botInjectWaitSeconds` (default 5s), a bot `User` row is created and injected into the queue, guaranteeing an instant match.

**Anti-collusion (2v2):** Team assignments are randomized after player selection.

---

### Wallet & PIX Service

**Files:** [apps/backend/src/services/wallet.service.ts](apps/backend/src/services/wallet.service.ts) · [apps/backend/src/services/pix.service.ts](apps/backend/src/services/pix.service.ts)

#### Deposit flow

```
Client POST /wallet/deposit
  → createPixCharge() → PIX QR code generated
  → Transaction row created (type=DEPOSIT, status=PENDING)
  ← Returns { txid, qrCode, transactionId }

Banco Inter POST /wallet/pix/webhook
  → HMAC-SHA256 signature verified
  → confirmPixDeposit(txid)
  → Prisma $transaction: wallet.real_balance += amount + transaction.status = COMPLETED
```

#### Bet deduction (game start)

```
deductBet(walletId, amount)
  → Bonus balance spent first, then real balance
  → Throws if insufficient funds
  → Transaction row (type=BET, amount=-X, status=COMPLETED)
```

#### Win payout (game end)

```
creditWin(walletId, amount)
  → wallet.real_balance += prizePool / winners
  → Transaction row (type=WIN, status=COMPLETED)
```

#### Withdrawal flow

```
Client POST /wallet/withdraw { amount, pixKey }
  → Check: real_balance >= amount AND rollover_remaining == 0
  → Prisma $transaction: wallet.real_balance -= amount + Transaction PENDING (atomic — prevents double-spend)
  → PIX /pagamentos call to Banco Inter
  → On success: Transaction → COMPLETED
  → On failure: balance refunded + Transaction → FAILED
```

---

### Tournament Service

**File:** [apps/backend/src/services/tournament.service.ts](apps/backend/src/services/tournament.service.ts)

Called by `handleGameEnd()` when a finished `Game` has a `tournamentId`.

`advanceTournamentBracket(tournamentId, gameId, winnerId, winnerTeam)` is responsible for knockout bracket progression. Implementation detail: creates the next round's `Game` rows for surviving players and marks eliminated players in `TournamentPlayer`.

---

### Anti-Fraud Middleware

**File:** [apps/backend/src/middleware/antifraud.middleware.ts](apps/backend/src/middleware/antifraud.middleware.ts)

**`antifraudMiddleware`** (applied globally):
- In production: blocks requests from non-Brazilian IPs using Cloudflare `CF-IPCountry` header
- Attaches `clientIp` and `deviceId` to request context

**`checkMultiAccount(userId, ip, deviceId)`** (called post-auth):
- Flags `MULTI_ACCOUNT_DEVICE` if same `device_id` exists on another user
- Flags `MULTI_ACCOUNT_IP` if 3+ other users share the same IP
- Writes a `FraudLog` row for each detected signal

---

## 6. Full Game Flow: Deposit → Play → Payout

```
1. DEPOSIT
   Client creates PIX charge via POST /wallet/deposit
   User pays QR code in their banking app
   Banco Inter fires POST /wallet/pix/webhook
   → wallet.real_balance credited

2. MATCHMAKING
   Client connects Socket.io (JWT auth)
   Client emits queue:join { mode: 'ARENA_1V1', betAmount: 5.00 }
   Server checks wallet balance — rejects if insufficient
   Server enqueues player; starts bot-injection timer (5s)
   On match found: Game row created in DB
   Server emits game:found { gameId } to both players

3. GAME INITIALIZATION
   Both clients emit game:join { gameId }
   Server calls startGame():
     - deductBet() called for each human player
     - initGame() shuffles tiles, deals 7 per player, picks first player
     - Game.status → PLAYING
     - Replay recording begins (initial deal snapshot saved)
     - game:state broadcast to each player (opponent hands masked)
     - Turn timer started (30s default)

4. GAMEPLAY LOOP
   Human player emits game:move / game:draw / game:pass
   Server validates via applyMove() / drawFromBoneyard() / applyPass()
   recordMove() appends to ReplayData
   broadcastGameState() sends masked views to each player
   If bot's turn: getBotMove() executes after 1–3s simulated delay
   On turn timeout: auto-pass applied

5. GAME END
   Win condition met (hand emptied or all passed)
   handleGameEnd():
     - creditWin(wallet, prizePool / winners) for each human winner
     - Game row updated: status=FINISHED, winner_id, replay_data, finished_at
     - GamePlayer rows updated: final_score (pip count)
     - game:ended event broadcast to game room
     - If tournament game: advanceTournamentBracket()
```

---

## 7. Reconnection Flow

```
Player disconnects (network drop)
  → GamePlayer.connected = false
  → disconnectTimer starts (grace period = DISCONNECT_GRACE_SECONDS, default 15s)

If player reconnects within grace period:
  Client emits game:join { gameId }
  → disconnectTimer cancelled
  → GamePlayer.connected = true
  → Current GameState sent to reconnecting player (their hand visible, others masked)
  → Game continues normally

If grace period expires:
  forfeitGame() called
  → Opponent wins
  → handleGameEnd() with status=ABANDONED
  → creditWin() paid to opponent
  → game:forfeit broadcast
```

---

## 8. Configuration Reference

All values are env vars. Defaults shown are for development.

| Env Var | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `""` | Optional — enables Socket.io Redis adapter |
| `JWT_ACCESS_SECRET` | `dev_access_secret...` | Min 32 chars in production |
| `JWT_REFRESH_SECRET` | `dev_refresh_secret...` | Min 32 chars in production |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token lifetime |
| `TURN_TIMEOUT_SECONDS` | `30` | Seconds before a player's turn auto-passes |
| `DISCONNECT_GRACE_SECONDS` | `15` | Reconnection window before forfeit |
| `BOT_INJECT_WAIT_SECONDS` | `5` | Queue wait before bot injection |
| `MATCHMAKING_BET_TOLERANCE` | `0.10` | Max bet difference ratio for matching (10%) |
| `HOUSE_EDGE_PERCENT` | `10` | Platform cut from prize pool |
| `INTER_BASE_URL` | sandbox URL | Banco Inter API base |
| `INTER_CLIENT_ID` | sandbox cred | |
| `INTER_CLIENT_SECRET` | sandbox cred | |
| `INTER_CERT_PATH / INTER_KEY_PATH` | `./certs/...` | mTLS certs (production only) |
| `INTER_PIX_KEY` | `""` | Platform PIX key |
| `INTER_WEBHOOK_URL` | `""` | Public URL for Inter to POST payment events |
| `INTER_WEBHOOK_SECRET` | `""` | HMAC secret for webhook signature verification |
| `SERPRO_API_KEY` | `""` | CPF validation API |
| `SERPRO_MOCK_MODE` | `false` | Skip real SERPRO calls in dev |
| `SMS_PROVIDER` | `mock` | `mock` / `zenvia` / `twilio` |
| `ADMIN_USERNAME / ADMIN_PASSWORD` | `admin / changeme` | Admin login credentials |
| `ADMIN_JWT_SECRET` | weak default | Min 32 chars in production |
| `CORS_ORIGINS` | localhost ports | Comma-separated allowed origins |

> **Production guard:** Server throws on startup if any secret is still at its default weak value.
