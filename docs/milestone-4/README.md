# Milestone 4 — Security & Anti-Fraud Layer

> **Status:** Complete
> **Completion date:** April 2026
> **Goal:** Device ID / IP restrictions · Play Integrity (Android) + DeviceCheck (iOS) · Anti-bot move analysis · GPS Brazil enforcement and proximity collusion detection

---

## Table of Contents

- [What was delivered](#what-was-delivered)
- [Implementation details](./implementation.md)
- [Test coverage](./tests.md)

---

## What was delivered

### 1. Device ID / IP Restrictions

The HTTP middleware now enforces identity-level blocking before any authentication takes place.

- **Device blocklist:** Any `X-Device-ID` header that matches the `device_id` of a banned user is rejected with `403 Dispositivo bloqueado` before the request reaches the auth layer. This prevents evading a ban by simply creating a new account on the same phone.
- **Persistent fingerprinting:** `checkMultiAccount()` now also writes the player's current IP address and device ID back onto their `User` record on every post-auth call, so the fingerprint stays fresh and the multi-account query always has up-to-date data.
- **Multi-account detection thresholds** (unchanged, but now with updated fingerprints):
  - Same `device_id` on any other account → `MULTI_ACCOUNT_DEVICE` FraudLog
  - Same `ip_address` on 3+ other accounts → `MULTI_ACCOUNT_IP` FraudLog (allows households / shared Wi-Fi)

### 2. Play Integrity (Android) / DeviceCheck (iOS)

Before a player is admitted to a paid queue (`betAmount > 0`), the backend verifies that the request originates from a legitimate, unmodified app running on a genuine device.

**Android — Google Play Integrity API**

The mobile app calls `PlayIntegrity.requestIntegrityToken()` and passes the token in `queue:join`. The backend:
1. Obtains a short-lived OAuth2 token from Google using a service account private key
2. POSTs to `https://playintegrity.googleapis.com/v1/{package}:decodeIntegrityToken`
3. Checks both `appRecognitionVerdict === 'PLAY_RECOGNIZED'` and that `deviceRecognitionVerdict` contains at least `MEETS_DEVICE_INTEGRITY`

Failures (rooted device, modified APK, emulator, sideloaded app) receive `queue:error { message: 'Falha na verificação do dispositivo.' }` and are not admitted to the queue.

**iOS — Apple DeviceCheck API**

The mobile app calls `DCDevice.current.generateToken()` and passes the token in `queue:join`. The backend:
1. Signs a developer JWT using the Apple `.p8` private key, Team ID, and Key ID
2. POSTs to `https://api.devicecheck.apple.com/v1/validate_device_token`
3. A `200` response confirms the token is from a real Apple device

**Development / Expo Go**

`INTEGRITY_MOCK_MODE=true` (default in non-production) bypasses all API calls. The backend accepts any token equal to `INTEGRITY_MOCK_TOKEN` (default `dev-integrity-token`). The mobile sends this token automatically when `__DEV__` is true.

### 3. Basic Anti-Bot Checks

Every human move (`game:move`, `game:draw`, `game:pass`) is timestamped. At the end of each match, the per-player array of inter-move intervals is analysed and contributes to a persistent `bot_score` on the `User` record.

**Heuristic:** if ≥ `BOT_SUSPICIOUS_RATIO` (default 50%) of a player's moves during a single game were completed faster than `BOT_MIN_MOVE_MS` (default 800 ms), the game's fast-move ratio is considered suspicious.

**Score update:** exponential moving average — `new_score = 0.7 × old + 0.3 × fast_ratio`. This means a single suspicious game raises the score moderately, while repeated suspicious behaviour accumulates towards 1.0.

**Logging threshold:** when `bot_score` reaches or exceeds `BOT_SCORE_LOG_THRESHOLD` (default 0.65), a `BOT_PATTERN` entry is written to `FraudLog` with the game ID, fast-move ratio, average interval in ms, and the new score. The admin dashboard can then review and decide whether to ban.

### 4. GPS Proximity Rules

Two GPS checks are applied at different stages of the queue and game flow.

**Brazil bounds validation (queue:join)**

When the mobile sends `gps: { lat, lng }` in `queue:join`, the server validates the coordinates against Brazil's approximate bounding box:
- Latitude: −33.75 → 5.27
- Longitude: −73.99 → −34.79

Out-of-bounds coordinates receive `queue:error { message: 'Localização fora do Brasil' }` and are not admitted. The validated coordinates are persisted on the `User` record (`gps_lat`, `gps_lng`) for the proximity check.

Setting `GPS_REQUIRED_FOR_PAID_GAMES=true` makes GPS mandatory for any paid game — players without a GPS fix cannot enter the queue.

**Collusion proximity detection (game start)**

After a match is created and both players have joined, the server computes the Haversine distance between every pair of matched players using their stored GPS coordinates. Pairs within `GPS_COLLUSION_DISTANCE_M` (default 100 m) of each other are flagged with a `COLLUSION_SUSPECTED` FraudLog entry for both players, referencing the game ID and the measured distance. The game is not blocked — the flag goes to the admin queue for review.

---

## Mobile Integration

### `services/integrity.ts`

A single function `getIntegrityToken()` returns `{ platform, token }` or `null`:

| Environment | Behaviour |
|---|---|
| `__DEV__` or `EXPO_PUBLIC_INTEGRITY_MOCK_MODE !== 'false'` | Returns `{ platform, token: MOCK_TOKEN }` immediately — no native call |
| Android production | Calls `NativeModules.PlayIntegrity.requestIntegrityToken()` |
| iOS production | Calls `NativeModules.DeviceCheck.generateToken()` |
| Native module absent | Returns `null` — token is omitted from `queue:join` |

The native module stubs are clearly commented with the exact npm package to install for each platform when the app moves to production distribution.

### `ModeSelectScreen` — `queue:join` payload

For paid games, `getIntegrityToken()` and `Location.getCurrentPositionAsync()` are called in parallel before emitting `queue:join`. The gathered data is merged into the payload:

```typescript
socket.emit('queue:join', {
  mode, betAmount,
  platform: 'android',          // or 'ios'
  integrityToken: '...',
  gps: { lat: -23.55, lng: -46.63, accuracy: 12 },
});
```

Both are non-fatal — if the integrity module is unavailable or location permission is denied, the corresponding fields are simply omitted and the backend decides whether to reject based on its own configuration.

### `queue:expired` event

The screen now handles the server-side stale queue cleanup event (added in Milestone 3): `socket.once('queue:expired', ...)` resets the UI and shows a warning toast.

---

## New Environment Variables

| Variable | Default | Description |
|---|---|---|
| `INTEGRITY_MOCK_MODE` | `true` (non-prod) | Accept mock token without hitting Google / Apple APIs |
| `INTEGRITY_MOCK_TOKEN` | `dev-integrity-token` | Token value accepted in mock mode |
| `INTEGRITY_REQUIRE_FOR_PAID_GAMES` | `true` | Reject paid queue joins without a valid integrity token |
| `ANDROID_PACKAGE_NAME` | `com.dominoclub.app` | Package name sent to Play Integrity API |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | — | Full JSON of the Google service account (Play Integrity) |
| `APPLE_BUNDLE_ID` | `com.dominoclub.app` | iOS bundle ID |
| `APPLE_TEAM_ID` | — | Apple Developer Team ID |
| `APPLE_KEY_ID` | — | Key ID of the `.p8` DeviceCheck private key |
| `APPLE_PRIVATE_KEY` | — | PEM content of the `.p8` key (`\n` for newlines) |
| `GPS_REQUIRED_FOR_PAID_GAMES` | `false` | Reject paid queue joins without a GPS fix |
| `GPS_COLLUSION_DISTANCE_M` | `100` | Haversine threshold in metres for collusion flag |
| `BOT_MIN_MOVE_MS` | `800` | Moves faster than this count as suspiciously fast |
| `BOT_SUSPICIOUS_RATIO` | `0.5` | Fraction of fast moves that triggers score update |
| `BOT_MIN_SAMPLE_SIZE` | `5` | Minimum moves needed before scoring is applied |
| `BOT_SCORE_LOG_THRESHOLD` | `0.65` | `bot_score` at which a FraudLog entry is written |

---

## Quick Links

| Document | Content |
|---|---|
| [implementation.md](./implementation.md) | Architecture decisions, data flows, code references |
| [tests.md](./tests.md) | How to verify each check, known gaps, future work |
| [../backend-architecture.md](../backend-architecture.md) | Full REST and Socket.io reference |
