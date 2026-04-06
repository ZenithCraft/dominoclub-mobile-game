# DominoClub — Technical Documentation

> Brazilian real-money domino platform. React Native (Expo) mobile app + Node.js/Express backend + PostgreSQL.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Structure](#2-database-structure)
3. [Backend API](#3-backend-api)
4. [WebSocket Events](#4-websocket-events)
5. [Game Engine](#5-game-engine)
6. [Financial Flow](#6-financial-flow)
7. [Tournament System](#7-tournament-system)
8. [Authentication & Security](#8-authentication--security)
9. [Environment Variables](#9-environment-variables)
10. [Running Locally](#10-running-locally)

---

## 1. Architecture Overview

```
┌─────────────────────────────────┐
│   Mobile App (Expo / React Native)  │  http://localhost:8083
│   apps/mobile/                  │
└────────────┬────────────────────┘
             │  REST (axios)  +  WebSocket (socket.io-client)
             ▼
┌─────────────────────────────────┐
│   Backend (Express + Socket.io) │  http://localhost:3001
│   apps/backend/src/             │
│   ├── routes/       (REST)      │
│   ├── controllers/              │
│   ├── services/                 │
│   ├── socket/      (WS)         │
│   └── game/        (engine)     │
└────────────┬────────────────────┘
             │  Prisma ORM
             ▼
┌─────────────────────────────────┐
│   PostgreSQL (Laragon)          │  localhost:5432 / db: dominoclub
└─────────────────────────────────┘
             │  optional
             ▼
┌─────────────────────────────────┐
│   Redis (Socket.io adapter)     │  optional — horizontal scaling only
└─────────────────────────────────┘
```

**Key design decisions:**
- Game state lives **in-memory** (`activeGames` Map on the server). DB is only updated at game start/end.
- Each user gets their own Socket.io room `user:<userId>` for direct push events.
- PIX payments via Banco Inter API (mTLS in production, mock auto-confirm in development).
- No Redis required for single-server deployments.

---

## 2. Database Structure

### Enums

| Enum | Values |
|------|--------|
| `GameMode` | `ARENA_1V1`, `CUP_1V1`, `TOURNAMENT_2V2`, `RECREATIONAL_2V2` |
| `GameStatus` | `WAITING`, `PLAYING`, `FINISHED`, `CANCELLED`, `ABANDONED` |
| `DominoVariant` | `CARROCA` (traditional blocked), `L_E_L` (doubles double), `CRUZADA` (cross) |
| `TransactionType` | `DEPOSIT`, `WITHDRAWAL`, `BET`, `WIN`, `BONUS`, `REFUND`, `FEE` |
| `TransactionStatus` | `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `TournamentStatus` | `OPEN`, `FULL`, `IN_PROGRESS`, `FINISHED`, `CANCELLED` |
| `FraudType` | `MULTI_ACCOUNT_DEVICE`, `MULTI_ACCOUNT_IP`, `SUSPICIOUS_GPS`, `GEOLOCATION_OUTSIDE_BRAZIL`, `RAPID_FIRE_BETS`, `BOT_PATTERN`, `COLLUSION_SUSPECTED`, `UNUSUAL_WIN_RATE` |

---

### `User`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `phone` | String UNIQUE | Primary identifier — Brazilian format (+5511...) |
| `cpf` | String? UNIQUE | Verified via Serpro API |
| `email` | String? UNIQUE | Optional |
| `name` | String? | Display name |
| `avatar` | String? | URI |
| `gps_lat`, `gps_lng` | Float? | Last known location |
| `device_id` | String? | For multi-account fraud detection |
| `ip_address` | String? | Last login IP |
| `is_banned` | Boolean | Default false |
| `ban_reason` | String? | Reason code or text |
| `bot_score` | Float | 0–1 probability of bot behavior |
| `cpf_verified` | Boolean | Serpro validation passed |
| `phone_verified` | Boolean | OTP verified |
| `otp_code` | String? | Current OTP (hashed in production) |
| `otp_expires_at` | DateTime? | OTP TTL |
| `refresh_token` | String? | Stored for token rotation |
| `created_at`, `updated_at` | DateTime | |

**Relations:** `wallet` (1:1), `gamePlayers` (1:N), `tournamentPlayers` (1:N), `fraudLogs` (1:N), `wonGames` (1:N)

**Indexes:** `phone`, `cpf`, `device_id`, `ip_address`

---

### `Wallet`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userId` | String UNIQUE FK | One wallet per user |
| `real_balance` | Float | Cash balance in BRL |
| `bonus_balance` | Float | Bonus credits (wagering requirement applies) |
| `rollover_remaining` | Float | Amount still to be wagered before withdrawal allowed |
| `created_at`, `updated_at` | DateTime | |

**Relations:** `user` (N:1), `transactions` (1:N)

---

### `Transaction`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `walletId` | String FK | |
| `type` | TransactionType | |
| `amount` | Float | Positive = credit, negative = debit |
| `balance_after` | Float? | Snapshot of balance after this transaction |
| `pix_id` | String? | Banco Inter `txid` / `e2eid` |
| `pix_qr_code` | Text? | PIX Copia e Cola string |
| `pix_key` | String? | Destination key (withdrawals) |
| `description` | String? | Human-readable note |
| `status` | TransactionStatus | |
| `metadata` | Json? | Raw Banco Inter API response |
| `created_at`, `updated_at` | DateTime | |

**Indexes:** `walletId`, `pix_id`, `status`, `created_at`

---

### `Game`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `mode` | GameMode | |
| `variant` | DominoVariant | Default `CARROCA` |
| `status` | GameStatus | |
| `bet_amount` | Float | Per-player buy-in |
| `prize_pool` | Float | Total payout (after house fee) |
| `house_fee` | Float | House edge taken |
| `winner_id` | String? FK → User | |
| `winning_team` | Int? | 1 or 2 (for 2v2 modes) |
| `replay_data` | Json? | Full move history for replay |
| `room_code` | String? UNIQUE | Short code for private games |
| `tournamentId` | String? FK | Null for non-tournament games |
| `tournament_round` | Int? | Which bracket round (1-based) |
| `created_at`, `updated_at`, `finished_at` | DateTime | |

**Indexes:** `status`, `mode`, `created_at`, `tournamentId`

---

### `GamePlayer`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `gameId` | String FK | |
| `userId` | String FK | |
| `team` | Int | 1 or 2 |
| `seat` | Int | 0–3 (position at the table) |
| `final_score` | Int? | Pip count remaining at game end |
| `is_bot` | Boolean | Bot player |
| `connected` | Boolean | Live socket connection status |
| `joined_at` | DateTime | |

**Unique constraints:** `(gameId, userId)`, `(gameId, seat)`

---

### `Tournament`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | String | Display name |
| `mode` | GameMode | |
| `variant` | DominoVariant | |
| `status` | TournamentStatus | |
| `entry_fee` | Float | Per-player buy-in |
| `prize_pool` | Float | Accumulated (90% of collected fees) |
| `max_players` | Int | Must be power of 2 (2, 4, 8, 16...) |
| `current_players` | Int | Live count |
| `current_round` | Int | 0 = not started |
| `starts_at` | DateTime | Scheduled start |
| `finished_at` | DateTime? | |
| `created_at`, `updated_at` | DateTime | |

**Indexes:** `status`, `starts_at`

---

### `TournamentPlayer`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tournamentId` | String FK | |
| `userId` | String FK | |
| `eliminated_at` | DateTime? | Null = still active |
| `final_position` | Int? | 1 = champion |
| `prize_won` | Float | Amount credited |
| `joined_at` | DateTime | |

**Unique constraint:** `(tournamentId, userId)`

---

### `FraudLog`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userId` | String FK | |
| `type` | FraudType | |
| `details` | Json | Evidence details |
| `ip_address` | String? | |
| `device_id` | String? | |
| `resolved` | Boolean | Admin reviewed |
| `created_at` | DateTime | |

---

### Entity Relationship Diagram

```
User ──────── Wallet ──────── Transaction
  │
  ├─── GamePlayer ──── Game ──── GamePlayer
  │                     │
  │               TournamentPlayer ── Tournament ── Game
  │
  └─── FraudLog
```

---

## 3. Backend API

Base URL: `http://localhost:3001/api/v1`

All protected endpoints require: `Authorization: Bearer <access_token>`

---

### 3.1 Auth — `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/otp/send` | ❌ | Send OTP SMS to phone number |
| `POST` | `/auth/otp/verify` | ❌ | Verify OTP, returns tokens + user |
| `POST` | `/auth/dev/login` | ❌ | Dev-only login (localhost only) |
| `POST` | `/auth/token/refresh` | ❌ | Refresh access token |
| `POST` | `/auth/logout` | ✅ | Invalidate refresh token |
| `GET` | `/auth/me` | ✅ | Get current user + wallet balances |
| `PUT` | `/auth/profile` | ✅ | Update name, avatar, GPS, CPF |
| `POST` | `/auth/cpf/verify` | ✅ | Verify CPF via Serpro API |
| `DELETE` | `/auth/account` | ✅ | LGPD: soft-delete account |
| `POST` | `/auth/data-export` | ✅ | LGPD: export personal data |
| `POST` | `/auth/self-exclusion` | ✅ | Responsible gambling: self-ban |

#### `POST /auth/otp/send`
```json
// Request
{ "phone": "+5511999990001" }

// Response 200
{ "message": "OTP sent", "expiresIn": 300 }
```

#### `POST /auth/otp/verify`
```json
// Request
{ "phone": "+5511999990001", "otp": "123456" }

// Response 200
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "uuid", "phone": "...", "name": "...", "wallet": { "real_balance": 0, ... } }
}
```

#### `POST /auth/token/refresh`
```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

#### `GET /auth/me`
```json
// Response 200
{
  "id": "uuid",
  "phone": "+5511999990001",
  "name": "João Silva",
  "email": null,
  "avatar": null,
  "cpf_verified": false,
  "phone_verified": true,
  "created_at": "2026-01-01T00:00:00.000Z",
  "wallet": {
    "real_balance": 150.00,
    "bonus_balance": 0.00,
    "rollover_remaining": 0.00
  }
}
```

#### `PUT /auth/profile`
```json
// Request (all fields optional)
{ "name": "João", "avatar": "https://...", "gps_lat": -23.5, "gps_lng": -46.6, "cpf": "123.456.789-09" }

// Response 200 — updated user object
```

#### `POST /auth/self-exclusion`
```json
// Request
{ "type": "temporary" }  // or "permanent"

// Response 200
{ "message": "SELF_EXCLUSION_30_DAYS" }
```

---

### 3.2 Wallet — `/wallet`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/wallet` | ✅ | Balance + last 20 transactions |
| `POST` | `/wallet/deposit` | ✅ | Create PIX charge, returns QR code |
| `POST` | `/wallet/withdraw` | ✅ | Request PIX withdrawal |
| `GET` | `/wallet/transaction/:id` | ✅ | Poll transaction status |
| `POST` | `/wallet/pix/webhook` | ❌ | Banco Inter webhook (PIX confirmed) |

#### `POST /wallet/deposit`
```json
// Request
{ "amount": 50.00 }  // minimum R$ 10.00

// Response 200
{
  "txid": "abc123...",
  "qrCode": "00020126580014BR.GOV.BCB.PIX...",
  "transactionId": "uuid"
}
// Dev mode: payment auto-confirmed after 3 seconds
// Production: Banco Inter calls /wallet/pix/webhook on payment
```

#### `POST /wallet/withdraw`
```json
// Request
{ "amount": 50.00, "pixKey": "joao@email.com" }
// Requires: balance >= amount, rollover_remaining == 0, minimum R$ 20

// Response 200
{ "transactionId": "uuid" }
```

#### `GET /wallet/transaction/:id`
```json
// Response 200
{
  "id": "uuid",
  "type": "DEPOSIT",
  "amount": 50.00,
  "status": "COMPLETED",  // PENDING | PROCESSING | COMPLETED | FAILED
  "balance_after": 150.00,
  "created_at": "2026-01-01T00:00:00.000Z"
}
```

#### `GET /wallet`
```json
// Response 200
{
  "id": "uuid",
  "real_balance": 150.00,
  "bonus_balance": 0.00,
  "rollover_remaining": 0.00,
  "transactions": [
    { "id": "uuid", "type": "DEPOSIT", "amount": 50.00, "status": "COMPLETED", "created_at": "..." },
    { "id": "uuid", "type": "BET",     "amount": -2.00, "status": "COMPLETED", "created_at": "..." },
    { "id": "uuid", "type": "WIN",     "amount":  3.60, "status": "COMPLETED", "created_at": "..." }
  ]
}
```

---

### 3.3 Game — `/game`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/game/history` | ✅ | Paginated finished games (player's own) |
| `GET` | `/game/active` | ✅ | Current active/waiting game (for reconnect) |
| `GET` | `/game/:id/replay` | ✅ | Full replay data for a finished game |
| `GET` | `/game/tournaments` | ✅ | List open/full tournaments |
| `POST` | `/game/tournaments/:id/join` | ✅ | Join a tournament (deducts entry fee) |
| `GET` | `/game/tournaments/:id/bracket` | ✅ | Tournament bracket with all rounds |

#### `GET /game/history?page=1`
```json
// Response 200
{
  "page": 1,
  "games": [
    {
      "id": "uuid",
      "mode": "ARENA_1V1",
      "variant": "CARROCA",
      "status": "FINISHED",
      "bet_amount": 2.00,
      "prize_pool": 3.60,
      "winner_id": "uuid",
      "finished_at": "2026-01-01T00:00:00.000Z",
      "players": [
        { "userId": "uuid", "team": 1, "seat": 0, "final_score": 0, "user": { "id": "...", "name": "João", "avatar": null } }
      ]
    }
  ]
}
```

#### `GET /game/active`
```json
// Response 200 — game in progress
{
  "game": {
    "id": "uuid",
    "mode": "ARENA_1V1",
    "status": "PLAYING",
    "players": [ ... ]
  }
}

// Response 200 — no active game
{ "game": null }
```

#### `POST /game/tournaments/:id/join`
```json
// Response 200
{
  "message": "Joined tournament successfully",
  "starting": false,         // true if this player filled the last spot
  "balance": 998.00,         // updated wallet balance
  "tournament": { "id": "...", "status": "OPEN", "current_players": 3, ... }
}
```

#### `GET /game/tournaments/:id/bracket`
```json
// Response 200
{
  "tournament": {
    "id": "uuid", "name": "Torneio R$10", "status": "IN_PROGRESS",
    "current_round": 2, "max_players": 8, "prize_pool": 72.00,
    "entry_fee": 10.00, "starts_at": "2026-01-01T20:00:00.000Z"
  },
  "players": [
    { "userId": "uuid", "eliminated_at": null, "final_position": null, "prize_won": 0,
      "user": { "id": "uuid", "name": "João", "avatar": null } }
  ],
  "games": [
    { "id": "uuid", "status": "FINISHED", "tournament_round": 1,
      "players": [ { "userId": "uuid", "user": { ... } } ] }
  ],
  "myStatus": { "eliminated": false, "finalPosition": null, "prizeWon": 0 }
}
```

---

### 3.4 Admin — `/admin`

All routes except `/admin/login` require `Authorization: Bearer <admin_jwt>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/login` | Get admin JWT token |
| `GET` | `/admin/stats` | Platform stats (users, revenue, active games) |
| `GET` | `/admin/users` | List all users (paginated, filterable) |
| `PATCH` | `/admin/users/:id/ban` | Ban / unban user |
| `GET` | `/admin/games` | List games with filters |
| `GET` | `/admin/games/:id/replay` | Full replay JSON |
| `GET` | `/admin/transactions` | List transactions with filters |
| `PATCH` | `/admin/transactions/:id/approve` | Approve pending withdrawal |
| `PATCH` | `/admin/transactions/:id/reject` | Reject and refund withdrawal |
| `GET` | `/admin/tournaments` | List all tournaments |
| `POST` | `/admin/tournaments` | Create tournament |
| `POST` | `/admin/tournaments/:id/start` | Force-start tournament |
| `POST` | `/admin/tournaments/:id/cancel` | Cancel + refund all players |

#### `POST /admin/login`
```json
// Request
{ "username": "admin", "password": "admin123" }

// Response 200
{ "token": "eyJ..." }   // valid 12 hours
```

#### `GET /admin/stats`
```json
// Response 200
{
  "totalUsers": 1500,
  "bannedUsers": 12,
  "activeGamesNow": 8,
  "deposits24h": { "count": 45, "amount": 2250.00 },
  "withdrawals24h": { "count": 12, "amount": 600.00 },
  "revenue24h": 180.00,       // house edge collected
  "revenueWeek": [
    { "day": "Mon", "revenue": 320.00, "games": 160 },
    { "day": "Tue", "revenue": 410.00, "games": 205 }
  ]
}
```

#### `POST /admin/tournaments`
```json
// Request
{
  "name": "Torneio Semanal R$10",
  "mode": "ARENA_1V1",
  "variant": "CARROCA",
  "entryFee": 10.00,
  "maxPlayers": 8,
  "startsAt": "2026-01-08T20:00:00.000Z"
}

// Response 201
{ "id": "uuid", "name": "...", "status": "OPEN", ... }
```

---

## 4. WebSocket Events

Connection URL: `ws://localhost:3001` with `{ auth: { token: "<access_token>" } }`

Each connection joins two rooms automatically:
- `user:<userId>` — private channel for direct server→client pushes
- `game:<gameId>` — joined on `game:join`

---

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `game:join` | `{ gameId }` | Join game room, receive initial state |
| `game:move` | `{ gameId, tile: [n,n], side, flipped }` | Play a tile |
| `game:draw` | `{ gameId }` | Draw from boneyard |
| `game:pass` | `{ gameId }` | Pass turn |
| `game:leave` | `{ gameId }` | Forfeit game (counts as loss, opponent wins) |
| `queue:join` | `{ mode, betAmount }` | Enter matchmaking queue |
| `queue:leave` | — | Leave matchmaking queue |
| `reaction` | `{ gameId, emoji }` | Send in-game emoji reaction |

---

### Server → Client

#### Matchmaking
| Event | Payload | Description |
|-------|---------|-------------|
| `queue:joined` | `{ botWaitSeconds? }` | In queue, bot will join after N seconds if no match |
| `queue:stats` | `{ ARENA_1V1: { total, byBet }, ... }` | Live queue counts (broadcast) |
| `queue:error` | `{ message }` | Queue join rejected |
| `game:found` | `{ gameId }` | Match found — navigate to game |

#### In-Game
| Event | Payload | Description |
|-------|---------|-------------|
| `game:state` | `GameState` | Full state update after every action |
| `game:error` | `{ message }` | Invalid move or error |
| `game:ended` | `{ status, winnerId, winnerTeam, prizePool, prizePerWinner, players }` | Game finished |
| `game:forfeit` | `{ forfeitedUserId, reason, winnerId, winnerTeam }` | Player left or disconnected |
| `reaction` | `{ userId, emoji, gameId }` | In-game emoji reaction |

#### Tournament
| Event | Payload | Description |
|-------|---------|-------------|
| `tournament:started` | `{ tournamentId, gameId, round, totalRounds }` | First round begins |
| `tournament:next_game` | `{ tournamentId, gameId, round, totalRounds }` | Advance to next round |
| `tournament:eliminated` | `{ tournamentId, finalPosition, prize, totalPlayers }` | Player is out |
| `tournament:champion` | `{ tournamentId, prize }` | Player won the tournament |
| `tournament:cancelled` | `{ tournamentId, refundAmount, reason }` | Tournament cancelled, refund issued |

---

### `GameState` object (sent via `game:state`)

```typescript
{
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  variant: 'CARROCA' | 'L_E_L' | 'CRUZADA';
  mode: string;
  currentPlayerIndex: number;
  turnCount: number;
  firstPlayMade: boolean;
  leftOpen: number;       // left end of board (pip value)
  rightOpen: number;      // right end of board (pip value)
  boardTiles: PlacedTile[];
  boneyard: null[];       // hidden from players — only count visible
  players: [
    {
      userId: string;
      team: number;
      seat: number;
      isBot: boolean;
      hand: ([number, number] | null)[];  // opponent hands are null
      pipsInHand: number;
    }
  ];
  winnerTeam?: number;
  winnerId?: string;
}
```

---

## 5. Game Engine

Located at `apps/backend/src/game/domino.engine.ts`.

### Rules (CARROCA variant)
- Double-six set: 28 tiles total
- Each player receives 7 tiles (1v1) or 7 tiles (2v2)
- First play: must be double-six (or highest double if no one has it)
- Valid move: tile must share a pip value with the open end being played on
- Pass: only allowed when player has no valid moves AND boneyard is empty
- Draw: player draws from boneyard until a playable tile is found
- Win: empty hand, OR all players pass (blocked game) → team with fewest pips wins
- Blocked game tie: team pip totals are compared; lower wins

### Functions
| Function | Description |
|----------|-------------|
| `initGame(id, variant, players)` | Shuffle tiles, deal 7 to each player, set up state |
| `applyMove(state, playerIndex, tile, side, flipped)` | Validate and apply tile placement |
| `applyPass(state, playerIndex)` | Pass turn (only valid if no moves) |
| `drawFromBoneyard(state, playerIndex)` | Draw tile from pile |
| `getValidMoves(state, playerIndex)` | Returns all legal `{tile, side, flipped}` combinations |
| `getBotMove(state)` | Simple bot — plays highest-value valid tile |

### Server-side validation
All moves are validated server-side. Invalid moves emit `game:error` and are rejected. The client never controls authoritative state.

---

## 6. Financial Flow

### Deposit (PIX)
```
User requests deposit (min R$10)
  → Backend creates Transaction (status: PENDING) + PIX charge via Banco Inter
  → Returns QR code to client
  → Client polls GET /wallet/transaction/:id every 3s
  → Banco Inter calls POST /wallet/pix/webhook on payment
     (dev mode: auto-confirmed after 3 seconds)
  → Backend credits wallet, updates Transaction (status: COMPLETED)
  → Client sees updated balance
```

### Game Bet
```
Game starts
  → Backend deducts bet_amount from each real player's wallet (BET transaction)
  → prize_pool = sum of bets × (1 - house_edge%)   [default 10%]
  → house_fee  = sum of bets × house_edge%
Game ends
  → Backend credits prize_pool / winners to each winner's wallet (WIN transaction)
```

### Withdrawal (PIX)
```
User requests withdrawal (min R$20, rollover_remaining must be 0)
  → Backend debits wallet atomically + creates Transaction (status: PENDING)
  → Dispatches PIX transfer via Banco Inter (dev: auto-completes)
  → Transaction updated to COMPLETED (or FAILED + refund on error)
```

### House Edge
Default: **10%** (`HOUSE_EDGE_PERCENT` env var)
- 1v1 — R$2 buy-in each: `prize_pool = 4 × 0.9 = R$3.60` to winner
- 2v2 — R$2 buy-in each: `prize_pool = 8 × 0.9 = R$7.20` split between winning team

---

## 7. Tournament System

### Lifecycle
```
OPEN → (fills up) → FULL → (auto-start) → IN_PROGRESS → FINISHED
                                                       ↘ CANCELLED
```

- `OPEN`: accepting registrations
- `FULL`: all spots filled, auto-starts immediately
- Auto-cancel: scheduler runs every 60s, cancels OPEN/FULL tournaments past `starts_at` that have fewer than 2 players and refunds everyone

### Bracket Structure
- Single-elimination, must be power of 2 (`max_players`: 2, 4, 8, 16, 32)
- Round labels: Round 1 → Quartas de final → Semifinal → Final
- Total rounds: `Math.ceil(Math.log2(max_players))`
- Between rounds: server waits for all games to finish, then starts next round

### Prize Distribution
- **Champion**: 100% of `prize_pool`
- **Others**: eliminated with no prize (configurable per tournament in future)

### Socket flow for players
1. Join → navigate to `TournamentWaiting` screen with countdown
2. `tournament:started` → navigate to `Game`
3. Win game → wait on `TournamentBracket` screen
4. `tournament:next_game` → navigate to next `Game`
5. `tournament:eliminated` → navigate to `TournamentResult`
6. `tournament:champion` → navigate to `TournamentResult` with prize

---

## 8. Authentication & Security

### JWT Tokens
- **Access token**: expires 15 minutes, signed with `JWT_ACCESS_SECRET`
- **Refresh token**: expires 7 days, signed with `JWT_REFRESH_SECRET`, stored in DB column `refresh_token`
- Token rotation: new refresh token issued on every `/auth/token/refresh` call

### OTP (SMS)
- 6-digit code, expires in 5 minutes
- Max 5 attempts, 60-second resend cooldown
- Providers: `mock` (dev), `zenvia` (Brazil), `twilio` (international)

### Anti-fraud Middleware
Runs asynchronously on login — does not block auth:
- **Multi-account detection**: same device_id or IP used by multiple accounts
- Logs to `FraudLog` table for admin review

### Rate Limiting
- 100 requests per minute per IP (configurable)
- Separate rate limiting on OTP send endpoint

### Admin JWT
- Separate secret (`ADMIN_JWT_SECRET`), expires 12 hours
- Simple username/password check (no OTP)

### PIX Webhook Verification
- HMAC-SHA256 signature verification on Banco Inter webhook calls
- Header: `x-inter-ae-in-ativa`
- Skipped in dev mode (no secret set)

---

## 9. Environment Variables

### Backend (`apps/backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | |
| `PORT` | `3001` | |
| `API_PREFIX` | `/api/v1` | |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | — | Min 32 chars |
| `JWT_REFRESH_SECRET` | — | Min 32 chars |
| `JWT_ACCESS_EXPIRES` | `15m` | |
| `JWT_REFRESH_EXPIRES` | `7d` | |
| `INTER_CLIENT_ID` | — | Banco Inter OAuth client ID |
| `INTER_CLIENT_SECRET` | — | Banco Inter OAuth secret |
| `INTER_BASE_URL` | sandbox URL | |
| `INTER_CERT_PATH` | `./certs/inter.crt` | mTLS cert (production only) |
| `INTER_KEY_PATH` | `./certs/inter.key` | mTLS key (production only) |
| `INTER_PIX_KEY` | — | Your registered PIX key |
| `INTER_WEBHOOK_URL` | — | Public URL for PIX callbacks |
| `INTER_WEBHOOK_SECRET` | — | HMAC secret for webhook verification |
| `SERPRO_API_KEY` | — | CPF validation API key |
| `SERPRO_MOCK_MODE` | `true` | Skip real CPF API in dev |
| `SMS_PROVIDER` | `mock` | `mock` / `zenvia` / `twilio` |
| `OTP_EXPIRY_SECONDS` | `300` | |
| `OTP_LENGTH` | `6` | |
| `OTP_MAX_ATTEMPTS` | `5` | |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | |
| `TURN_TIMEOUT_SECONDS` | `30` | Auto-pass if player doesn't move |
| `BOT_INJECT_WAIT_SECONDS` | `15` | Seconds before bot fills empty slot |
| `DISCONNECT_GRACE_SECONDS` | `60` | Grace period before forfeit on disconnect |
| `HOUSE_EDGE_PERCENT` | `10` | % taken from prize pool |
| `MATCHMAKING_BET_TOLERANCE` | `0.10` | ±10% bet range for matchmaking |
| `ADMIN_USERNAME` | `admin` | |
| `ADMIN_PASSWORD` | — | Change in production |
| `ADMIN_JWT_SECRET` | — | Min 32 chars |
| `CORS_ORIGINS` | localhost ports | Comma-separated allowed origins |
| `REDIS_URL` | _(empty)_ | Optional — enables multi-server Socket.io |

### Mobile (`apps/mobile/.env`)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Backend base URL including `/api/v1` |
| `EXPO_PUBLIC_DEV_AUTH_BYPASS` | `true` = auto-login on Splash screen |
| `EXPO_PUBLIC_FORCE_DEV_LOGIN` | `true` = force dev login from local IPs |
| `EXPO_PUBLIC_MOCK_GAME` | `true` = inject mock board for UI development |

---

## 10. Running Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ (Laragon recommended on Windows)
- Git

### 1. Start PostgreSQL
```bash
# Laragon (Windows)
"c:/laragon/bin/postgresql/postgresql/bin/pg_ctl" start -D "c:/laragon/data/postgresql/"
```

### 2. Create database
```sql
CREATE DATABASE dominoclub;
```

### 3. Backend
```bash
cd apps/backend
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT secrets

npm install
npx prisma migrate deploy   # apply migrations
npx prisma generate         # generate client
npm run dev                 # starts on :3001
```

### 4. Mobile (web)
```bash
cd apps/mobile
# Edit .env — set EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1

npm install
npx expo start --web --port 8083
# Open http://localhost:8083
```

### 5. Admin Dashboard
```bash
# Separate app at apps/admin (Next.js)
cd apps/admin
npm install
npm run dev   # starts on :3000
# Login: admin / admin123 (dev default)
```

### Dev shortcuts
- Dev login auto-creates user `+5511999990001` with R$1,000 balance on first request
- PIX deposits auto-confirm after 3 seconds
- Bot joins after `BOT_INJECT_WAIT_SECONDS` if no second player
- All CPF validation calls are mocked (`SERPRO_MOCK_MODE=true`)
