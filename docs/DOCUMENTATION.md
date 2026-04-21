# DominoClub — Technical Documentation

> Brazilian real-money domino platform. React Native (Expo) mobile app + Node.js/Express backend + PostgreSQL.
> Last updated: **2026-04-21** — Milestones 1–5 complete (security hardening included).

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
│  Mobile App (Expo / React Native)│  http://localhost:8083
│  apps/mobile/                   │
└────────────┬────────────────────┘
             │  REST (axios)  +  WebSocket (socket.io-client)
             ▼
┌─────────────────────────────────┐
│  Backend (Express + Socket.io)  │  http://localhost:3001
│  apps/backend/src/              │
│  ├── routes/        (REST)      │
│  ├── controllers/               │
│  ├── services/                  │
│  ├── socket/        (WS)        │
│  └── game/          (engine)    │
└────────────┬────────────────────┘
             │  Prisma ORM
             ▼
┌─────────────────────────────────┐
│  PostgreSQL (Laragon / Docker)  │  localhost:5432 / db: dominoclub
└─────────────────────────────────┘
             │  optional
             ▼
┌─────────────────────────────────┐
│  Redis (Socket.io adapter)      │  optional — horizontal scaling only
└─────────────────────────────────┘
```

**Key design decisions:**
- Game state lives **in-memory** (`activeGames` Map on the server). DB is only updated at game start/end.
- Each user gets their own Socket.io room `user:<userId>` for direct push events.
- PIX payments via Banco Inter API (mTLS in production, mock auto-confirm in dev).
- No Redis required for single-server deployments.
- Token blacklist uses Redis when available; falls back to an in-memory Map.

---

## 2. Database Structure

### Enums

| Enum | Values |
|------|--------|
| `GameMode` | `ARENA_1V1`, `CUP_1V1`, `TOURNAMENT_2V2`, `RECREATIONAL_2V2` |
| `GameStatus` | `WAITING`, `PLAYING`, `FINISHED`, `CANCELLED`, `ABANDONED` |
| `DominoVariant` | `CARROCA` (standard), `L_E_L` (doubles double), `CRUZADA` (cross) |
| `TransactionType` | `DEPOSIT`, `WITHDRAWAL`, `BET`, `WIN`, `BONUS`, `REFUND`, `FEE` |
| `TransactionStatus` | `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `TournamentStatus` | `OPEN`, `FULL`, `IN_PROGRESS`, `FINISHED`, `CANCELLED` |
| `FraudType` | `MULTI_ACCOUNT_DEVICE`, `MULTI_ACCOUNT_IP`, `SUSPICIOUS_GPS`, `GEOLOCATION_OUTSIDE_BRAZIL`, `RAPID_FIRE_BETS`, `BOT_PATTERN`, `COLLUSION_SUSPECTED`, `UNUSUAL_WIN_RATE`, `IMPOSSIBLE_MOVEMENT`, `INTEGRITY_FAIL`, `VELOCITY_ABUSE`, `DEVICE_LIMIT_EXCEEDED`, `ADMIN_ACTION` |

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
| `gps_accuracy` | Float? | GPS accuracy in metres |
| `gps_updated_at` | DateTime? | Timestamp of last GPS update |
| `device_id` | String? | For multi-account fraud detection |
| `ip_address` | String? | Last login IP |
| `is_banned` | Boolean | Default false |
| `ban_reason` | String? | Reason code or text |
| `bot_score` | Float | 0–1 probability of bot behavior (EMA) |
| `trust_score` | Float | 1.0 = fully trusted; decrements on abuse signals (EMA) |
| `cpf_verified` | Boolean | Serpro validation passed |
| `phone_verified` | Boolean | OTP verified |
| `otp_code` | String? | SHA-256 hash of current OTP |
| `otp_expires_at` | DateTime? | OTP TTL |
| `refresh_token` | String? | Stored for token rotation |
| `created_at`, `updated_at` | DateTime | |

