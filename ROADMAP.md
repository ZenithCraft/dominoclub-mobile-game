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

### 1.3 SMS OTP Provider
- [ ] Choose and wire SMS provider (Twilio, Zenvia, or Infobip — Zenvia is Brazil-native)
- [ ] Replace mock OTP with real SMS dispatch
- [ ] OTP expiry and max-attempts enforcement

**File:** `apps/backend/src/services/otp.service.ts`

### 1.4 Game Replay System
- [ ] Record each move into `Game.replayData` (JSONB) during `gameSocket.ts` event handlers
- [ ] Expose `GET /api/v1/game/:id/replay` endpoint
- [ ] Serve replay data to admin dashboard

**Files:** `apps/backend/src/socket/gameSocket.ts`, `apps/backend/src/controllers/game.controller.ts`

### 1.5 Tournament Bracket Engine
- [ ] Implement tournament round advancement (elimination bracket logic)
- [ ] Trigger next-round matchmaking automatically when round completes
- [ ] Distribute prize pool to winner on tournament completion

**New file needed:** `apps/backend/src/services/tournament.service.ts`

---

## Phase 2 — Mobile Game Client (Priority: Critical)

### 2.1 Complete GameScreen Gameplay Logic
- [ ] Tile drag-and-drop or tap-to-select interaction
- [ ] Client-side move validation (legal placement preview)
- [ ] Board rendering: layout tiles correctly for CARROCA / L_E_L / CRUZADA
- [ ] Real-time sync: consume all socket events (`game:state`, `game:turn`, `game:end`)
- [ ] Pass-turn button when no legal moves
- [ ] Timeout countdown with auto-pass on expiry

**File:** `apps/mobile/src/screens/GameScreen.tsx`

### 2.2 Wallet Deposit/Withdrawal Flow
- [ ] Deposit screen: show generated PIX QR code (from backend)
- [ ] Poll or socket-listen for payment confirmation → update balance
- [ ] Withdrawal screen: CPF/PIX key entry, amount validation, submission
- [ ] Transaction history with status badges (PENDING / COMPLETED / FAILED)

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

### 3.1 Connect to Backend API
- [ ] Create API client (Axios instance with admin JWT)
- [ ] Admin login screen with protected routes
- [ ] Replace all mock data with real API calls

**File:** `apps/admin/src/app/page.tsx` → refactor into separate route files

### 3.2 Users Tab
- [ ] Fetch real user list with pagination
- [ ] Ban/unban action calling `PATCH /api/v1/admin/users/:id`
- [ ] Search by phone, CPF, name
- [ ] User detail modal (game history, transaction history, fraud logs)

### 3.3 Financial Tab
- [ ] Fetch pending withdrawals
- [ ] Approve/reject withdrawal actions
- [ ] Revenue charts using real data (Recharts already installed)
- [ ] Export to CSV

### 3.4 Games Tab
- [ ] Fetch game list with real data
- [ ] Replay viewer: render game moves step-by-step from `replayData`

### 3.5 Fraud Monitoring Tab (New)
- [ ] Table of `FraudLog` entries
- [ ] Filter by type (IP_BLOCK, DEVICE_BLOCK, GEO_BLOCK)
- [ ] Link fraud logs to user profiles

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
