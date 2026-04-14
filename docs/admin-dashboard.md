# Admin Dashboard

This report documents what was inspected, implemented, and verified in the Admin Dashboard (web) and its supporting Backend Admin API. The focus is technical: routes, data models, server-side enforcement, and verification status.

## Scope and repositories

- Admin web app: `apps/admin` (Next.js App Router, client-side dashboard)
- Backend API: `apps/backend` (Express + Prisma + Socket.IO)
- Database: PostgreSQL via Prisma schema `apps/backend/prisma/schema.prisma`
- Admin API prefix: `/api/v1/admin` (mounted by backend)

## Admin web architecture (apps/admin)

### Routing and UI structure

- Next.js App Router pages:
  - `/login`: `apps/admin/src/app/login/page.tsx`
  - `/`: `apps/admin/src/app/page.tsx` (single-page dashboard with tab navigation)
- Tabs are implemented as local React state; the “dashboard” is a client component (`'use client'`).

### Authentication model (admin web)

- Token storage: `localStorage.admin_token`
- Request auth: Axios interceptor attaches `Authorization: Bearer <token>` to every request.
- Session handling:
  - If no token exists on load, the dashboard redirects to `/login`.
  - If the API returns `401`, the token is removed and the user is redirected to `/login`.

Files:
- `apps/admin/src/lib/api.ts` (Axios client + interceptors)
- `apps/admin/src/app/page.tsx` (auth guard + dashboard)

### Admin API client behavior

- Base URL is controlled by `NEXT_PUBLIC_API_URL` and defaults to `http://localhost:3001/api/v1`.
- All requests go through the `/admin` prefix by design (e.g., `GET /admin/stats`).

## Backend Admin API (apps/backend)

### Routing and authorization model

- Admin routes: `apps/backend/src/routes/admin.routes.ts`
- Mounted under: `/api/v1/admin`
- Authorization:
  - `POST /admin/login` is public.
  - All other `/admin/*` routes require the `adminMiddleware` which validates a JWT and enforces `role === 'admin'`.
  - Admin credentials are environment-based (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) and not stored in DB.

Files:
- `apps/backend/src/routes/admin.routes.ts`
- `apps/backend/src/middleware/admin.middleware.ts`
- `apps/backend/src/controllers/admin.controller.ts`
- `apps/backend/src/config/index.ts`

## What was implemented and verified (requirements)

### 1) Remove “Bet tolerance” from Admin and enforce exact bet matching

Status: Implemented and verified (TypeScript build passes).

Technical changes:
- Matchmaking now matches only if `a.betAmount === b.betAmount` (no percentage tolerance).
- The Admin Config no longer exposes “matchmakingBetTolerance”.
- The Backend runtime config no longer includes `matchmakingBetTolerance`, and the Admin `/admin/config` update whitelist no longer allows it.

Files:
- `apps/backend/src/services/matchmaking.service.ts`
- `apps/backend/src/services/runtime-config.service.ts`
- `apps/backend/src/controllers/admin.controller.ts` (config update whitelist)
- `apps/admin/src/app/page.tsx` (Config tab metadata)

### 2) Bots must only exist in free tables

Interpretation:
- “Free table” is defined as `betAmount === 0`.
- Paid tables are any `betAmount > 0`.

Status: Implemented and verified (TypeScript build passes).

Technical changes:
- Bot injection is disabled for paid queues:
  - When joining a queue, the server computes `botWaitSeconds = 0` if `betAmount > 0`.
  - Only free queues (`betAmount === 0`) can schedule bot injection with `botWaitSeconds = runtimeConfig.botInjectWaitSeconds`.
- Bot wait time sent to the client now reflects the above (0 for paid).

Files:
- `apps/backend/src/socket/index.ts` (queue join handler; bot scheduling decision)
- `apps/backend/src/services/matchmaking.service.ts` (bot injection timer signature now accepts `waitSeconds`)
- `apps/backend/src/services/runtime-config.service.ts` (source of `botInjectWaitSeconds`)