**Relations:** `wallet` (1:1), `gamePlayers` (1:N), `tournamentPlayers` (1:N), `fraudLogs` (1:N), `couponRedemptions` (1:N), `deviceBinds` (1:N), `wonGames` (1:N)

---

### `Wallet`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userId` | String UNIQUE FK | One wallet per user |
| `real_balance` | Decimal(12,2) | Cash balance in BRL |
| `bonus_balance` | Decimal(12,2) | Bonus credits (wagering requirement applies) |
| `rollover_remaining` | Decimal(12,2) | Amount still to be wagered before withdrawal allowed |
| `created_at`, `updated_at` | DateTime | |

---

### `Transaction`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `walletId` | String FK | |
| `type` | TransactionType | |
| `amount` | Decimal(12,2) | Positive = credit, negative = debit |
| `balance_after` | Decimal? | Snapshot of balance after this transaction |
| `pix_id` | String? | Banco Inter `txid` / `e2eid` |
| `pix_qr_code` | Text? | PIX Copia e Cola string |
| `pix_key` | String? | Destination key (withdrawals) |
| `description` | String? | Human-readable note |
| `status` | TransactionStatus | |
| `metadata` | Json? | Raw Banco Inter API response |
| `created_at`, `updated_at` | DateTime | |

---

### `Game`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `mode` | GameMode | |
| `variant` | DominoVariant | Default `CARROCA` |
| `status` | GameStatus | |
| `bet_amount` | Decimal(12,2) | Per-player buy-in |
| `prize_pool` | Decimal(12,2) | Total payout (after house fee) |
| `house_fee` | Decimal(12,2) | House edge taken |
| `winner_id` | String? FK → User | |
| `winning_team` | Int? | 1 or 2 (for 2v2 modes) |
| `replay_data` | Json? | Full move history for replay |
| `room_code` | String? UNIQUE | Short code for private games |
| `tournamentId` | String? FK | Null for non-tournament games |
| `tournament_round` | Int? | Which bracket round (1-based) |
| `created_at`, `updated_at`, `finished_at` | DateTime | |

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
| `entry_fee` | Decimal(12,2) | Per-player buy-in |
| `prize_pool` | Decimal(12,2) | Accumulated (90% of collected fees) |
| `max_players` | Int | Must be power of 2 (2, 4, 8, 16…) |
| `current_players` | Int | Live count |
| `current_round` | Int | 0 = not started |
| `starts_at` | DateTime | Scheduled start |
| `finished_at` | DateTime? | |
| `created_at`, `updated_at` | DateTime | |

---

### `TournamentPlayer`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tournamentId` | String FK | |
| `userId` | String FK | |
| `eliminated_at` | DateTime? | Null = still active |
| `final_position` | Int? | 1 = champion |
| `prize_won` | Decimal(12,2) | Amount credited |
| `joined_at` | DateTime | |

**Unique constraint:** `(tournamentId, userId)`

---

### `FraudLog`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userId` | String FK | |
| `type` | FraudType | |
| `reason_code` | String? | Structured sub-code, e.g. `"BOT_PATTERN:ema_threshold"` |
| `details` | Json | Evidence details |
| `ip_address` | String? | |
| `device_id` | String? | |
| `resolved` | Boolean | Admin reviewed |
| `created_at` | DateTime | |

---

### `DeviceBind`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userId` | String FK | |
| `device_id` | String | |
| `platform` | String? | `'android'` or `'ios'` |
| `attest_key_id` | String? | App Attest keyId (iOS) |
| `first_seen` | DateTime | |
| `last_seen` | DateTime | |
| `is_active` | Boolean | |

**Unique constraint:** `(userId, device_id)`

---

### `SystemConfig`

| Column | Type | Notes |
|--------|------|-------|
| `key` | String PK | Config key name |
| `value` | String | Stored value |
| `updated_at` | DateTime | |

