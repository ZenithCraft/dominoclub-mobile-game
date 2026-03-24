# DominoClub — Implementation Roadmap

## Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Database schema** | ✅ 100% | All 8 models + tournament bracket migration done |
| **Backend API** | ✅ ~95% | Auth, wallet, PIX, game engine, matchmaking, socket, anti-fraud, tournaments, replays, LGPD endpoints |
| **Mobile App** | ✅ ~95% | Game client, wallet, tournaments, legal screens, first-launch consent modal — beta-ready |
| **Admin Dashboard** | ✅ 100% | Connected to live backend: stats, users, games, financial tabs all wired |
| **PIX Payments** | ✅ 100% | Webhook + mTLS + HMAC verification + withdrawal flow complete |
| **CPF / SMS** | ⚠️ Partial | SMS: Zenvia + Twilio wired. CPF: Serpro call coded, real API key needed |
| **Tests** | ⚠️ ~60% | Backend unit tests (engine, OTP, wallet, matchmaking) + integration test setup done. E2E: none |
| **DevOps / Deploy** | ✅ 100% | Docker (multi-stage), docker-compose, GitHub Actions CI, Redis adapter |
| **Launch Prep** | ✅ ~95% | EAS Build config, legal screens, LGPD endpoints — pending live store accounts for beta |

---

## Remaining Work Before Launch

| Item | Effort | Blocks |
|------|--------|--------|
| Serpro CPF API key (production credential) | Low | Compliance |
| Full game-flow integration test | Medium | CI confidence |
| PIX webhook integration test | Medium | CI confidence |
| PgBouncer connection pooling | Low | Scale |
| Mobile E2E tests (Detox/Maestro) | High | QA |
| TestFlight / internal Play track beta | Low | Store accounts |

---

## Recommended Execution Order ✅ Complete

```
Phase 1.1 (PIX webhooks)     ✅
Phase 2.1 (Game client)      ✅
Phase 2.2 (Wallet mobile UI) ✅
Phase 1.3 (SMS OTP)          ✅
Phase 3.1–3.6 (Admin)        ✅
Phase 1.2 (CPF validation)   ⚠️ coded — real API key needed
Phase 1.4 (Replays)          ✅
Phase 1.5 (Tournaments)      ✅
Phase 2.3 (Error handling)   ✅
Phase 2.4 (ModeSelect)       ✅
Phase 4   (Tests)            ⚠️ unit done — integration/E2E pending
Phase 5   (Hardening)        ✅
Phase 6   (Launch)           ✅ legal/config done — store submission pending
```

---

## Phase 1 — Backend Completion (Priority: Critical)

### 1.1 PIX Payment Flow ✅
- [x] Implement `pixWebhook` handler to receive payment confirmations from Banco Inter
- [x] Update transaction status from `PENDING → COMPLETED` on webhook callback
- [x] Credit user wallet automatically after PIX confirmation
- [x] Implement withdrawal flow: validate balance → create PIX transfer → mark as `PROCESSING`
- [x] Webhook HMAC-SHA256 signature verification (`x-inter-ae-in-ativa` header)
- [x] mTLS certificates support in Axios client (production only)
- [x] `registerPixWebhook()` called on server startup
- [x] `GET /wallet/transaction/:id` status polling endpoint

**Files:** `apps/backend/src/services/pix.service.ts`, `apps/backend/src/controllers/wallet.controller.ts`, `apps/backend/src/routes/wallet.routes.ts`

### 1.2 CPF Validation (Serpro API)
- [ ] Replace mock with real Serpro API call
- [ ] Handle CPF already in use (unique constraint)
- [ ] Rate limit CPF verification to prevent abuse

**File:** `apps/backend/src/services/auth.service.ts`

### 1.3 SMS OTP Provider ✅
- [x] Multi-provider architecture: `SMS_PROVIDER=mock|zenvia|twilio` (env-switched)
- [x] Zenvia integration (Brazil-native) — `POST /v2/channels/sms/messages`
- [x] Twilio integration (international fallback) — REST API with Basic Auth
- [x] Resend cooldown — throws if new OTP requested before `OTP_RESEND_COOLDOWN_SECONDS` (default 60s)
- [x] Max-attempts enforcement — locks code after `OTP_MAX_ATTEMPTS` (default 5) failed tries
- [x] Remaining attempts shown in error message ("2 tentativas restantes")
- [x] Mobile `handleResend` now shows server cooldown error inline instead of swallowing it
- [x] `auth.service.ts` updated — `verifyOtp` throws descriptive errors, no silent `false` return

