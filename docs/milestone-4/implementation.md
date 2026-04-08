# Milestone 4 — Implementation Details

---

## 1. Device ID / IP Restrictions

**File:** `apps/backend/src/middleware/antifraud.middleware.ts`

### Device blocklist (HTTP middleware)

The check runs inside `antifraudMiddleware`, which is applied globally before any route handler:

```typescript
if (deviceId && config.env === 'production') {
  const bannedDevice = await prisma.user.findFirst({
    where: { device_id: deviceId, is_banned: true },
    select: { id: true },
  });
  if (bannedDevice) {
    logger.warn('Blocked request from banned device', { deviceId });
    return res.status(403).json({ error: 'Dispositivo bloqueado' });
  }
}
```

**Why this order matters:** the check happens *before* authentication. A banned user who creates a new account and registers it with a different phone number would normally pass auth. This gate stops them at the device level before the JWT is ever evaluated.

**Limitation:** the check is skipped in non-production environments to avoid breaking local development with shared device IDs.

### Persistent fingerprint update

`checkMultiAccount()` now writes the player's current IP and device ID back to the `User` row before running the conflict queries:

```typescript
await prisma.user.update({
  where: { id: userId },
  data: {
    ...(ip       ? { ip_address: ip }     : {}),
    ...(deviceId ? { device_id: deviceId } : {}),
  },
}).catch(() => {}); // non-fatal — detection still runs even if the update fails
```

This ensures that multi-account detection always runs against the most recent fingerprints rather than whatever was stored at registration time.

---

## 2. Play Integrity (Android) / DeviceCheck (iOS)

**Backend:** `apps/backend/src/services/integrity.service.ts`
**Mobile:** `apps/mobile/src/services/integrity.ts`

### Backend — `verifyIntegrityToken(token, platform)`

Single entry point used in `socket/index.ts`:

```
verifyIntegrityToken(token, platform)
  ├── config.integrity.mockMode → compare token === MOCK_TOKEN
  ├── platform === 'android'    → verifyPlayIntegrity(token)
  └── platform === 'ios'        → verifyDeviceCheck(token)
```

Returns `IntegrityResult { valid, platform, verdict?, reason? }`.

### Android — Google Play Integrity

```
getGoogleAccessToken(serviceAccount)
  Sign a JWT:
    iss = service_account.client_email
    scope = https://www.googleapis.com/auth/playintegrity
    aud = https://oauth2.googleapis.com/token
    exp = now + 3600
  POST https://oauth2.googleapis.com/token
  ← access_token

POST https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken
  Authorization: Bearer <access_token>
  Body: { integrity_token: <token> }
  ← tokenPayloadExternal
       appIntegrity.appRecognitionVerdict
       deviceIntegrity.deviceRecognitionVerdict[]

Accepted verdicts:
  appRecognitionVerdict   = 'PLAY_RECOGNIZED'
  deviceRecognitionVerdict ∩ { 'MEETS_STRONG_INTEGRITY', 'MEETS_DEVICE_INTEGRITY' } ≠ ∅
```

Rejected conditions:
- `UNRECOGNIZED_VERSION` — app was sideloaded or the signing key doesn't match Play Console
- `UNAPPROVED` — app not in Play Store
- `MEETS_BASIC_INTEGRITY` only — rooted device (passes basic checks but fails device integrity)
- Empty `deviceRecognitionVerdict` — emulator

### iOS — Apple DeviceCheck

```
buildAppleJwt()
  Sign with ES256:
    iss = APPLE_TEAM_ID
    iat = now
    kid = APPLE_KEY_ID
  ← short-lived developer JWT

POST https://api.devicecheck.apple.com/v1/validate_device_token
  Authorization: Bearer <developer JWT>
  Body: { device_token, transaction_id, timestamp }
  200 → valid device
  400 → malformed token
  401 → invalid developer JWT
```