Runtime-editable keys (via admin): `houseEdgePercent`, `botInjectWaitSeconds`, `turnTimeoutSeconds`, `disconnectGraceSeconds`.

---

### `PairBlock`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userAId` | String | Lower UUID of the pair (enforced) |
| `userBId` | String | Higher UUID of the pair |
| `reason` | String? | |
| `active` | Boolean | |
| `created_at`, `updated_at` | DateTime | |

**Unique constraint:** `(userAId, userBId)` — matchmaking never pairs blocked users.

---

### `Coupon`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `code` | String UNIQUE | Uppercase alphanumeric |
| `bonus_amount` | Decimal(12,2) | Bonus credited on redemption |
| `min_deposit_amount` | Decimal(12,2) | Minimum deposit required |
| `rollover_times` | Int | Bonus × this = rollover requirement |
| `max_players` | Int? | Null = unlimited redemptions |
| `is_active` | Boolean | |
| `created_at`, `updated_at` | DateTime | |

---

### `CouponRedemption`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `couponId` | String FK | |
| `userId` | String FK | |
| `bonus_amount` | Decimal(12,2) | Amount credited |
| `rollover_added` | Decimal(12,2) | Rollover added to wallet |
| `created_at` | DateTime | |

**Unique constraint:** `(couponId, userId)` — one redemption per user per coupon.

---

### `PartnerCooldown`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `userAId`, `userBId` | String | Canonical pair (lower/higher UUID) |
| `consecutive_same_team` | Int | Consecutive FINISHED games on same team |
| `cooldown_remaining` | Int | Games left where pair must be on opposing teams |
| `updated_at` | DateTime | |

**Unique constraint:** `(userAId, userBId)` — after 3 consecutive same-team games, `cooldown_remaining` is set to 3.

---

### `GameRoom`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `mode` | GameMode | |
| `bet_amount` | Decimal(12,2) | |
| `label` | String? | Display name, e.g. "Sala VIP R$50" |
| `locked` | Boolean | Locked rooms block new matchmaking |
| `created_at`, `updated_at` | DateTime | |

**Unique constraint:** `(mode, bet_amount)`

---

### Entity Relationships

```
User ──────── Wallet ──────── Transaction
  │
  ├── DeviceBind
  ├── CouponRedemption ── Coupon
  ├── FraudLog
  ├── GamePlayer ──── Game ──── GameRoom (mode/bet)
  │                   │
  │             TournamentPlayer ── Tournament ── Game
  │
  └── (PartnerCooldown — userA ↔ userB)
      (PairBlock       — userA ↔ userB)
```

---

## 3. Backend API

Base URL: `http://localhost:3001/api/v1`

Protected endpoints require: `Authorization: Bearer <access_token>`

---

### 3.1 Auth — `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/otp/send` | ❌ | Send OTP SMS to phone number |
| `POST` | `/auth/otp/verify` | ❌ | Verify OTP, returns tokens + user |
| `POST` | `/auth/dev/login` | ❌ | Dev-only login (localhost or `DEV_AUTH_BYPASS=true`) |
| `POST` | `/auth/token/refresh` | ❌ | Rotate refresh token, returns new pair |
| `POST` | `/auth/logout` | ✅ | Blacklist access token, clear refresh token |
| `GET` | `/auth/me` | ✅ | Current user + wallet + trust_score |
| `PUT` | `/auth/profile` | ✅ | Update name, avatar, GPS, CPF |
| `POST` | `/auth/cpf/verify` | ✅ | Verify CPF via Serpro API |
| `DELETE` | `/auth/account` | ✅ | LGPD step 1 — sends OTP for deletion confirmation |
| `POST` | `/auth/account/confirm-deletion` | ✅ | LGPD step 2 — verify OTP and soft-delete account |
| `POST` | `/auth/data-export` | ✅ | LGPD: export all personal data |
| `POST` | `/auth/self-exclusion` | ✅ | Responsible gambling: temporary or permanent self-ban |