**File:** `apps/backend/src/services/otp.service.ts`

### 1.4 Game Replay System ✅
- [x] Record each move into `Game.replay_data` (JSONB) during `gameSocket.ts` event handlers
- [x] `ReplayData` structure: initial deal + boneyard + typed move sequence (play/draw/pass/timeout)
- [x] `GET /api/v1/game/:id/replay` endpoint (players can fetch their own games)
- [x] `GET /api/v1/admin/games/:id/replay` endpoint (admin can fetch any game)

**Files:** `apps/backend/src/socket/gameSocket.ts`, `apps/backend/src/controllers/game.controller.ts`

### 1.5 Tournament Bracket Engine ✅
- [x] Schema: added `tournamentId` + `tournament_round` to `Game`; `current_round` to `Tournament`
- [x] `tournament.service.ts` — `startTournament`, `advanceTournamentBracket`, `createTournament`
- [x] Single-elimination bracket: random seeding, bye for odd players, auto-advance each round
- [x] `handleGameEnd` calls `advanceTournamentBracket` for tournament games
- [x] `joinTournamentHandler` auto-starts tournament when max_players reached
- [x] Prize pool credited to winner via wallet transaction on tournament completion
- [x] Entry fee refund on admin cancel
- [x] Admin endpoints: `GET/POST /admin/tournaments`, `POST /admin/tournaments/:id/start`, `POST /admin/tournaments/:id/cancel`

**Files:** `apps/backend/src/services/tournament.service.ts`, `apps/backend/src/socket/gameSocket.ts`, `apps/backend/src/controllers/game.controller.ts`, `apps/backend/src/controllers/admin.controller.ts`

---

## Phase 2 — Mobile Game Client (Priority: Critical)

### 2.1 Complete GameScreen Gameplay Logic ✅
- [x] Client-side valid move detection (mirrors domino.engine.ts `canPlayTile`)
- [x] Unplayable tiles dimmed (opacity 0.4); playable tiles show green dot indicator
- [x] Tap-to-select: selecting an unplayable tile shows error toast instead
- [x] Smart side selection: single valid play → one "Jogar" button; multiple sides → separate buttons
- [x] Correct `flipped` value computed from valid plays (no longer hardcoded `false`)
- [x] Auto-deselect tile when server state invalidates selection
- [x] `game:error` handler with animated toast
- [x] Disconnect/reconnect banner + auto re-join on reconnect
- [x] Fixed socket `useEffect` cleanup bug (listeners now properly removed on unmount)
- [x] Auto-pass emitted when turn timer reaches 0
- [x] Pass button only shown when boneyard is empty AND no valid moves
- [x] Draw button only shown when boneyard has tiles
- [x] `topOpen`/`bottomOpen` added to GameState for CRUZADA support
- [x] `game:ended` result card extracted into `ResultCard` sub-component

**File:** `apps/mobile/src/screens/GameScreen.tsx`

### 2.2 Wallet Deposit/Withdrawal Flow ✅
- [x] Deposit 3-step flow: amount → QR code → confirmed
- [x] Real QR code rendered via `react-native-qrcode-svg` (added dependency)
- [x] Preset amounts + custom amount input ("Outro" option)
- [x] Polling `GET /wallet/transaction/:id` every 3s to detect PENDING → COMPLETED
- [x] Success pulse animation + balance auto-refresh on confirmation
- [x] Rollover remaining indicator on balance card
- [x] Withdraw button disabled + explanation when rollover > 0 or balance < R$20
- [x] MAX button auto-fills full available balance
- [x] PIX key warning ("Não é possível reverter um saque")
- [x] Pull-to-refresh on transaction history
- [x] Error state with tap-to-retry on transaction list
- [x] PROCESSING status badge added (for withdrawals in transit)
- [x] Polling auto-stopped on modal close / unmount

**File:** `apps/mobile/src/screens/WalletScreen.tsx`

### 2.3 Error Handling & Loading States ✅
- [x] `useToastStore` (Zustand) — queue-based toast store, usable outside React (API interceptors)
- [x] `toast.error/success/info/warning` helpers for imperative usage
- [x] `ToastContainer` — animated slide-in/out toasts, stacked, dismissable, auto-expire after 3.5s
- [x] `ToastContainer` mounted at app root in `App.tsx` (above all navigation)
- [x] `api.ts` interceptor: network errors, 5xx, 403, 429 → auto-toast; auth/form paths silenced
- [x] `LoadingOverlay` — full-screen modal spinner with optional message
- [x] `Button` component: added missing `outline` variant (used by RegisterScreen CPF verify button)

