# DominoClub — Implementation Roadmap

## Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Database schema** | ✅ 100% | All 8 models, migrations done |
| **Backend API** | ✅ ~90% | Auth, wallet, game engine, matchmaking, socket, anti-fraud all implemented |
| **Mobile App** | ⚠️ ~75% | All screens scaffolded, game client logic incomplete |
| **Admin Dashboard** | ⚠️ ~60% | UI done, still uses mock data — not connected to backend |
| **PIX Payments** | ⚠️ ~50% | Charge creation coded, webhook + withdrawal flow incomplete |
| **CPF / SMS** | ❌ Mock only | Serpro + SMS provider not wired |
| **Tests** | ❌ 0% | No test files exist |
| **DevOps / Deploy** | ❌ 0% | No Docker, no CI/CD |

---

## Recommended Execution Order

```
Phase 1.1 (PIX webhooks)     ← unlocks real money flow
Phase 2.1 (Game client)      ← core gameplay completeness
Phase 2.2 (Wallet mobile UI) ← tied to Phase 1.1
Phase 1.3 (SMS OTP)          ← needed for real users
Phase 3.1–3.3 (Admin)        ← needed for operations
Phase 1.2 (CPF validation)   ← needed for compliance
Phase 1.4 (Replays)          ← nice to have
Phase 4   (Tests)            ← parallel with above
Phase 5   (Hardening)        ← before launch
Phase 6   (Launch)
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

### 1.5 Tournament Bracket Engine
- [ ] Implement tournament round advancement (elimination bracket logic)
- [ ] Trigger next-round matchmaking automatically when round completes
- [ ] Distribute prize pool to winner on tournament completion

**New file needed:** `apps/backend/src/services/tournament.service.ts`

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

### 2.3 Error Handling & Loading States
- [ ] Global API error interceptor → toast/snackbar notifications
- [ ] Loading spinners on all async actions
- [ ] Reconnection banner when socket disconnects
- [ ] Form validation feedback on all inputs

### 2.4 ModeSelectScreen — Tournament Entry
- [ ] List open tournaments with entry fee and prize pool
- [ ] Enroll button with fee deduction confirmation modal
- [ ] Show tournament bracket/status

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

### 4.1 Backend Unit Tests
- [ ] Game engine logic (`domino.engine.ts`) — tile distribution, move validation, win detection
- [ ] Auth service — OTP generation/validation, JWT handling
- [ ] Wallet service — balance operations, rollover calculation
- [ ] Matchmaking service — queue logic, bot injection

**Tool:** Jest + ts-jest

### 4.2 Backend Integration Tests
- [ ] Full auth flow (register → OTP → login → refresh)
- [ ] Full game flow (join queue → match → play → end → wallet updated)
- [ ] PIX deposit webhook → balance credit

**Tool:** Supertest + test PostgreSQL instance

### 4.3 Mobile E2E Tests
- [ ] Auth flow
- [ ] Game play session

**Tool:** Detox or Maestro

---

## Phase 5 — Production Hardening (Priority: Medium)

### 5.1 Security
- [ ] Enable real geofencing (currently commented out for dev)
- [ ] mTLS or HMAC verification on PIX webhooks
- [ ] Rotate JWT secrets in production
- [ ] Audit and harden Prisma queries against injection

### 5.2 DevOps
- [ ] `Dockerfile` for backend
- [ ] `docker-compose.yml` for local dev (Postgres + backend + admin)
- [ ] GitHub Actions CI: lint → test → build on push to main
- [ ] Environment-based config (dev / staging / prod)

### 5.3 Performance
- [ ] Redis for matchmaking queues (replace in-memory Map)
- [ ] Socket.io Redis adapter for horizontal scaling
- [ ] Database connection pooling (PgBouncer or Prisma pool config)
- [ ] Rate limit tuning per endpoint

---

## Phase 6 — Launch Prep (Priority: Low until Phase 5 done)

- [ ] Apple App Store submission (Expo EAS Build)
- [ ] Google Play submission
- [ ] Terms of Service & Privacy Policy screens in app
- [ ] Responsible gambling notice (required for Brazilian market)
- [ ] LGPD compliance (Brazilian GDPR equivalent)
- [ ] Beta test via TestFlight / internal Play track