#### `GET /auth/me` — response
```json
{
  "id": "uuid",
  "phone": "+5511999990001",
  "name": "João Silva",
  "email": null,
  "avatar": null,
  "cpf_verified": false,
  "phone_verified": true,
  "created_at": "2026-01-01T00:00:00.000Z",
  "trust_score": 0.95,
  "is_banned": false,
  "wallet": {
    "real_balance": 150.00,
    "bonus_balance": 0.00,
    "rollover_remaining": 0.00
  }
}
```

#### LGPD account deletion (2-step)
```
DELETE /auth/account          → 202  { "message": "Código enviado. Use POST /auth/account/confirm-deletion" }
POST   /auth/account/confirm-deletion  body: { "otp": "123456" }
                              → 200  { "message": "Conta excluída com sucesso." }
```
Soft-delete: PII anonymised, financial records retained for legal obligation.

---

### 3.2 Wallet — `/wallet`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/wallet` | ✅ | Balance + last 20 transactions |
| `POST` | `/wallet/deposit` | ✅ | Create PIX charge (min R$10), returns QR code |
| `POST` | `/wallet/withdraw` | ✅ | Request PIX withdrawal (min R$20, rollover must be 0) |
| `GET` | `/wallet/transaction/:id` | ✅ | Poll transaction status |
| `POST` | `/wallet/pix/webhook` | ❌ | Banco Inter webhook (PIX confirmed) |

---

### 3.3 Game — `/game`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/game/history` | ✅ | Paginated finished games (player's own) |
| `GET` | `/game/active` | ✅ | Current active/waiting game (for reconnect) |
| `GET` | `/game/:id/replay` | ✅ | Full replay data for a finished game |
| `GET` | `/game/tournaments` | ✅ | List open/full tournaments |
| `POST` | `/game/tournaments/:id/join` | ✅ | Join a tournament (deducts entry fee, Serializable tx) |
| `GET` | `/game/tournaments/:id/bracket` | ✅ | Tournament bracket with all rounds |
| `GET` | `/game/eligibility` | ✅ | Check if user may enter paid games (`?betAmount=N`) |

#### `GET /game/eligibility?betAmount=10`
```json
// 200 — allowed
{ "eligible": true, "trust_level": "HIGH", "trust_score": 0.95 }

// 403 — blocked
{ "error": "ACCOUNT_UNDER_REVIEW", "trust_level": "LOW", "trust_score": 0.38 }
```
Users with `trust_score < 0.45` (LOW) are blocked from paid games. Free games are always accessible.

---

### 3.4 Admin — `/admin`

All routes except `/admin/login` require `Authorization: Bearer <admin_jwt>`.

#### Auth & Stats
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/login` | Get admin JWT (12h), timing-safe credential check |
| `GET` | `/admin/stats` | Platform overview: users, revenue, games, 7-day chart |

#### Users
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users` | List users (paginated, search by name/phone/CPF) |
| `GET` | `/admin/users/low-trust` | Users with `trust_score < 0.75`, sorted by lowest first |
| `PATCH` | `/admin/users/:id/ban` | Ban or unban user with reason |
| `PATCH` | `/admin/users/:id/restore-trust` | Manually restore trust_score; logs `ADMIN_ACTION` FraudLog |
| `GET` | `/admin/users/:id/pair-stats` | Win-rate stats against each opponent (collusion analysis) |

#### Games
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/games` | List games (paginated, filter by status) |
| `GET` | `/admin/games/:id/replay` | Full replay JSON |
| `GET` | `/admin/games/:id/logs` | Structured match log lines from `logs/matches.log` |

#### Transactions
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/transactions` | List transactions (paginated, filter by type/status) |
| `PATCH` | `/admin/transactions/:id/approve` | Mark withdrawal COMPLETED |
| `PATCH` | `/admin/transactions/:id/reject` | Mark withdrawal FAILED + refund balance |