### 2.4 ModeSelectScreen — Tournament Entry ✅
- [x] Two-tab layout: Partida Rápida / Torneios
- [x] Quick Match tab: 3 game modes (ARENA_1V1, RECREATIONAL_2V2, CUP_1V1), bet grid, balance warning
- [x] `queue:error` now uses `toast.error()` instead of `alert()`
- [x] Tournaments tab: fetches `GET /game/tournaments`, pull-to-refresh
- [x] `TournamentCard`: name, variant, date, status badge, entry fee, prize pool (gold), player fill bar, round number (IN_PROGRESS)
- [x] Enroll confirmation modal: fee deduction preview, post-fee balance, insufficient balance guard
- [x] Joined state badge: "Inscrito — aguardando início" after successful enroll
- [x] Balance auto-refreshed from auth store after joining

**File:** `apps/mobile/src/screens/ModeSelectScreen.tsx`

---

## Phase 3 — Admin Dashboard Integration (Priority: High)

### 3.1 Connect to Backend API ✅
- [x] `apps/admin/src/lib/api.ts` — Axios client with auto-attach admin JWT + redirect to /login on 401
- [x] `POST /api/v1/admin/login` endpoint — username/password → JWT (12h expiry)
- [x] Admin JWT middleware (`admin.middleware.ts`) — verifies `role: admin` claim
- [x] Admin credentials in config + `.env.example` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`)

### 3.2 Login Page ✅
- [x] `/login` page — form, error display, stores token in localStorage, redirects to dashboard
- [x] Auth guard on dashboard — redirects to `/login` if no token

### 3.3 Overview Tab ✅
- [x] `GET /admin/stats` — totalUsers, onlineNow (from `activeGames` Map), activeGames, revenue24h, deposits24h, withdrawals24h, revenueWeek (7-day SQL aggregation)
- [x] Revenue and games charts wired to live data
- [x] Refresh button

### 3.4 Users Tab ✅
- [x] `GET /admin/users?search=&page=` — paginated, searchable by name/phone/CPF
- [x] Fraud log count badge per user
- [x] `PATCH /admin/users/:id/ban` — ban/unban with reason
- [x] Pagination component

### 3.5 Games Tab ✅
- [x] `GET /admin/games?status=&page=` — paginated, filterable by status
- [x] Duration calculated from `created_at`/`finished_at`
- [x] Status filter dropdown

### 3.6 Financial Tab ✅
- [x] `GET /admin/transactions?type=&status=&page=` — paginated, filterable
- [x] Pending withdrawals total + count in header
- [x] `PATCH /admin/transactions/:id/approve` — marks COMPLETED
- [x] `PATCH /admin/transactions/:id/reject` — marks FAILED + refunds balance to user

---

## Phase 4 — Testing (Priority: High)

### 4.1 Backend Unit Tests ✅
- [x] Jest + ts-jest configured in `package.json` (`test`, `test:watch`, `test:coverage` scripts)
- [x] Shared Prisma mock (`src/__mocks__/prisma.service.ts`) — all model methods are `jest.fn()`, auto-reset between tests
- [x] **domino.engine.test.ts** — 35 assertions covering:
  - `generateTiles`: count, completeness, no duplicates
  - `shuffle`: same elements, non-mutating
  - `initGame`: hand sizes (2p/4p), 28 tiles total, first player holds highest double, firstPlayMade=false
  - `canPlayTile`: first play, left/right matching, flipping, double no-flip, no match, CRUZADA top/bottom
  - `getValidMoves`: filters playable tiles correctly
  - `applyMove`: tile removal, board update, leftOpen/rightOpen, currentPlayerIndex, win detection, throws on missing tile, resets consecutivePasses, CRUZADA cross
  - `applyPass`: consecutivePasses, passedLastTurn, blocked game, pip-count winner, tie
  - `drawFromBoneyard`: hand growth, boneyard shrink, empty boneyard no-op, immutability
  - `getBotMove`: draw/pass/play actions, greedy tile preference, first play
  - Full 2-player game simulation (up to 500 turns, asserts `status === 'finished'`)
- [x] **otp.service.test.ts** — OTP length, uniqueness, cooldown enforcement, maxAttempts lockout, expiry
- [x] **wallet.service.test.ts** — deductBet (real/bonus/split/insufficient/not found/BET record), creditWin (increment/WIN record), deposit/withdraw minimums + delegation
- [x] **matchmaking.service.test.ts** — dedup enqueue, dequeue removes, 1v1 match fires event, bet tolerance rejection, 2v2 needs 4 players, game.create called with correct mode

### 4.2 Backend Integration Tests ✅ (setup)
- [x] **auth.integration.test.ts** — Supertest suite for OTP send/verify, /auth/me 401, token refresh 401, admin login, admin stats 401
- [x] Auto-skips when `DATABASE_URL` not set or `NODE_ENV !== 'test'` to avoid CI failures
- [ ] Full game flow integration test (join queue → match → play → end → wallet updated)
- [ ] PIX deposit webhook → balance credit

**Tool:** Supertest + test PostgreSQL instance

### 4.3 Mobile E2E Tests
- [ ] Auth flow
- [ ] Game play session

**Tool:** Detox or Maestro

---

## Phase 5 — Production Hardening (Priority: Medium) ✅

### 5.1 Security ✅
- [x] Geofencing active in production via `cf-ipcountry` header (Cloudflare) — blocks non-BR IPs
- [x] PIX webhook HMAC-SHA256 (`x-inter-ae-in-ativa`) — verified in `wallet.controller.ts`
- [x] mTLS certificates loaded in production for Banco Inter API calls
- [x] **Startup validation**: `config/index.ts` throws `FATAL` if weak/default JWT or admin secrets detected in `NODE_ENV=production`
- [x] **Per-endpoint rate limiting** (tiered): auth=20/15min, webhook=500/min, admin=200/15min, general=configurable

### 5.2 DevOps ✅
- [x] `apps/backend/Dockerfile` — multi-stage build (builder → production), non-root user, runs `prisma migrate deploy` on start
- [x] `apps/admin/Dockerfile` — Next.js multi-stage build
- [x] `docker-compose.yml` — Postgres 16, Redis 7, backend, admin; health checks; volume persistence
- [x] `.github/workflows/ci.yml` — GitHub Actions: backend (Postgres + Redis services, migrate, test coverage, tsc, build), mobile (tsc), admin (build)
- [x] `apps/backend/.dockerignore`

### 5.3 Performance ✅
- [x] `redis.service.ts` — optional Redis client (ioredis) with graceful in-memory fallback; logs masked URL
- [x] Socket.io Redis adapter (`@socket.io/redis-adapter`) — auto-enabled when `REDIS_URL` is set; enables horizontal scaling across multiple backend instances
- [x] `server.ts` — Redis connected before Socket.io server creation; graceful shutdown flushes Redis + Prisma; `SIGINT` handled
- [x] `GET /health` endpoint added for Docker/load-balancer health checks
- [x] `REDIS_URL` added to `.env.example` and `docker-compose.yml`
- [ ] Database connection pooling (PgBouncer) — configure via `?connection_limit=` in `DATABASE_URL`

---

## Phase 6 — Launch Prep (Priority: Low until Phase 5 done) ✅

- [x] Apple App Store submission config (Expo EAS Build — `eas.json`, production profile, `eas submit`)
- [x] Google Play submission config (`android.buildType: app-bundle`, `serviceAccountKeyPath`)
- [x] Terms of Service screen (`TermsScreen.tsx`) — 11 sections PT-BR, scroll-to-accept gate
- [x] Privacy Policy screen (`PrivacyPolicyScreen.tsx`) — LGPD art. 18 rights, data export + delete buttons
- [x] Responsible gambling screen (`ResponsibleGamblingScreen.tsx`) — warning signs, CVV 188, self-exclusion (30d / permanent)
- [x] First-launch consent modal (`ConsentModal.tsx`) — age gate (18+) + ToS acceptance, AsyncStorage-persisted
- [x] Legal screens registered in stack navigator (`Terms`, `PrivacyPolicy`, `ResponsibleGambling`)
- [x] Profile modal links to all 3 legal screens
- [x] Backend LGPD endpoints: `DELETE /auth/account` (PII anonymisation), `POST /auth/data-export`, `POST /auth/self-exclusion`
- [ ] Beta test via TestFlight / internal Play track (requires live Apple/Google developer accounts)
