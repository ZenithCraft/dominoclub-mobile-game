# Milestone 2 — Implementation Details

---

## 1. Domino Engine

**File:** `apps/backend/src/game/domino.engine.ts`

The engine is **pure** — no side effects, no I/O. Every function receives a `GameState` and returns a new `GameState` (deep-cloned via `JSON.parse(JSON.stringify(...))`). This guarantees:

- Full testability without mocks
- Deterministic replay (re-applying the same move sequence always reaches the same state)
- Immutability by convention (no accidental state mutation across callers)

### GameState structure

```typescript
interface GameState {
  id: string;
  variant: 'CARROCA' | 'L_E_L' | 'CRUZADA';
  players: PlayerState[];    // each player's hand
  board: PlacedTile[];       // sequence of played tiles
  boneyard: Tile[];          // remaining draw pile
  leftOpen: number;          // pip value open on the left end
  rightOpen: number;         // pip value open on the right end
  topOpen?: number;          // CRUZADA only
  bottomOpen?: number;       // CRUZADA only
  currentPlayerIndex: number;
  turnCount: number;
  consecutivePasses: number; // used to detect a blocked game
  status: 'waiting' | 'playing' | 'finished';
  winnerId?: string;
  winnerTeam?: number;
  firstPlayMade: boolean;    // first tile sets the open ends
}
```

### Move validation flow

```
applyMove(state, playerIndex, tile, side, flipped)
  1. If firstPlayMade: call canPlayTile() — throws on illegal move
  2. Remove tile from player hand — throws if tile not found
  3. Compute effectiveTile: [left, right] or [right, left] when flipped
  4. Update leftOpen / rightOpen / topOpen / bottomOpen based on 'side'
  5. CRUZADA: first double opens topOpen / bottomOpen
  6. Check win condition: hand.length === 0
  7. Advance currentPlayerIndex (circular)
```

### Blocked game resolution

When `consecutivePasses >= players.length`, `resolveBlockedGame()` is called:

```
For each team:
  sum all pips remaining in hand
  L_E_L variant: doubles count double in the total
Team with the lowest total wins
Tie: winnerId = undefined — no winner, no payout
```

---

## 2. Socket.io Flow — Matchmaking to Game End

```
[Client A] queue:join { mode: 'ARENA_1V1', betAmount: 5 }
     │
     ▼
[Server] Check wallet balance (real + bonus >= betAmount)
         enqueue(entry) → tryMatch()
         startBotInjectionTimer() → injects bot after 5 s if no one joins
     │
     ▼
[Client B] queue:join (betAmount within 10% of A)
     │
     ▼
[Server] tryMatch() finds a compatible pair
         createMatch():
           prisma.game.create(status: 'PLAYING', prize_pool, house_fee)
           matchmakingEvents.emit('match_created')
     │
     ▼
[Socket.io] game:found { gameId } → A and B receive via room user:<id>
     │
     ▼
[A and B] game:join { gameId }
     │
     ▼
[Server] gameSocket.ts:
         - Verify userId is in game.players
         - updateMany GamePlayer.connected = true
         - Cancel disconnectTimer if one existed (reconnection path)
         - If !activeGames.has(gameId): startGame()
           └─ deductBet() for each human player
           └─ initGame() — shuffle, deal, determine first player
           └─ activeGames.set(gameId, state)
           └─ gameReplays.set(gameId, { initialDeal, initialBoneyard })
           └─ prisma.game.update(status: 'PLAYING')
           └─ broadcastGameState() — sends personalised view to each player
           └─ startTurnTimer() — 30 s for the current player to act
           └─ scheduleBotTurn() — if the current player is a bot
         - If activeGames.has(gameId): send current state (reconnection path)
     │
     ▼
[Game loop]
  game:move → applyMove() → recordMove() → broadcastGameState()
  game:draw → drawFromBoneyard() → recordMove() → broadcastGameState()
  game:pass → applyPass() → recordMove() → broadcastGameState()
  Turn timeout → auto applyPass() → game:timeout broadcast
  Bot turn → scheduleBotTurn() → getBotMove() → apply action
     │
     ▼ (status === 'finished')
[handleGameEnd()]
  clearTurnTimer()
  activeGames.delete(gameId)
  For each human winner: creditWin(wallet, prizePool / winners)
  prisma.game.update(status, winner_id, winning_team, replay_data, finished_at)
  For each player: prisma.gamePlayer.updateMany(final_score = pip count)
  io.emit('game:ended', { status, winnerId, prizePool, prizePerWinner, players[] })
  If game.tournamentId: advanceTournamentBracket()
```

---

## 3. Wallet Service — Design Decisions

### Bonus / real balance split

The `Wallet` keeps two separate fields: `real_balance` and `bonus_balance`.

- **PIX deposit** → always credited to `real_balance`
- **Bonus** → promotional credit, not directly withdrawable
- **Bet deduction** → bonus is consumed **first**; real balance is only debited for the remainder
- **Withdrawal** requires `rollover_remaining === 0` — the player must wager enough before withdrawing converted bonus funds