#### Tournaments
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/tournaments` | List all tournaments (paginated, filter by status) |
| `POST` | `/admin/tournaments` | Create tournament |
| `POST` | `/admin/tournaments/demo` | Create demo tournament with test players pre-enrolled |
| `POST` | `/admin/tournaments/:id/start` | Force-start a FULL tournament |
| `POST` | `/admin/tournaments/:id/cancel` | Cancel OPEN/FULL + refund all entry fees |
| `POST` | `/admin/tournaments/:id/emergency-cancel` | Cancel IN_PROGRESS + refund active players |
| `GET` | `/admin/tournaments/:id/players` | Player list with join/elimination timestamps |
| `GET` | `/admin/tournaments/:id/bracket` | Full bracket with per-round game results |

#### Runtime Config
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/config` | Current runtime config values |
| `PATCH` | `/admin/config` | Update editable keys (`houseEdgePercent`, `botInjectWaitSeconds`, `turnTimeoutSeconds`, `disconnectGraceSeconds`) |

#### Anti-Collusion / Pair Blocks
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/pair-blocks` | List pair blocks (filter by active) |
| `POST` | `/admin/pair-blocks` | Create pair block (prevents matchmaking pairing) |
| `PATCH` | `/admin/pair-blocks/:id` | Update active/reason |
| `GET` | `/admin/team-pair-stats` | All 2v2 pairs with high same-team win rate |

#### Coupons / Bonus
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/coupons` | List coupons |
| `POST` | `/admin/coupons` | Create coupon |
| `PATCH` | `/admin/coupons/:id` | Toggle `is_active` |
| `GET` | `/admin/coupons/:id/redemptions` | Redemption history |

#### Fraud
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/fraud-logs` | List fraud logs (paginated, filter by type/resolved) |
| `PATCH` | `/admin/fraud-logs/:id/resolve` | Mark as reviewed |

#### Game Rooms
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/game-rooms` | List all mode/bet rooms |
| `POST` | `/admin/game-rooms` | Create room |
| `PATCH` | `/admin/game-rooms/:id` | Lock/unlock or rename |
| `DELETE` | `/admin/game-rooms/:id` | Delete room |

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
| `game:leave` | `{ gameId }` | Forfeit game |
| `game:sync_request` | `{ gameId, seq }` | Request resync if sequence gap detected |
| `queue:join` | `{ mode, betAmount, variant }` | Enter matchmaking queue |
| `queue:leave` | — | Leave matchmaking queue |
| `reaction` | `{ gameId, emoji }` | Send in-game emoji reaction |

---

### Server → Client

#### Matchmaking
| Event | Payload | Description |
|-------|---------|-------------|
| `queue:joined` | `{ botWaitSeconds? }` | In queue; bot will join after N seconds if no match |
| `queue:stats` | `{ ARENA_1V1: { total, byBet }, … }` | Live queue counts (broadcast) |
| `queue:error` | `{ message }` | Queue join rejected (trust LOW, room locked, etc.) |
| `game:found` | `{ gameId }` | Match found — navigate to game screen |

#### In-Game
| Event | Payload | Description |
|-------|---------|-------------|
| `game:state` | `GameState` | Full state update after every action (with sequence number) |
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
| `tournament:champion` | `{ tournamentId, prize }` | Player won |
| `tournament:cancelled` | `{ tournamentId, refundAmount, reason }` | Cancelled, refund issued |

---

### `GameState` object

```typescript
{
  id: string;
  seq: number;                  // monotonically increasing; client detects gaps
  status: 'waiting' | 'playing' | 'finished';
  variant: 'CARROCA' | 'L_E_L' | 'CRUZADA';
  mode: string;
  currentPlayerIndex: number;
  turnCount: number;
  firstPlayMade: boolean;
  leftOpen: number;
  rightOpen: number;
  topOpen?: number;             // CRUZADA only
  bottomOpen?: number;          // CRUZADA only
  boardTiles: PlacedTile[];
  boneyard: null[];             // count only — contents hidden
  players: [{
    userId: string;
    team: number;
    seat: number;
    isBot: boolean;
    hand: ([number, number] | null)[];   // opponent hands are null
    pipsInHand: number;
  }];
  winnerTeam?: number;
  winnerId?: string;
}
```

