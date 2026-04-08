# Milestone 5 — Implementation Details

---

## 1. Dynamic Rake Configuration

### Data model

**File:** `apps/backend/prisma/schema.prisma`
**Migration:** `apps/backend/prisma/migrations/20260408000000_system_config/migration.sql`

```prisma
model SystemConfig {
  key        String   @id
  value      String
  updated_at DateTime @updatedAt
}
```

All values are stored as `TEXT` and parsed to the correct numeric type by the service layer. Using a single generic table instead of a typed config model means adding new tunables requires only a seed row and a service-layer change — no schema migration.

The migration also seeds the five default rows so the table is never empty in a fresh deployment:

```sql
INSERT INTO "SystemConfig" ("key", "value", "updated_at")
VALUES
  ('houseEdgePercent',        '10',   NOW()),
  ('matchmakingBetTolerance', '0.10', NOW()),
  ('botInjectWaitSeconds',    '30',   NOW()),
  ('turnTimeoutSeconds',      '30',   NOW()),
  ('disconnectGraceSeconds',  '15',   NOW())
ON CONFLICT ("key") DO NOTHING;
```

`ON CONFLICT DO NOTHING` means re-running the migration on an existing database (e.g. after a failed deployment) does not overwrite admin-edited values.

---

### Runtime config service

**File:** `apps/backend/src/services/runtime-config.service.ts`

```
getRuntimeConfig()
  ├── cache hit (Date.now() < cacheExpiresAt)  → return cachedConfig
  └── cache miss
       ├── prisma.systemConfig.findMany()
       ├── merge with envDefaults() (env vars as fallback)
       ├── set cacheExpiresAt = now + 60_000
       └── return cachedConfig
           └── on DB error → logger.warn + return envDefaults()
```

**Why 60-second TTL?**

A shorter TTL (e.g. 1 s) would add a DB round-trip to every single match creation. A longer TTL (e.g. 5 min) would mean the admin has to wait too long after a change. 60 s is a reasonable balance: changes propagate within a minute, and the typical match rate means one DB read per ~60 match creations.

**`invalidateRuntimeConfigCache()`** sets `cacheExpiresAt = 0`. It is called immediately after `PATCH /admin/config` so the next matchmaking call picks up the new value without waiting for the TTL.

**`getHouseEdgePercent()`** is a convenience wrapper that avoids spreading the full config everywhere it's not needed.

---

### Matchmaking integration

**File:** `apps/backend/src/services/matchmaking.service.ts`

```typescript
// Before (Milestone 4)
prize_pool: betAmount * players.length * (1 - config.game.houseEdgePercent / 100),
house_fee:  betAmount * players.length * (config.game.houseEdgePercent / 100),

// After (Milestone 5)
const houseEdge = await getHouseEdgePercent();
prize_pool: betAmount * players.length * (1 - houseEdge / 100),
house_fee:  betAmount * players.length * (houseEdge / 100),
```

`createMatch` was already `async` (it calls `prisma.game.create`), so adding one more `await` has no structural cost.

The house edge value recorded in each `Game` row via `house_fee / (bet_amount * player_count)` implicitly documents what rate was applied to that specific game, which is useful for historical financial auditing.

---

### Admin API

**File:** `apps/backend/src/controllers/admin.controller.ts`

`PATCH /admin/config` validates three things before writing:

1. All keys in the request body are in `EDITABLE_KEYS` (unknown keys return 400).
2. All values are non-negative numbers (NaN or negative returns 400).
3. `houseEdgePercent` cannot exceed 50% (a guardrail against accidental entries like `100`).

Upsert pattern:

```typescript
await prisma.systemConfig.upsert({
  where: { key },
  update: { value: String(value) },
  create: { key, value: String(value) },
});
```

Using `upsert` means the endpoint is idempotent and can be called multiple times safely. After all writes, `invalidateRuntimeConfigCache()` is called before reading the new config back to return in the response.

---

## 2. Fraud Log Admin API

**File:** `apps/backend/src/controllers/admin.controller.ts`

### `GET /admin/fraud-logs`

Supports three optional query params:
- `type` — filter by `FraudType` enum value
- `resolved` — `"true"` or `"false"` (defaults to unresolved in the UI)
- `page` — pagination (20 per page)

Each entry is joined with the `User` record for display (name + phone). The `resolved` index added to `FraudLog` in the migration makes filtered queries efficient.

### `PATCH /admin/fraud-logs/:id/resolve`

Sets `resolved = true`. This is intentionally one-way — fraud logs are audit records and should not be unresolved once reviewed. The admin dashboard only shows the "Resolver" button for unresolved entries.

---

## 3. Admin Dashboard — New Tabs

**File:** `apps/admin/src/app/page.tsx`

### FraudTab

Reads from `GET /admin/fraud-logs` using the shared `useData` hook. Filters are implemented as controlled `<select>` elements that reset `page` to 1 on change to avoid empty result pages.

The details column truncates to 60 characters and exposes the full JSON in a `title` attribute (visible on hover). This avoids blowing out the table layout while still making the data accessible.

### ConfigTab

Reads from `GET /admin/config` using `useData`. Once data arrives it is copied into a `draft` state (string-keyed for `<input>` compatibility) via a `useEffect` with a `useRef` guard to avoid re-setting the draft on every re-render:

```typescript
React.useEffect(() => {
  if (data && data !== prevDataRef.current) {
    prevDataRef.current = data;
    const initial: Record<string, string> = {};
    for (const { key } of CONFIG_META) initial[key] = String((data as any)[key] ?? '');
    setDraft(initial);
  }
}, [data]);
```

On submit, string values are parsed back to numbers before being sent in the PATCH body. A "Salvo com sucesso!" banner auto-hides after 3 seconds.

