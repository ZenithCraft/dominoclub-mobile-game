# Milestone 5 — Test Coverage

---

## 1. Dynamic Rake Configuration

### Unit tests

**File:** `apps/backend/src/__tests__/runtime-config.service.test.ts` *(to be added)*

| Scenario | What to assert |
|---|---|
| DB returns rows | `getRuntimeConfig()` returns parsed numeric values |
| DB throws | Falls back to env-var defaults; logs a warning |
| Cache hit | Second call within TTL does not call `prisma.systemConfig.findMany` |
| Cache invalidation | After `invalidateRuntimeConfigCache()`, next call hits DB again |
| `getHouseEdgePercent` | Returns `houseEdgePercent` field from config |

### Integration test — admin config endpoints

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}' | jq -r '.token')

# 2. Read current config
curl -s http://localhost:3001/api/v1/admin/config \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: { houseEdgePercent: 10, matchmakingBetTolerance: 0.1, ... }

# 3. Update house edge to 8%
curl -s -X PATCH http://localhost:3001/api/v1/admin/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"houseEdgePercent": 8}' | jq .
# Expected: { houseEdgePercent: 8, ... }

# 4. Verify DB write
curl -s http://localhost:3001/api/v1/admin/config \
  -H "Authorization: Bearer $TOKEN" | jq .houseEdgePercent
# Expected: 8

# 5. Reject unknown key
curl -s -X PATCH http://localhost:3001/api/v1/admin/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"unknownKey": 5}' | jq .
# Expected: { "error": "Unknown config keys: unknownKey" } (400)

# 6. Reject house edge > 50
curl -s -X PATCH http://localhost:3001/api/v1/admin/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"houseEdgePercent": 75}' | jq .
# Expected: { "error": "houseEdgePercent cannot exceed 50%" } (400)

# 7. Restore default
curl -s -X PATCH http://localhost:3001/api/v1/admin/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"houseEdgePercent": 10}' | jq .
```

### Matchmaking prize propagation test

Start a 1v1 match with `betAmount = 10` after setting `houseEdgePercent = 8`. The resulting `Game` row should have:

```
prize_pool = 10 * 2 * (1 - 0.08) = 18.4
house_fee  = 10 * 2 * 0.08       = 1.6
```

Verify via:
```sql
SELECT bet_amount, prize_pool, house_fee
FROM "Game"
ORDER BY created_at DESC
LIMIT 1;
```

---

## 2. Fraud Log Admin API

### Integration tests

```bash
# Requires at least one FraudLog entry in the DB (created by playing games with
# anti-fraud triggers active — see Milestone 4 tests.md).

# 1. List all unresolved fraud logs
curl -s "http://localhost:3001/api/v1/admin/fraud-logs?resolved=false" \
  -H "Authorization: Bearer $TOKEN" | jq '{total: .total, first: .logs[0]}'

# 2. Filter by type
curl -s "http://localhost:3001/api/v1/admin/fraud-logs?type=BOT_PATTERN" \
  -H "Authorization: Bearer $TOKEN" | jq '.logs[].type'
# All values should be "BOT_PATTERN"