---

## 5. Game Engine

Located at `apps/backend/src/game/domino.engine.ts`.

### Rules

- Double-six set: 28 tiles total
- Each player receives 7 tiles (1v1 or 2v2)
- **First move rule**: must play the highest double in hand; if no doubles, highest-pip tile
- Valid move: tile must share a pip value with the open end being played on
- **Pass**: only allowed when no valid moves AND boneyard is empty
- **Draw**: player draws from boneyard until a playable tile is found (or boneyard is empty)
- **Win**: empty hand, OR all players consecutively pass (blocked game) → team with fewest pips wins
- **Tie**: equal pip totals → draw

### Variant scoring (win types)
| Type | Points | Condition |
|------|--------|-----------|
| Simples | 1 | Plain win |
| Carroça | 2 | Winning tile is a double |
| Lá e Lô | 3 | Win tile makes both open ends equal |
| Cruzada | 4 | Double AND both ends equal |

### Engine functions

| Function | Description |
|----------|-------------|
| `initGame(id, variant, players)` | Shuffle tiles, deal 7 each, set first player |
| `applyMove(state, playerIndex, tile, side, flipped)` | Validate and apply tile |
| `applyPass(state, playerIndex)` | Pass turn (only valid if no moves) |
| `drawFromBoneyard(state, playerIndex)` | Draw from pile |
| `getValidMoves(state, playerIndex)` | All legal `{tile, side, flipped}` combos |
| `getBotMove(state)` | Greedy bot — plays highest-value valid tile |

All moves are validated server-side. Invalid moves emit `game:error` and are rejected.

---

## 6. Financial Flow

### Deposit (PIX)
```
User requests deposit (min R$10)
  → Backend creates Transaction (PENDING) + PIX charge via Banco Inter
  → Returns QR code / Copia e Cola string
  → Banco Inter calls POST /wallet/pix/webhook on payment
     (dev mode: auto-confirmed after 3 seconds)
  → Webhook verifies HMAC-SHA256 signature (hard-fail in production if secret missing)
  → Backend credits wallet inside Serializable transaction
  → If valid coupon in metadata: redemption applied atomically (max_players enforced)
```

### Game Bet
```
Game starts
  → Backend debits bet_amount from each real player's wallet (BET transaction)
  → prize_pool = sum of bets × (1 − house_edge%)   [default 10%, runtime-configurable]
  → house_fee  = sum of bets × house_edge%
Game ends
  → Backend credits prize_pool / winners to each winner (WIN transaction)
```

### Withdrawal (PIX)
```
User requests withdrawal (min R$20, rollover_remaining must = 0)
  → All checks AND debit run inside Serializable transaction (prevents double-spend race)
  → Transaction status: PENDING
  → PIX transfer dispatched via Banco Inter (dev: auto-completes)
  → COMPLETED or FAILED + balance refund on error
```

### House Edge
Default: **10%** (runtime-configurable via admin)
- 1v1 — R$2 each: `prize_pool = 4 × 0.9 = R$3.60` to winner
- 2v2 — R$2 each: `prize_pool = 8 × 0.9 = R$7.20` split between winning team

---

## 7. Tournament System

### Lifecycle
```
OPEN → (fills) → FULL → (auto-start) → IN_PROGRESS → FINISHED
                                                    ↘ CANCELLED
```

- **OPEN**: accepting registrations (join uses Serializable tx to prevent over-enrollment)
- **FULL**: all spots filled, starts immediately if `starts_at` has passed; otherwise waits
- **Auto-cancel**: scheduler runs every 60s; cancels OPEN/FULL tournaments past `starts_at` with fewer than 2 players and refunds everyone