`CONFIG_META` drives both the display and the `<input>` bounds (min/max/step), so adding a new tunable requires only one object entry.

### Navigation additions

Two new SVG icons (`IconShield`, `IconSliders`) were added inline. The `NAV` array type was widened from 5 to 7 entries and the main `{tab === ...}` block gained two more conditional renders.

---

## 4. Game Lobby Prize Display Fix

**File:** `apps/mobile/src/screens/ModeSelectScreen.tsx`

### Root cause

The original hardcoded arrays used 5% house edge for prize computation:

```
R$10 × 2 players × (1 - 0.05) = R$19  ← displayed
R$10 × 2 players × (1 - 0.10) = R$18  ← actual server value
```

### Fix

Prize values are now computed via helpers that reference a single `HOUSE_EDGE` constant:

```typescript
const HOUSE_EDGE = 0.10;
function prize1v1(buyIn: number) { return buyIn * 2 * (1 - HOUSE_EDGE); }
function prize2v2(buyIn: number) { return buyIn * 4 * (1 - HOUSE_EDGE) / 2; }

const LIVRE_1V1: RoomOption[] = [
  { id: 'l1', buyIn: null, prize: 0           },
  { id: 'l2', buyIn: 2,    prize: prize1v1(2)  },  // R$3,60 (was R$3,80)
  { id: 'l3', buyIn: 10,   prize: prize1v1(10) },  // R$18   (was R$19)
  { id: 'l4', buyIn: 25,   prize: prize1v1(25) },  // R$45   (was R$47,50)
  { id: 'l5', buyIn: 50,   prize: prize1v1(50) },  // R$90   (was R$95)
];
```

The `prize2v2` helper divides the total prize pool by 2 because in 2v2 there is one winning team (2 players), and the prize displayed on the room card is the per-team prize.

---

## 5. Production Deployment

### nginx/nginx.conf

Key design decisions:

**Rate limiting zones:**
```nginx
limit_req_zone $binary_remote_addr zone=api:10m   rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth:10m  rate=5r/m;
limit_req_zone $binary_remote_addr zone=admin:10m rate=10r/s;
```

The `auth` zone is deliberately strict (5 req/min) to limit brute-force OTP and login attempts. The `api` zone (30 req/s) is permissive enough for normal use but stops runaway clients.

**WebSocket upgrade:**
```nginx
location /socket.io/ {
    proxy_pass             http://127.0.0.1:3001;
    proxy_http_version     1.1;
    proxy_set_header       Upgrade    $http_upgrade;
    proxy_set_header       Connection "upgrade";
    proxy_read_timeout     3600s;
    proxy_send_timeout     3600s;
}
```

`proxy_read_timeout` / `proxy_send_timeout` of 3600 s allow long-lived Socket.io connections without nginx closing them on idle.

**Admin IP allowlist** is included but commented out. Uncomment and fill in the VPN/office CIDR before deploying to production.

---

### deploy.sh

```
./deploy.sh
  ├── validate env vars (fail-fast on weak secrets)
  ├── git pull --ff-only
  ├── tag running images as :prev
  ├── docker compose build --parallel
  ├── docker compose up -d postgres redis
  ├── wait for pg_isready
  ├── docker compose run --rm backend prisma migrate deploy
  ├── docker compose up -d --remove-orphans
  ├── nginx -t && nginx -s reload  (or systemctl reload nginx)
  └── poll GET /health until healthy (15 × 4s = 60s timeout)
```

**Why `--ff-only` for git pull?** Forces the deploy to fail if the local branch has diverged from origin, making it impossible to accidentally deploy a mix of local and remote commits.

**Why tag images as `:prev`?** `docker compose down + up` with a bad image leaves the service down. Tagging `:prev` first means `./deploy.sh --rollback` can restore the previous version in seconds by re-tagging `:prev → :latest` and restarting.

**Secret validation** checks both that the variable is set and that it is not still the known-weak default value from `.env.example`. This catches the most common production misconfiguration without requiring an external secrets manager.

---

## Summary of Changes

| File | Type | What changed |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modified | Added `SystemConfig` model; added `resolved` index on `FraudLog` |
| `apps/backend/prisma/migrations/20260408000000_system_config/migration.sql` | Created | `SystemConfig` table DDL; `FraudLog_resolved_idx`; default seed rows |
| `apps/backend/src/services/runtime-config.service.ts` | Created | In-memory cache over `SystemConfig`; `getRuntimeConfig`, `getHouseEdgePercent`, `invalidateRuntimeConfigCache` |
| `apps/backend/src/services/matchmaking.service.ts` | Modified | Import `getHouseEdgePercent`; `createMatch` reads live house edge per match |
| `apps/backend/src/controllers/admin.controller.ts` | Modified | Import `getRuntimeConfig`, `invalidateRuntimeConfigCache`; added `getConfigHandler`, `updateConfigHandler`, `getFraudLogsHandler`, `resolveFraudLogHandler` |
| `apps/backend/src/routes/admin.routes.ts` | Modified | Added `GET /config`, `PATCH /config`, `GET /fraud-logs`, `PATCH /fraud-logs/:id/resolve` |
| `apps/admin/src/app/page.tsx` | Modified | Added `React` import; widened `Tab` type; added `IconShield`, `IconSliders`; added `fraud` + `config` to `NAV`; added `FraudTab` and `ConfigTab` components |
| `apps/mobile/src/screens/ModeSelectScreen.tsx` | Modified | Replaced hardcoded prize values with `HOUSE_EDGE` constant + `prize1v1`/`prize2v2` helpers |
| `nginx/nginx.conf` | Created | Production nginx reverse proxy with SSL, rate limiting, WebSocket support |
| `deploy.sh` | Created | One-command deploy with env validation, migrations, rolling restart, health check, rollback support |