# 3. Resolve a specific entry
LOG_ID=$(curl -s "http://localhost:3001/api/v1/admin/fraud-logs?resolved=false" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.logs[0].id')

curl -s -X PATCH "http://localhost:3001/api/v1/admin/fraud-logs/$LOG_ID/resolve" \
  -H "Authorization: Bearer $TOKEN" | jq '.resolved'
# Expected: true

# 4. Confirm it is now filtered out from unresolved
curl -s "http://localhost:3001/api/v1/admin/fraud-logs?resolved=false" \
  -H "Authorization: Bearer $TOKEN" | jq ".logs[] | select(.id == \"$LOG_ID\")"
# Expected: empty (no output)

# 5. Confirm it appears in resolved list
curl -s "http://localhost:3001/api/v1/admin/fraud-logs?resolved=true" \
  -H "Authorization: Bearer $TOKEN" | jq ".logs[] | select(.id == \"$LOG_ID\") | .resolved"
# Expected: true
```

### Edge cases

| Scenario | Expected |
|---|---|
| Resolve an already-resolved log | Prisma update succeeds (idempotent — `resolved` stays `true`) |
| Resolve a non-existent ID | 400 with Prisma record-not-found error |
| Request without admin JWT | 401 from `adminMiddleware` |

---

## 3. Admin Dashboard UI — Manual Verification

### Fraud tab

1. Log in to admin at `http://localhost:3000`
2. Navigate to **Fraudes** in the sidebar (shield icon)
3. Confirm the table loads with pending fraud logs (filter defaults to `resolved=false`)
4. Change the type filter to **Padrão de bot** — only `BOT_PATTERN` rows should appear
5. Click **Resolver** on any row — the row should disappear (filtered out) and a resolved log should appear under the `resolved=true` filter
6. Change resolved filter to **Todos** — both pending and resolved entries visible

### Config tab

1. Navigate to **Configurações** (sliders icon)
2. Confirm all five fields are pre-filled with DB values
3. Change **House Edge (%)** to `8` and click **Salvar configurações**
4. Confirm "Salvo com sucesso!" banner appears
5. Reload the page — confirm `8` is still shown
6. Attempt to set `houseEdgePercent` to `75` — `alert()` should show the 50% cap error
7. Restore to `10` and save

---

## 4. Prize Display Accuracy

### Manual verification

Open `ModeSelectScreen` on the lobby. For each 1v1 room:

| Buy-in | Expected prize (10% edge) |
|---|---|
| R$2  | R$3,60 |
| R$10 | R$18,00 |
| R$25 | R$45,00 |
| R$50 | R$90,00 |

For 2v2 (per-team prize):

| Buy-in | Expected prize per team (10% edge) |
|---|---|
| R$2  | R$3,60 |
| R$10 | R$18,00 |
| R$25 | R$45,00 |
| R$50 | R$90,00 |

Verify that the lobby-displayed prize matches the `prize_pool` in the `Game` row after a match is created.

### Unit test

**File:** `apps/mobile/src/__tests__/ModeSelectScreen.test.tsx` *(existing — ensure prizes updated)*

```typescript
it('LIVRE_1V1 prizes match 10% house edge', () => {
  expect(LIVRE_1V1[1].prize).toBeCloseTo(3.6);   // R$2 buy-in
  expect(LIVRE_1V1[2].prize).toBeCloseTo(18);    // R$10 buy-in
  expect(LIVRE_1V1[3].prize).toBeCloseTo(45);    // R$25 buy-in
  expect(LIVRE_1V1[4].prize).toBeCloseTo(90);    // R$50 buy-in
});
```

---

## 5. Production Deployment

### Pre-deploy checklist

```bash
# Confirm all required env vars are set
source apps/backend/.env
echo "JWT_ACCESS_SECRET length: ${#JWT_ACCESS_SECRET}"  # must be ≥ 32
echo "ADMIN_PASSWORD: $ADMIN_PASSWORD"                  # must not be 'changeme_in_production'

# Dry-run nginx config
nginx -t -c /path/to/nginx/nginx.conf
# Expected: configuration file ... syntax is ok + test is successful

# Test deploy script env validation (should fail fast with weak defaults)
JWT_ACCESS_SECRET=dev_access_secret_min_32_chars_here ./deploy.sh
# Expected: exits with "[deploy] JWT_ACCESS_SECRET is still the default dev value"
```

### Post-deploy health checks

```bash
# Backend
curl -sf https://api.YOUR_DOMAIN/health | jq .
# Expected: { "status": "ok", ... }

# Admin login
curl -sf -X POST https://api.YOUR_DOMAIN/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}' | jq .token
# Expected: JWT string

# WebSocket connect (requires wscat: npm install -g wscat)
wscat -c "wss://api.YOUR_DOMAIN/socket.io/?EIO=4&transport=websocket"
# Expected: 0{"sid":"...","upgrades":[],...}
```

### Rollback test

```bash
# Simulate a bad deploy by breaking the backend image
# ...then rollback
./deploy.sh --rollback
curl -sf https://api.YOUR_DOMAIN/health | jq .status
# Expected: "ok"
```

---

## Known Gaps & Future Work

| Area | Gap | Suggested Fix |
|---|---|---|
| Runtime config | Mobile lobby still uses a hardcoded `HOUSE_EDGE = 0.10` constant | Add `GET /api/v1/config/public` endpoint returning house edge; fetch on app start and store in game store |
| Runtime config | No audit log of who changed config and when | Add `changedBy` and `previousValue` fields to `SystemConfig`, or a separate `ConfigChangeLog` table |
| Fraud logs | No email/Slack notification when a new fraud log is written | Add a webhook call in `updateBotScore` and `checkGpsProximity` |
| Deploy | `deploy.sh` does not support zero-downtime on a single host | Use Docker's `--scale` + a load balancer, or switch to a managed platform |
| nginx | SSL cert is manually managed | Integrate with Certbot / Let's Encrypt for auto-renewal |