### Bracket
- Single-elimination, power of 2 (2, 4, 8, 16, 32 players)
- Total rounds: `Math.ceil(Math.log2(max_players))`
- Prize: champion takes 100% of `prize_pool`; eliminated players receive nothing

### Socket flow
1. Join → `TournamentWaiting` screen (countdown)
2. `tournament:started` → navigate to `Game`
3. Win → wait on `TournamentBracket` screen
4. `tournament:next_game` → navigate to next `Game`
5. `tournament:eliminated` → `TournamentResult`
6. `tournament:champion` → `TournamentResult` with prize

---

## 8. Authentication & Security

### JWT Tokens
- **Access token**: expires 15 minutes; signed with `JWT_ACCESS_SECRET`; includes `jti` (UUID v4)
- **Refresh token**: expires 7 days; signed with `JWT_REFRESH_SECRET`; stored in DB column
- **Token rotation**: new refresh token issued on every `/auth/token/refresh` call; old JTI is blacklisted
- **Token blacklist**: `jti` stored in Redis (or in-memory Map fallback) with TTL = remaining token lifetime; checked on every protected request

### OTP (SMS)
- 6-digit code, 5-minute expiry
- **Stored as SHA-256 hash** — plaintext never persisted
- **Comparison via `crypto.timingSafeEqual`** — prevents timing-based enumeration
- Max 5 attempts, 60-second resend cooldown
- Providers: `mock` (dev), `zenvia` (Brazil), `twilio` (international)

### Admin Authentication
- Separate secret (`ADMIN_JWT_SECRET`), 12-hour JWT
- **Timing-safe credential check**: `crypto.timingSafeEqual` for both username and password
- Dedicated rate limiter: max 5 attempts per 15 minutes per IP
- JWT includes `username` field for audit trail in FraudLog entries

### Trust Score System
- `trust_score` per user: `1.0` (trusted) → `0.0` (untrusted)
- Updated via Exponential Moving Average (EMA) on fraud signals:
  - Negative signal: `score += weight × score` (proportional to current — approaches 0)
  - Positive signal: `score += weight × (1 − score)` (proportional to headroom — approaches 1)
- **Trust levels**: HIGH `≥ 0.75` · MEDIUM `0.45–0.74` · LOW `< 0.45`
- Users with LOW trust are blocked from paid games (see `GET /game/eligibility`)
- Admin can manually restore via `PATCH /admin/users/:id/restore-trust` (logs `ADMIN_ACTION`)

### Device Attestation
- **Android**: Google Play Integrity API — server-side JWT verification via OAuth2
- **iOS**: Apple App Attest — server verifies receipt; `DeviceBind` stores `attest_key_id`
- **Nonce replay protection**: server-issued nonce included in integrity verdict; expired/reused nonces are rejected
- Required for all paid games (`bet_amount > 0`) in production; bypassed in dev

### GPS & Movement Validation
- GPS bounds: coordinates outside Brazil (approx. bounds) trigger `GEOLOCATION_OUTSIDE_BRAZIL`
- **Impossible movement detection**: >900 km/h between consecutive GPS updates → `IMPOSSIBLE_MOVEMENT` FraudLog
- Velocity throttle: accumulated abuse → `VELOCITY_ABUSE`

### Anti-Fraud Pipeline (async, non-blocking)
- **Multi-account**: same `device_id` or `ip_address` used by multiple users → `MULTI_ACCOUNT_DEVICE` / `MULTI_ACCOUNT_IP`
- **Bot detection**: EMA of move interval → `bot_score`; threshold breach → `BOT_PATTERN`
- **Collusion (2v2)**: partner always on same team with high win rate + Haversine proximity analysis → `COLLUSION_SUSPECTED`
- **Device limit**: user binds more than 3 devices → `DEVICE_LIMIT_EXCEEDED`
- **Self-exclusion**: `SELF_EXCLUSION_30_DAYS` or `SELF_EXCLUSION_PERMANENT` stored in `ban_reason`

