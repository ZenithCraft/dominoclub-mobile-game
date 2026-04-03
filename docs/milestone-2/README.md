# Milestone 2 — Game Logic + 1v1 Gameplay Integrated with Wallet

> **Status:** Complete
> **Completion date:** April 2026
> **Goal:** Server-side domino rules & validation · 1v1 real-time gameplay · full flow: deposit → play → payout · reconnection working

---

## Table of Contents

- [What was delivered](#what-was-delivered)
- [Implementation details](./implementation.md)
- [Test coverage](./tests.md)

---

## What was delivered

### 1. Domino Engine (server-side)

Pure TypeScript game engine — fully deterministic and testable without I/O.

- **28 tiles** generated canonically `[0,0]` → `[6,6]`
- **Fisher-Yates shuffle** — uniform distribution guaranteed
- **7 tiles per player** (1v1 and 2v2), remainder goes to the boneyard
- **First player** determined by whoever holds the highest double
- **3 variants implemented:**
  - `CARROCA` — blocked game, lowest pip count wins
  - `L_E_L` — doubles count double in the blocked-game tiebreak
  - `CRUZADA` — cross-shaped board (4 open ends: left, right, top, bottom)
- **Server-side move validation** — clients cannot submit illegal moves
- **Blocked-game resolution** — all players pass consecutively → lowest total pip count wins; tie = no winner, no payout
- **Bot AI** — greedy strategy (prioritises highest-value tiles), simulates think time (1–3 s)

### 2. Matchmaking + In-Memory Queue

- One queue per game mode (`ARENA_1V1`, `CUP_1V1`, `TOURNAMENT_2V2`, `RECREATIONAL_2V2`)
- 1v1 match requires bets within 10% of each other (`MATCHMAKING_BET_TOLERANCE`)
- 2v2 match groups the first 4 players with similar bets
- **Bot injection:** if a player waits longer than `BOT_INJECT_WAIT_SECONDS` (default 5 s), a bot is created and injected automatically
- Anti-collusion for 2v2: team assignments are randomised after player selection

### 3. Real-time Gameplay (Socket.io)

- JWT auth on the handshake — bots and banned users are rejected before connecting
- Each socket joins a private room `user:<userId>` — per-player private events
- Room `game:<gameId>` — broadcasts to the entire table
- **Hidden hands:** the state sent to each player masks all opponents' tiles as `null`
- **Turn timer:** 30 s per move, auto-pass on timeout
- **4 action types:** `game:move`, `game:draw`, `game:pass`, `game:emoji`
- **Replay recorded** in memory during the match (initial deal + full move sequence) → persisted to the database on game end

### 4. Integrated Wallet Flow

#### PIX Deposit
- `POST /wallet/deposit` creates a PIX charge via Banco Inter (mock in dev, mTLS in production)
- Pix Copia e Cola QR code returned to the client
- `POST /wallet/pix/webhook` — receives the Inter notification, verifies HMAC-SHA256 signature, credits the balance

#### Bet deduction (game start)
- `deductBet()` called inside `startGame()` — **bonus balance is spent first**
- Atomic operation: if balance is insufficient, the game does not start
- A `BET` transaction is written to the ledger

#### Prize payout (game end)
- `handleGameEnd()` computes `prize_pool = bet × players × (1 − house_edge%)`
- `creditWin()` called for each human winner
- A `WIN` transaction is written to the ledger
- Game row updated with `winner_id`, `replay_data`, `finished_at`

#### Withdrawal
- `POST /wallet/withdraw` — checks `rollover_remaining === 0`
- Balance deducted **before** calling the PIX API (prevents double-spend on server restart)
- On failure: atomic rollback (balance restored + transaction marked `FAILED`)

### 5. Reconnection Grace Period

- On disconnect, a `DISCONNECT_GRACE_SECONDS` timer (default 15 s) starts
- Within the window: `game:join` cancels the timer, current state is re-sent, game resumes
- After expiry: `forfeitGame()` runs → opponent wins, prize paid, status `ABANDONED`

### 6. Anti-Fraud

- Non-Brazilian IP blocking in production (Cloudflare `CF-IPCountry` header)
- Multi-account detection via `device_id` and `ip_address`
- Immutable `FraudLog` row written for every detected signal

### 7. Admin API

15 REST endpoints protected by admin JWT:
- Platform stats, user listing/banning, games with replay, transactions with withdrawal approve/reject, tournament management

---

## Quick Links

| Document | Content |
|---|---|
| [implementation.md](./implementation.md) | Architectural decisions, detailed flows, code structure |
| [tests.md](./tests.md) | What each suite tests, coverage by module, how to run |
| [../backend-architecture.md](../backend-architecture.md) | Full reference: schema, REST APIs, Socket.io events |
