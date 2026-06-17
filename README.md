# DominoClub — Project Documentation

DominoClub is a monorepo with a **backend (Node/Express + Socket.io + Prisma/Postgres)**, a **mobile app (Expo/React Native)**, and an **admin panel (Next.js)**. It provides real-money domino matches in BRL with **PIX (Woovi/OpenPix)** deposits/withdrawals, matchmaking, replays and an admin dashboard.

---

## Repository Structure

- `apps/backend` — REST API + Socket.io + Prisma (PostgreSQL) + optional Redis
- `apps/mobile` — Expo/React Native (iOS/Android/Web)
- `apps/admin` — Next.js (administrative dashboard)
- `docker-compose.yml` — Postgres + Redis + backend + admin (local/production)
- `.github/workflows/ci.yml` — CI (backend tests + tsc, mobile tsc, admin build)

---

## Stack and Decisions

- Backend: Express + Socket.io + Prisma
- Database: PostgreSQL
- Cache/horizontal scale: Redis (optional; enables Socket.io Redis adapter)
- Payments (PIX): Woovi/OpenPix (AppID auth + HMAC-SHA1 webhook)
- SMS OTP: `mock` (dev), `zenvia` (recommended prod), `twilio` (fallback)
- CPF: Serpro (with mock mode)
- Mobile: Expo (React Native)
- Admin: Next.js (Axios client with token)

---

## Running Locally

### 1) Prerequisites

- Node.js 20+
- Docker (recommended) or local PostgreSQL + Redis

### 2) Install dependencies (monorepo)

```bash
npm run install:all
```

### 3) Start Postgres + Redis (Docker)

```bash
docker compose up -d postgres redis
```

### 4) Backend: configure `.env`

Create/edit `apps/backend/.env` from `apps/backend/.env.example`.

### 5) Backend: generate Prisma + migrate

```bash
cd apps/backend
npx prisma generate
npx prisma migrate dev
```

### 6) Run backend/admin

From repo root:

```bash
npm run dev
```

Or individually:

```bash
npm run backend
npm run admin
```

### 7) Run mobile

```bash
cd apps/mobile
npm run start
```

Set `EXPO_PUBLIC_API_URL` to point the app to the correct API (see environment section).

---

## Environment Variables (what the client must provide)

### Backend (`apps/backend/.env`)

Required (production):

- `NODE_ENV=production`
- `PORT` (default 3001)
- `API_PREFIX` (default `/api/v1`)
- `DATABASE_URL` (Postgres)
- `JWT_ACCESS_SECRET` (≥ 32 chars)
- `JWT_REFRESH_SECRET` (≥ 32 chars)
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET` (≥ 32 chars)
- `CORS_ORIGINS` (allowed admin/web app origins)

PIX Woovi/OpenPix (production):

- `WOOVI_APP_ID` (AppID token from Woovi dashboard)
- `WOOVI_WEBHOOK_SECRET` (HMAC secret for webhook signature verification)
- `WOOVI_BASE_URL` (default: `https://api.openpix.com.br/api/v1`)

CPF (Serpro):

- `SERPRO_API_KEY`
- `SERPRO_BASE_URL`
- `SERPRO_MOCK_MODE` (`false` in production)

SMS OTP (production):

- `SMS_PROVIDER=zenvia|twilio`
- `SMS_API_KEY` and `SMS_SENDER` (Zenvia) or `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (Twilio)

Redis (optional, recommended for multi-instance):

- `REDIS_URL`

Anti-fraud / rate-limit:

- `ALLOWED_COUNTRIES=BR` (geofencing via CDN header; see Deploy)
- `BOT_SCORE_THRESHOLD`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`

### Admin (`apps/admin`)

- `NEXT_PUBLIC_API_URL` (e.g., `https://api.yourdomain.com/api/v1`)

### Mobile (`apps/mobile`)

- `EXPO_PUBLIC_API_URL` (e.g., `https://api.yourdomain.com/api/v1`)
- `EXPO_PUBLIC_SOCKET_URL` (e.g., `https://api.yourdomain.com` or the socket origin)
- `EXPO_PUBLIC_MOCK_MODE` (`true|false`)

---

## API to Share with the Client (app contract)

Base URL: `https://<domain>/api/v1`

### Health

- `GET /health` (no prefix) → `{ status, env }`
- `GET /api/v1/health` → `{ status, timestamp }`
- `GET /api/v1/` → `{ status, service, timestamp }`

### Auth (`/api/v1/auth`)

- `POST /otp/send` `{ phone }`
- `POST /otp/verify` `{ phone, otp }` → `{ user, accessToken, refreshToken }`
- `POST /token/refresh` `{ refreshToken }` → `{ accessToken, refreshToken }`
- `POST /logout` (Bearer) → `{ message }`
- `GET /me` (Bearer) → user + wallet (balances/rollover)
- `PUT /profile` (Bearer) `{ name?, cpf?, avatar?, gps_lat?, gps_lng? }`
- `POST /cpf/verify` (Bearer) `{ cpf }` → `{ cpf_verified, situacao, message }`

LGPD / Responsible gambling:

- `DELETE /account` (Bearer) → anonymizes PII and bans account
- `POST /data-export` (Bearer) → returns user data (in production prefer email delivery)
- `POST /self-exclusion` (Bearer) `{ type: temporary|permanent }`

### Wallet (`/api/v1/wallet`)