### Rate Limiting
| Scope | Limit | Window |
|-------|-------|--------|
| Auth endpoints | 20 req | 15 min |
| Admin login | 5 req | 15 min |
| Admin API | 200 req | 15 min |
| PIX webhook | 500 req | 1 min |
| General | configurable | configurable |

### PIX Webhook
- HMAC-SHA256 signature on `x-inter-ae-in-ativa` header
- **Hard-fail in production** if `INTER_WEBHOOK_SECRET` is not set (returns 500 at startup)
- Idempotent: duplicate `txid` calls are silently ignored

### Secret Validation
- Weak/default JWT or admin secrets: **warning in dev**, **fatal error in production**
- All secrets validated at startup from `config/index.ts`

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
| `INTER_WEBHOOK_SECRET` | — | HMAC secret — required in production |
| `SERPRO_API_KEY` | — | CPF validation API key |
| `SERPRO_MOCK_MODE` | `true` | Skip real CPF API in dev |
| `SMS_PROVIDER` | `mock` | `mock` / `zenvia` / `twilio` |
| `OTP_EXPIRY_SECONDS` | `300` | |
| `OTP_LENGTH` | `6` | |
| `OTP_MAX_ATTEMPTS` | `5` | |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | |
| `TURN_TIMEOUT_SECONDS` | `30` | Auto-pass timeout (runtime-configurable) |
| `BOT_INJECT_WAIT_SECONDS` | `15` | Seconds before bot fills empty slot (runtime-configurable) |
| `DISCONNECT_GRACE_SECONDS` | `60` | Grace period before forfeit on disconnect (runtime-configurable) |
| `HOUSE_EDGE_PERCENT` | `10` | % taken from prize pool (runtime-configurable) |
| `ADMIN_USERNAME` | `admin` | |
| `ADMIN_PASSWORD` | — | Change in production |
| `ADMIN_JWT_SECRET` | — | Min 32 chars |
| `DEV_AUTH_BYPASS` | `false` | Allow dev login from non-localhost IPs |
| `DEV_AUTH_DEFAULT_PHONE` | `+5511999990001` | Default phone for dev login |
| `CORS_ORIGINS` | localhost ports | Comma-separated allowed origins (production) |
| `REDIS_URL` | _(empty)_ | Optional — enables multi-server Socket.io + token blacklist |

### Mobile (`apps/mobile/.env`)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Backend base URL including `/api/v1` |
| `EXPO_PUBLIC_SOCKET_URL` | WebSocket server URL |
| `EXPO_PUBLIC_DEV_AUTH_BYPASS` | `true` = auto-login on Splash screen |
| `EXPO_PUBLIC_FORCE_DEV_LOGIN` | `true` = force dev login from local IPs |
| `EXPO_PUBLIC_MOCK_GAME` | `true` = inject mock board for UI development |

---

## 10. Running Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ (Laragon recommended on Windows)
- Git

### 1. Start PostgreSQL (Laragon)
```powershell
& "c:/laragon/bin/postgresql/postgresql/bin/pg_ctl" start -D "c:/laragon/data/postgresql/"
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
npx prisma db push       # apply schema (dev) or migrate deploy (prod)
npx prisma generate      # generate client
npm run dev              # starts on :3001
```

### 4. Mobile
```bash
cd apps/mobile
# Edit .env — set EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
npm install
npx expo start --web --port 8083
```

### 5. Admin Dashboard
```bash
cd apps/admin
npm install
npm run dev   # starts on :3000
# Login: admin / admin123 (dev default)
```

### Dev shortcuts
- Dev login creates user `+5511999990001` with R$1,000 balance on first request
- PIX deposits auto-confirm after 3 seconds
- Bot joins after `BOT_INJECT_WAIT_SECONDS` if no second player
- All CPF validation calls are mocked (`SERPRO_MOCK_MODE=true`)
- OTP is logged to console in dev (not sent via SMS)