### 3) Player match history: detect suspicious pair win-rate and block both players from playing together

Status: Implemented and verified (TypeScript build passes). This includes:
- Storage for pair-blocking decisions
- Admin endpoints to manage pair blocks
- Matchmaking enforcement (server-side)
- Admin UI to inspect “pair stats” and create blocks

#### 3.1 Pair blocking persistence

Data model:
- `PairBlock` table created with a canonicalized unique key `(userAId, userBId)` and an `active` flag.
- Canonical form is enforced by normalizing the pair ordering server-side (`min(userId), max(userId)`).

File:
- `apps/backend/prisma/schema.prisma` (`PairBlock` model)

#### 3.2 Matchmaking enforcement (server-side hard block)

- Matchmaking checks `PairBlock.active` for the candidate users before creating a match.
- Applies to:
  - 1v1: candidate pair is checked directly.
  - 2v2: any blocked pair among the 4-player group prevents that group from forming.
- A small in-memory cache is used to avoid hitting the DB repeatedly for the same pair.

File:
- `apps/backend/src/services/matchmaking.service.ts`

#### 3.3 Admin endpoints for pair blocks

Admin routes added:
- `GET /admin/pair-blocks`
- `POST /admin/pair-blocks` (upsert to ensure canonical uniqueness)
- `PATCH /admin/pair-blocks/:id` (activate/deactivate)

Files:
- `apps/backend/src/controllers/admin.controller.ts`
- `apps/backend/src/routes/admin.routes.ts`

#### 3.4 Pair win-rate stats endpoint

Admin route added:
- `GET /admin/users/:id/pair-stats?days=30&minGames=10`

Implementation notes:
- Uses a raw SQL query via Prisma to compute pair aggregation from `Game` + `GamePlayer`.
- Excludes bots (`GamePlayer.is_bot = false`) from pair stats.
- Win attribution:
  - For 2v2 modes, “win” is based on `Game.winning_team` vs the requesting user’s team.
  - For 1v1 modes, “win” is based on `Game.winner_id === userId`.
- Response includes a computed `alert` boolean when win-rate ≥ 0.90 (current threshold).

File:
- `apps/backend/src/controllers/admin.controller.ts`

#### 3.5 Admin UI for investigation and blocking

- Users tab gained:
  - A “Pairs” action button per user that loads `/admin/users/:id/pair-stats`.
  - A table showing (other player, games, wins, win-rate, alert).
  - A “Block” button that creates `PairBlock` via `/admin/pair-blocks`.
- A dedicated “Blocks” tab was added to list/create/toggle pair blocks.

File:
- `apps/admin/src/app/page.tsx` (Users tab + PairBlocks tab)

### 4) Tournaments: view registered players and active brackets

Status: Implemented and verified (TypeScript build passes).

Backend routes added:
- `GET /admin/tournaments/:id/players` (registered players, elimination status, joined time)
- `GET /admin/tournaments/:id/bracket` (tournament metadata + all tournament games ordered by round)

Admin UI changes:
- Tournaments tab gained a “Details” button:
  - “Registered players” panel
  - “Bracket / Games” panel with tournament-round, game status, and participants

Files:
- `apps/backend/src/controllers/admin.controller.ts`
- `apps/backend/src/routes/admin.routes.ts`
- `apps/admin/src/app/page.tsx` (Tournaments tab)

### 5) Tournament emergency button: cancel tournament and refund money to all active players

Status: Implemented and verified (TypeScript build passes).

Semantics implemented:
- Emergency cancel is allowed for tournaments not yet `FINISHED` or already `CANCELLED`.
- Refund target is “active players” defined as `TournamentPlayer.eliminated_at IS NULL`.
- Refund amount is the tournament `entry_fee`.
- Games for the tournament that are `WAITING` or `PLAYING` are marked `CANCELLED`.
- A `tournament:cancelled` socket event is emitted to all tournament participants.