```typescript
// deductBet logic
const useBonus = wallet.bonus_balance >= amount;
const bonusDeduction = useBonus ? amount : wallet.bonus_balance;
const realDeduction = amount - bonusDeduction;
if (wallet.real_balance < realDeduction) throw new Error('Insufficient balance');
```

### Double-spend prevention on withdrawal

```typescript
// processWithdrawal: balance is ALWAYS deducted before calling the PIX API
const transaction = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
  await tx.wallet.update({ data: { real_balance: { decrement: amountBRL } } });
  return tx.transaction.create({ data: { status: 'PENDING', ... } });
});

// PIX API called only after the atomic DB write
// On failure: explicit rollback (balance restored + transaction marked FAILED)
```

This guarantees that even if the server restarts after debiting but before PIX confirms, the balance is not silently lost — the `PENDING` transaction can be reconciled.

---

## 4. PIX Integration — Banco Inter

**File:** `apps/backend/src/services/pix.service.ts`

| Environment | Behaviour |
|---|---|
| `development` | QR code generated locally as a mock string; webhook auto-confirms |
| `production` | mTLS mandatory (cert + key configured via `INTER_CERT_PATH` / `INTER_KEY_PATH`) |

### Deposit lifecycle

```
1. createPixCharge(userId, amount)
   ├── Generate unique txid (UUID without hyphens, 26 chars — Inter standard)
   ├── PUT /pix/v2/cob/{txid} on Inter (production) or mock QR (dev)
   └── prisma.transaction.create(type: 'DEPOSIT', status: 'PENDING', pix_id: txid)

2. [User pays the QR code in their banking app]

3. Banco Inter → POST /api/v1/wallet/pix/webhook
   ├── verifyPixWebhookSignature() — HMAC-SHA256 (skipped in dev)
   └── confirmPixDeposit(txid)
       └── prisma.$transaction([wallet.real_balance++, transaction.status = 'COMPLETED'])
```

### Webhook registration with Inter

On server startup, `registerPixWebhook()` registers the webhook URL with Inter via `PUT /pix/v2/webhook/{pixKey}`. The call is idempotent — it can be made multiple times safely.

---

## 5. Reconnection Grace Period

**File:** `apps/backend/src/socket/gameSocket.ts`

```
[Player disconnects]
  GamePlayer.connected = false
  disconnectTimer = setTimeout(forfeit, DISCONNECT_GRACE_SECONDS * 1000)
  disconnectTimers.set(`${gameId}:${userId}`, timer)

[Player reconnects within the grace window]
  game:join received
  disconnectTimers.get(key) → clearTimeout()
  disconnectTimers.delete(key)
  GamePlayer.connected = true
  getPlayerView(state, userId) → game:state sent (opponents' hands still masked)

[Grace window expired]
  forfeitGame(gameId, userId, io, 'disconnect')
  ├── winnerTeam = opposing team
  └── handleGameEnd(state, { status: 'ABANDONED' })
```

---

## 6. Replay System

During each match a `ReplayData` object is kept in memory:

```typescript
interface ReplayData {
  gameId: string;
  variant: string;
  initialDeal: { userId: string; hand: [number, number][] }[];  // starting hands
  initialBoneyard: [number, number][];                           // starting boneyard
  moves: ReplayMove[];                                           // every action: play/draw/pass/timeout
}
```

On game end, `replay_data` is persisted to the `Game.replay_data` JSON column. This allows the full match to be reconstructed on the history screen.

---

## 7. Redis and Horizontal Scaling

On startup the server attempts to connect to Redis. If available:

- `@socket.io/redis-adapter` is mounted automatically
- Multiple server instances can share Socket.io rooms (horizontal scale-out)

If Redis is unavailable (local development), the server runs in single-server mode without error — the adapter is simply not loaded.

---

## 8. Production Security Controls

| Check | Where | What it enforces |
|---|---|---|
| JWT required | `auth.middleware.ts` + socket handshake | All protected routes and connections |
| Separate admin JWT | `admin.middleware.ts` | All `/admin/*` routes |
| Weak secret detection | `config/index.ts` at startup | Fast-fail if default secrets are in use |
| mTLS certificate | `pix.service.ts` | Authenticity of calls to Banco Inter |
| Webhook HMAC | `pix.service.ts:verifyPixWebhookSignature` | Webhook payload not forged |
| Geo-blocking | `antifraud.middleware.ts` | Brazil-only in production (Cloudflare header) |
| Multi-account detection | `antifraud.middleware.ts:checkMultiAccount` | Same `device_id` or IP shared across 3+ accounts |
| Balance check | `socket/index.ts` + `wallet.service.ts` | Before queue entry and before bet deduction |
| Rollover gate | `pix.service.ts:processWithdrawal` | Bonus must be wagered before withdrawal is allowed |
