# Milestone 4 — Tests

---

## How to Run

### Existing Jest suite

All 93 tests from Milestone 2 continue to pass unchanged.

```bash
cd apps/backend
npm test
npm run test:coverage
```

### Manual verification checklist

Because Milestone 4 features depend on external APIs (Google, Apple) and native device modules, automated unit testing of the full verification flow requires mocking those APIs. The checklist below describes how to confirm each gate works correctly in a running environment.

---

## Verification Checklist

### 1. Device ID / IP restrictions

| Test | How to trigger | Expected result |
|---|---|---|
| Banned device rejected | Ban a user in the DB (`is_banned = true`), then send any request with that user's `device_id` in `X-Device-ID` header from *any* account | `403 { error: 'Dispositivo bloqueado' }` before auth |
| Non-banned device passes | Send a request with an `X-Device-ID` not associated with any banned user | Request proceeds normally |
| Multi-account (device) flagged | Two users share the same `device_id`; call any auth'd endpoint | `FraudLog` row created with type `MULTI_ACCOUNT_DEVICE` |
| Multi-account (IP) flagged | 4+ users share the same `ip_address` | `FraudLog` row with type `MULTI_ACCOUNT_IP` |
| Fingerprint updated | Call any auth'd endpoint with `X-Device-ID` header | `User.device_id` and `User.ip_address` updated to current values |

**Database query to confirm:**
```sql
SELECT id, device_id, ip_address FROM "User" WHERE id = '<userId>';
SELECT type, details FROM "FraudLog" WHERE "userId" = '<userId>' ORDER BY created_at DESC;
```

---

### 2. Integrity check (paid games)

**Development (mock mode):**

```bash
# Backend default — INTEGRITY_MOCK_MODE is true in non-production
# Mobile sends EXPO_PUBLIC_INTEGRITY_MOCK_TOKEN (default: 'dev-integrity-token')
# Queue join with betAmount > 0 should succeed
```

**Rejecting an invalid mock token:**

```bash
INTEGRITY_MOCK_MODE=true INTEGRITY_MOCK_TOKEN=secret npm run dev
# Then send queue:join with integrityToken: 'wrong-token'
# Expected: queue:error { message: 'Falha na verificação do dispositivo.' }
```

**Testing the gate is enforced:**

```bash
# In the test script, set betAmount=5 and omit integrityToken
BET_AMOUNT=5 npm run test:multiplayer
# Expected: both players receive queue:error 'Verificação do dispositivo necessária'
```

**Production Play Integrity:**

Requires a real Android device with Google Play Services, a published (or internal-track) APK, and the service account credentials configured:
```
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"...","client_email":"...",...}'
ANDROID_PACKAGE_NAME=com.dominoclub.app
INTEGRITY_MOCK_MODE=false
INTEGRITY_REQUIRE_FOR_PAID_GAMES=true
```

The decoded token verdict is logged at `warn` level on failure, `info` level on success (via the standard `logger`).

**Production DeviceCheck (iOS):**

Requires a real iOS device (not simulator), `.p8` key from Apple Developer Console, and:
```
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=YYYYYYYYYY
APPLE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
APPLE_BUNDLE_ID=com.dominoclub.app
```

---

### 3. Anti-bot checks

**Triggering the bot pattern (manual):**

In `scripts/test-multiplayer.ts` the auto-player makes moves as fast as the server accepts them — typically well under 800 ms each. Run the script with `BET_AMOUNT=0` (so no integrity check is required) and inspect the result:

```bash
npm run test:multiplayer
```

After the game ends, query the database:
```sql
SELECT id, bot_score FROM "User" WHERE id = '<p1UserId>';
SELECT type, details FROM "FraudLog"
  WHERE "userId" = '<p1UserId>' AND type = 'BOT_PATTERN'
  ORDER BY created_at DESC;
```

The test script typically produces average move intervals of 10–100 ms, meaning `fastRatio` ≈ 1.0. After one game, `bot_score` should be approximately 0.30. After three or more consecutive runs against the same user ID, it should reach or exceed 0.65 and produce a `FraudLog` entry.

**Confirming the rolling window:**

Moves are tracked in a rolling window of the last 30. Run a long game (Cruzada variant tends to produce more moves) to confirm the window cap:

```bash
VARIANT=CRUZADA npm run test:multiplayer
```

The `details.sampleSize` field in the `FraudLog` entry should never exceed 30.

**Resetting bot_score for a test user:**
```sql
UPDATE "User" SET bot_score = 0 WHERE id = '<userId>';
```

---

### 4. GPS checks