DeviceCheck does not attest app identity (that is App Attest's role). It confirms the token came from a genuine Apple device and is tied to your Apple Developer account. App identity is enforced via App Store distribution signing — a cracked IPA cannot generate a valid DeviceCheck token under your account.

### Mobile — `getIntegrityToken()`

```
__DEV__ || EXPO_PUBLIC_INTEGRITY_MOCK_MODE !== 'false'
  → { platform, token: MOCK_TOKEN }          (no native call)

Platform.OS === 'android'
  → NativeModules.PlayIntegrity?.requestIntegrityToken({ cloudProjectNumber, nonce })
  → { platform: 'android', token }
  → null if module absent

Platform.OS === 'ios'
  → NativeModules.DeviceCheck?.isSupported()
  → NativeModules.DeviceCheck?.generateToken()
  → { platform: 'ios', token }
  → null if module absent or unsupported device
```

#### How to activate native modules in production

**Android:**
```bash
npm install @react-native-google-play-integrity/react-native-google-play-integrity
# or: npx expo install ...
```

Then in `integrity.ts`, replace the `NativeModules.PlayIntegrity` block with:
```typescript
import PlayIntegrity from '@react-native-google-play-integrity/react-native-google-play-integrity';
const { token } = await PlayIntegrity.requestIntegrityToken({ cloudProjectNumber, nonce });
```

**iOS:**

Option A — `react-native-device-check` (community package):
```bash
npm install react-native-device-check
cd ios && pod install
```

Option B — custom Expo module wrapping `DCDevice.current.generateToken()` using the Expo Modules API.

### Queue gate in `socket/index.ts`

```typescript
if (isPaidGame && config.integrity.requireForPaidGames) {
  if (!data.integrityToken || !data.platform) {
    → queue:error 'Verificação do dispositivo necessária'
  }
  const result = await verifyIntegrityToken(data.integrityToken, data.platform);
  if (!result.valid) {
    → queue:error 'Falha na verificação do dispositivo.'
    logger.warn with verdict
  }
}
```

Free games (`betAmount === 0`) skip the gate entirely — useful for onboarding and practice modes.

---

## 3. Anti-Bot Move Analysis

**File:** `apps/backend/src/socket/gameSocket.ts` · `apps/backend/src/middleware/antifraud.middleware.ts`

### Timing collection (gameSocket.ts)

Two Maps track timing state for the duration of each game:

```typescript
// Timestamp of the player's most recent move
const playerLastMoveAt = new Map<string, number>();    // key: `${gameId}:${userId}`

// Elapsed ms between consecutive moves (rolling window of last 30)
const playerMoveIntervals = new Map<string, number[]>(); // key: `${gameId}:${userId}`
```

`recordMoveTime(gameId, userId)` is called inside every move handler (`game:move`, `game:draw`, `game:pass`):

```typescript
function recordMoveTime(gameId: string, userId: string) {
  const key = `${gameId}:${userId}`;
  const lastAt = playerLastMoveAt.get(key);
  const now = Date.now();

  if (lastAt !== undefined) {
    const intervals = playerMoveIntervals.get(key) ?? [];
    intervals.push(now - lastAt);
    playerMoveIntervals.set(key, intervals.length > 30 ? intervals.slice(-30) : intervals);
  }

  playerLastMoveAt.set(key, now);
}
```

Bot moves (from `scheduleBotTurn`) intentionally do not call `recordMoveTime` — only human moves are scored.

`flushMoveTimings(gameId)` collects all entries for the finished game and removes them from both Maps to prevent memory leaks:

```typescript
function flushMoveTimings(gameId: string): Map<string, number[]> {
  const result = new Map<string, number[]>();
  const prefix = `${gameId}:`;
  for (const [key, intervals] of playerMoveIntervals) {
    if (key.startsWith(prefix)) {
      result.set(key.slice(prefix.length), intervals); // userId → intervals
      playerMoveIntervals.delete(key);
      playerLastMoveAt.delete(key);
    }
  }
  return result;
}
```

Called in `finalizeMatch()`:

```typescript
const timings = flushMoveTimings(gameId);
for (const [userId, intervals] of timings) {
  updateBotScore(gameId, userId, intervals).catch(...);
}
```

### Scoring (antifraud.middleware.ts)

```typescript
export async function updateBotScore(gameId, userId, moveIntervalsMs) {
  if (intervals.length < BOT_MIN_SAMPLE_SIZE) return; // too few moves to score

  const fastMoves  = intervals.filter(t => t < BOT_MIN_MOVE_MS);
  const fastRatio  = fastMoves.length / intervals.length;
  const currentScore = (await prisma.user.findUnique(...))?.bot_score ?? 0;

  // EMA: new = 0.7 × old + 0.3 × observation
  const newScore = Math.min(1, currentScore * 0.7 + fastRatio * 0.3);

  await prisma.user.update({ data: { bot_score: newScore } });

  if (newScore >= BOT_SCORE_LOG_THRESHOLD) {
    await prisma.fraudLog.create({
      data: {
        type: 'BOT_PATTERN',
        details: { gameId, fastRatio, avgMoveMs, sampleSize, botScore: newScore },
      },
    });
  }
}
```

#### Why EMA (exponential moving average)?

A single suspicious game should not immediately ban a player — it could be a brief period of rapid clicking. EMA with α = 0.3 gives roughly the following score progression if every game is maximally suspicious (fastRatio = 1.0):

| Game | bot_score |
|---|---|
| 1 | 0.30 |
| 2 | 0.51 |
| 3 | 0.66 → FraudLog written |
| 5 | 0.83 |
| 10 | 0.98 |

A single suspicious game followed by 5 clean games:

| Point | bot_score |
|---|---|
| After suspicious game | 0.30 |
| +1 clean game (0.0) | 0.21 |
| +3 clean games | 0.10 |
| +5 clean games | 0.05 |

This makes the score decay back to safe levels for a player who had one anomalous session.

---

## 4. GPS Proximity Rules

**File:** `apps/backend/src/middleware/antifraud.middleware.ts`

### Brazil bounds check

```typescript
const BRAZIL_LAT_MIN = -33.75; BRAZIL_LAT_MAX = 5.27;
const BRAZIL_LNG_MIN = -73.99; BRAZIL_LNG_MAX = -34.79;

export function validateGpsBounds(coords: GpsCoords): { valid: boolean; reason?: string }
```

The bounding box covers all Brazilian territory with a small margin. It does *not* match the exact border polygon — islands, border regions, and some areas just outside Brazil are accepted or rejected at the box edges. A polygon check would require a GeoJSON dataset and is not necessary given that IP-based geo-blocking is already the primary enforcement mechanism.

Called in `socket/index.ts` before `enqueue()`:

```typescript
if (data.gps) {
  const gpsCheck = validateGpsBounds(data.gps);
  if (!gpsCheck.valid) {
    socket.emit('queue:error', { message: gpsCheck.reason });
    return;
  }
  await updateUserGps(user.id, data.gps); // persist for proximity check
}
```

### Haversine distance

```typescript
export function haversineMetres(lat1, lng1, lat2, lng2): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = (lat2 - lat1) × π / 180;
  const dLng = (lng2 - lng1) × π / 180;
  const a = sin²(dLat/2) + cos(lat1) × cos(lat2) × sin²(dLng/2);
  return R × 2 × atan2(√a, √(1-a));
}
```

Accuracy to within ~1 m for the distances involved (< 1 km). The Vincenty formula is more precise at extreme distances but unnecessary here.

### Proximity check flow

```
startGame(gameId, variant, players, betAmount, io)
  → humanIds = players.filter(!isBot).map(p => p.userId)
  → if humanIds.length >= 2:
       checkGpsProximity(humanIds, gameId)   [async, non-blocking]

checkGpsProximity(playerUserIds, gameId)
  → prisma.user.findMany({ where: { id: IN playerUserIds, gps_lat: NOT NULL } })
  → for each pair (i, j):
       dist = haversineMetres(a.gps_lat, a.gps_lng, b.gps_lat, b.gps_lng)
       if dist ≤ GPS_COLLUSION_DISTANCE_M:
         prisma.fraudLog.create for both users
         logger.warn with dist
```

**Why non-blocking?** The game must start without waiting for the proximity query — any delay would be visible as a lag spike to the player. The check is best-effort: if it throws, the error is logged but the game is unaffected.

**Why flag both users?** It is impossible to know from GPS alone which player is the colluder (if either). Flagging both lets the admin review the match replay and make a determination.

---

## Summary of Changes

| File | Type | What changed |
|---|---|---|
| `src/config/index.ts` | Modified | Added `integrity.*` (12 vars) and `antifraud.*` (6 vars) sections |
| `src/services/integrity.service.ts` | Created | Play Integrity + DeviceCheck verification; mock mode; Google service-account JWT flow; Apple developer JWT flow |
| `src/middleware/antifraud.middleware.ts` | Modified | Device blocklist in HTTP middleware; fingerprint persistence in `checkMultiAccount`; `validateGpsBounds`; `haversineMetres`; `checkGpsProximity`; `updateUserGps`; `updateBotScore` |
| `src/socket/index.ts` | Modified | Integrity gate and GPS validation in `queue:join` handler; imports for new service and middleware functions |
| `src/socket/gameSocket.ts` | Modified | `playerLastMoveAt` / `playerMoveIntervals` maps; `recordMoveTime`; `flushMoveTimings`; `recordMoveTime` calls in all three move handlers; `checkGpsProximity` call in `startGame`; `flushMoveTimings` + `updateBotScore` calls in `finalizeMatch` |
| `apps/mobile/src/services/integrity.ts` | Created | Platform abstraction with mock path, Android stub, iOS stub |
| `apps/mobile/src/screens/ModeSelectScreen.tsx` | Modified | Parallel `getIntegrityToken()` + `Location.getCurrentPositionAsync()` before `queue:join`; `queue:expired` handler |