- `GET /` (Bearer) → wallet + recent transactions
- `POST /deposit` (Bearer) `{ amount }` → `{ txid, qrCode, transactionId }`
- `GET /transaction/:id` (Bearer) → transaction (for deposit polling)
- `POST /withdraw` (Bearer) `{ amount, pixKey }` → `{ transactionId, message }`

Woovi/OpenPix webhook (no auth):

- `POST /wallet/pix/webhook` body `{ event: "OPENPIX:CHARGE_COMPLETED", charge: { correlationID, value, status } }`
  - Header: `x-openpix-signature: <hmac-sha1>`
  - Idempotency: same `correlationID` will not be credited twice (only processes `PENDING` transactions)

### Game (`/api/v1/game`)

- `GET /history?page=1` (Bearer) → paginated match history
- `GET /active` (Bearer) → active match (WAITING/PLAYING) or `null`
- `GET /tournaments` (Bearer) → open/ongoing tournaments
- `POST /tournaments/:id/join` (Bearer) → enrolls in tournament (deducts entry fee)
- `GET /:id/replay` (Bearer) → replay (players of that game only)

### Admin (`/api/v1/admin`)

Login:

- `POST /login` `{ username, password }` → `{ token }` (JWT 12h)

Routes (admin Bearer):

- `GET /stats`
- `GET /users?search=&page=`
- `PATCH /users/:id/ban` `{ banned: boolean, reason?: string }`
- `GET /games?status=&page=`
- `GET /games/:id/replay`
- `GET /transactions?type=&status=&page=`
- `PATCH /transactions/:id/approve`
- `PATCH /transactions/:id/reject`
- `GET /tournaments?status=&page=`
- `POST /tournaments` `{ name, mode, variant?, entryFee, maxPlayers, startsAt }`
- `POST /tournaments/:id/start`
- `POST /tournaments/:id/cancel`

---

## Socket.io (game events)

Connection: socket requires `token` (JWT accessToken) in the handshake.

### Matchmaking / queue

- `queue:join` (client → server) `{ mode, betAmount }`
- `queue:joined` (server → client) `{ mode, betAmount, botWaitSeconds }`
- `queue:left` (server → client)
- `queue:error` (server → client) `{ message }`
- `queue:stats` (server → all)
- `game:found` (server → user) `{ gameId, betAmount, mode }`
- `online:count` (server → all) `{ count }`

### Gameplay

- `game:join` (client → server) `{ gameId }`
- `game:state` (server → user) current state (other players’ hands masked)
- `game:move` (client → server) `{ gameId, tile, side, flipped }`
- `game:draw` (client → server) `{ gameId }`
- `game:pass` (client → server) `{ gameId }`
- `game:emoji` (client → server) `{ gameId, emoji }`
- `game:emoji` (server → room) `{ userId, emoji, at }`
- `game:timeout` (server → room) `{ userId }`
- `game:forfeit` (server → room) `{ forfeitedUserId, reason, winnerId, winnerTeam }`
- `game:ended` (server → room) results + prize data
- `game:error` (server → user) `{ message }`

---

## Production Deploy (recommended)

### Option A — Docker Compose (simplest)

1. Fill `apps/backend/.env` for production (strong secrets, real URLs).
2. Bring services up:

```bash
docker compose up -d --build
```

### Reverse proxy / HTTPS

Use Nginx/Traefik/Cloudflare for TLS and routing:

- `https://api.yourdomain.com` → backend (3001)
- `https://admin.yourdomain.com` → admin (3000) or static build

### Geofencing (BR)

In production the backend blocks non-BR requests if it receives `cf-ipcountry` (Cloudflare).
If you don’t use Cloudflare:

- disable that logic (not recommended), or
- configure any CDN/proxy that injects an equivalent header.

### PIX (Woovi/OpenPix) — what the client must do

1. Create/use a Woovi account at [woovi.com](https://woovi.com).
2. Generate an AppID in the Woovi dashboard (API/Plugins section).
3. Set `WOOVI_APP_ID` in `apps/backend/.env`.
4. Register the webhook URL in Woovi dashboard: `https://api.yourdomain.com/api/v1/wallet/pix/webhook`
5. Copy the webhook HMAC secret from Woovi and set `WOOVI_WEBHOOK_SECRET` in `.env`.
6. No certificates or mTLS required — Woovi uses simple token-based auth.

---

## Handoff Checklist (give to the client)

### Accounts/external

- Woovi/OpenPix (PIX): AppID token + webhook secret (no certificates needed)
- Serpro (CPF): API key (if enabling real CPF verification)
- SMS: Zenvia or Twilio credentials
- Infra: domain/DNS/SSL, server (VPS/K8s), managed Postgres or container
- CDN/Proxy (optional but recommended): Cloudflare for TLS + `cf-ipcountry`

### Configuration/production

- Fill `apps/backend/.env` (production) and keep out of git
- Set `NEXT_PUBLIC_API_URL` for admin
- Set `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_SOCKET_URL` for mobile (EAS Build)
- Create real admin username/password

### Operations

- Run Prisma migrations on first boot
- Configure Postgres backups
- Set up monitoring/logs (container stdout is a baseline)

---

## Where to Find the “Contract”

- REST API (this README) + routes in: `apps/backend/src/routes/*.routes.ts`
- PIX webhook: `apps/backend/src/controllers/wallet.controller.ts`
- Socket events: `apps/backend/src/socket/index.ts` and `apps/backend/src/socket/gameSocket.ts`