**Brazil bounds — valid coordinates:**

Send `queue:join` with coordinates inside Brazil (e.g. São Paulo):
```json
{ "mode": "ARENA_1V1", "betAmount": 0, "gps": { "lat": -23.55, "lng": -46.63 } }
```
Expected: queue joined normally; `User.gps_lat` and `User.gps_lng` updated.

**Brazil bounds — coordinates outside Brazil:**

```json
{ "gps": { "lat": 48.85, "lng": 2.35 } }   // Paris
{ "gps": { "lat": -34.60, "lng": -58.37 } }  // Buenos Aires (below lat bound)
{ "gps": { "lat": -23.55, "lng": -50.0 } }   // valid — inside Brazil
```
Expected for invalid: `queue:error { message: 'Localização fora do Brasil' }`.

**GPS required for paid games:**

```bash
GPS_REQUIRED_FOR_PAID_GAMES=true npm run dev
# Send queue:join with betAmount=5 and no gps field
# Expected: queue:error { message: 'Localização necessária para jogos pagos' }
```

**Collusion proximity — two players co-located:**

1. Set both test user `gps_lat` / `gps_lng` to the same coordinates in the database:
   ```sql
   UPDATE "User" SET gps_lat = -23.55, gps_lng = -46.63 WHERE id IN ('<id1>', '<id2>');
   ```
2. Run the multiplayer test so they match into the same game.
3. Query FraudLog:
   ```sql
   SELECT * FROM "FraudLog" WHERE type = 'COLLUSION_SUSPECTED' ORDER BY created_at DESC LIMIT 2;
   ```
   Expected: two rows (one per player) with `details.distanceMetres` = 0 and the `gameId`.

**Confirming Haversine accuracy:**

100 m at −23.55, −46.63 corresponds to roughly ±0.0009° latitude. Set user B to `(-23.5509, -46.63)` (≈ 100 m north):
```sql
UPDATE "User" SET gps_lat = -23.5509, gps_lng = -46.63 WHERE id = '<id2>';
```
Expected: no FraudLog (just over the 100 m threshold). Set to `(-23.5508, -46.63)` (≈ 89 m):
Expected: FraudLog written.

---

## Coverage by Module (updated estimates)

```
File                               | Stmts | Branch | Funcs | Lines
-----------------------------------|-------|--------|-------|-------
integrity.service.ts               |  45.0 |  40.0  |  50.0 |  46.0  ← new; external API not mocked
antifraud.middleware.ts            |  62.0 |  55.0  |  70.0 |  64.0  ↑ new functions added
socket/index.ts                    |  71.0 |  42.0  |  65.0 |  75.0  ≈ unchanged (new branches uncovered)
socket/gameSocket.ts               |  53.0 |  30.0  |  65.0 |  56.0  ↑ timing helpers added but not tested
```

---

## Not yet tested (Milestone 5 candidates)

| Gap | Reason | Suggested approach |
|---|---|---|
| `verifyPlayIntegrity` with mocked Google API | External HTTP call | `nock` or `msw` to intercept `googleapis.com` |
| `verifyDeviceCheck` with mocked Apple API | External HTTP call | `nock` intercept for `api.devicecheck.apple.com` |
| `getGoogleAccessToken` JWT generation | Requires valid RS256 private key in test | Generate a self-signed test key pair |
| Device blocklist rejects request | Integration test needed | Supertest with a banned `device_id` in header |
| `validateGpsBounds` edge cases | Not in any current test | Unit test: corners of bounding box, `NaN`, `Infinity` |
| `haversineMetres` accuracy | Not tested | Unit test: known distances (São Paulo ↔ Rio = ~357 km) |
| `checkGpsProximity` writes FraudLog | DB mock needed | Prisma mock spy on `fraudLog.create` |
| `updateBotScore` EMA progression | DB mock needed | Seed `bot_score = 0.5`, call with `fastRatio = 1.0`, assert ≈ 0.65 |
| `recordMoveTime` interval accumulation | In-memory, no DB | Direct unit test of `flushMoveTimings` result |
| `queue:join` without integrity token (paid) | Socket test | Extend `socket.fullflow.integration.test.ts` |
| GPS required gate (`GPS_REQUIRED_FOR_PAID_GAMES=true`) | Config override | Set config in test, send paid queue join without GPS |
| Mobile `getIntegrityToken()` mock path | `__DEV__` path | Jest with `Platform.OS = 'android'` and `__DEV__ = true` |
| Mobile `getIntegrityToken()` native module absent | `NativeModules` undefined | Mock `NativeModules` in Jest setup |