Backend route added:
- `POST /admin/tournaments/:id/emergency-cancel` with a `reason` field.

Admin UI:
- “Emergency” button shown when tournament is `IN_PROGRESS`.

Files:
- `apps/backend/src/services/tournament.service.ts` (`emergencyCancelTournament`)
- `apps/backend/src/controllers/admin.controller.ts`
- `apps/backend/src/routes/admin.routes.ts`
- `apps/admin/src/app/page.tsx` (Tournaments tab)

### 6) Bonus tab with coupon creation + value + player limit + bonus rollover

Status: Implemented and verified (TypeScript build passes).

#### 6.1 Data model

New models:
- `Coupon`:
  - `code` (unique)
  - `bonus_amount`
  - `rollover_times` (integer multiplier)
  - `max_players` (optional global usage limit)
  - `is_active`
- `CouponRedemption`:
  - unique per `(couponId, userId)` to prevent multiple uses per user
  - stores `bonus_amount` and `rollover_added` for auditability

File:
- `apps/backend/prisma/schema.prisma`

#### 6.2 Admin coupon management API

Routes added:
- `GET /admin/coupons`
- `POST /admin/coupons` (create)
- `PATCH /admin/coupons/:id` (activate/deactivate)
- `GET /admin/coupons/:id/redemptions` (audit)

Files:
- `apps/backend/src/controllers/admin.controller.ts`
- `apps/backend/src/routes/admin.routes.ts`

#### 6.3 Player redemption API

Route added (player-authenticated):
- `POST /wallet/redeem-coupon` `{ code }`

Behavior:
- Validates coupon exists and is active.
- Enforces:
  - global `max_players` usage limit when defined
  - one use per user via `CouponRedemption` unique constraint
- Wallet updates:
  - `bonus_balance += bonus_amount`
  - `rollover_remaining += bonus_amount * rollover_times`
- Records a `Transaction` with type `BONUS`.

Files:
- `apps/backend/src/services/coupon.service.ts`
- `apps/backend/src/controllers/wallet.controller.ts`
- `apps/backend/src/routes/wallet.routes.ts`
- `apps/backend/src/utils/validators.ts` (redeem schema)

#### 6.4 Rollover decrement on betting (“playthrough”)

Behavior:
- On every bet deduction, the system reduces `rollover_remaining` by `min(rollover_remaining, betAmount)`.
- This ties rollover to “amount wagered” (not net result), which is a typical wagering requirement design.

File:
- `apps/backend/src/services/wallet.service.ts` (`deductBet`)

#### 6.5 Admin UI: Bonus/Coupons tab

Added:
- “Bonus” tab to create and manage coupons:
  - code, bonus value, rollover multiplier, player limit
  - activate/deactivate coupons
  - shows redemption counts

File:
- `apps/admin/src/app/page.tsx`

## Database migrations and Prisma client

- A new migration was created/applied for the new models (`PairBlock`, `Coupon`, `CouponRedemption`).
- Note (Windows): Prisma engine rename can fail with `EPERM` during generate; generation was completed using `prisma generate --no-engine` to unblock TypeScript compilation.

## Verification performed

- Backend TypeScript build: `npm run build --workspace=apps/backend` (passed)
- Admin Next.js production build: `npm run build --workspace=apps/admin` (passed)
- IDE diagnostics: no TypeScript diagnostics reported after changes

## Known technical considerations (follow-ups)

- Pair stats are computed on-demand via a raw SQL query. For large datasets, consider:
  - adding a materialized aggregation table
  - caching pair stats per user and window
  - indexing strategy on `Game.created_at`, `GamePlayer.userId`, and related joins
- Bot injection “only free tables” is enforced at queue join time. If other code paths can enqueue bots, they should also apply the same rule.
- Emergency tournament cancel currently refunds active players (not eliminated players). If business rules require “refund everyone regardless of elimination state”, the logic should be adjusted.

