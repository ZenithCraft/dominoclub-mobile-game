# DominoClub — Security Reference

> Consolidated report covering Milestone 4 (anti-cheat & attestation), Milestone 5 (critical vulnerability remediation), and M6 (security gap remediation).  
> Last updated: **2026-04-23**

---

## Table of Contents

1. [Security Architecture Overview](#1-security-architecture-overview)
2. [M4 — Anti-Cheat & Attestation Layer](#2-m4--anti-cheat--attestation-layer)
3. [M5 — Critical Vulnerability Remediation](#3-m5--critical-vulnerability-remediation)
4. [M5 — Additional Hardening (High/Medium)](#4-m5--additional-hardening-highmedium)
5. [M6 — Security Gap Remediation](#5-m6--security-gap-remediation)
6. [Current Security Posture](#6-current-security-posture)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Known Gaps & Recommendations](#8-known-gaps--recommendations)

---

## 1. Security Architecture Overview

DominoClub is a real-money domino game targeting Brazil exclusively. All trust enforcement is server-side — the mobile client cannot bypass any security control.

**Threat model:**
- Clients are distributed via app stores — modifiable on rooted/jailbroken devices
- Real money (PIX) flows through the wallet; fraud has direct financial impact
- Brazilian law (LGPD, gambling regulation) requires documented abuse prevention

**Defence layers (outermost → innermost):**

```
Internet traffic
  └── Cloudflare (geo-IP block for non-BR, DDoS)
        └── Nginx (TLS termination, reverse proxy)
              └── Express rate limiters (tiered per endpoint)
                    └── Auth middleware (JWT + JTI blacklist)
                          └── Anti-fraud middleware (device/GPS/velocity)
                                └── Trust score gate (blocks LOW-trust paid games)
                                      └── Serializable DB transactions (financial ops)
```

---

## 2. M4 — Anti-Cheat & Attestation Layer

**Completed:** 2026-04-19 | Zero regressions | Zero TypeScript errors

### 2.1 Integrity Token Replay Protection

**Problem:** Play Integrity / App Attest tokens could be captured and replayed indefinitely.

**Solution — server-issued nonces:**

```
Client                      Server
  ├─ GET /game/integrity-nonce ──► issueNonce() → UUID, 120s TTL (Redis or Map)
  │  { nonce, expiresAt } ◄──────
  ├─ PlayIntegrity.requestIntegrityToken({ nonce })
  ├─ queue:join { integrityToken, nonce } ──►
  │                                    consumeNonce(nonce) → atomic delete
  │                                    verifyPlayIntegrity(token, nonce)
  │                                    checks token.requestDetails.nonce === nonce
```

A replayed nonce fails `consumeNonce` (already deleted). A token with a tampered nonce fails the nonce-binding check inside `verifyPlayIntegrity`.

**Files:** `services/nonce.service.ts` (new), `services/integrity.service.ts`, `routes/game.routes.ts`

---

### 2.2 iOS App Attest + DeviceCheck Fallback

**Problem:** Previous iOS support only used DeviceCheck (confirms device identity, not app integrity).

**App Attest** (primary — iOS 14+ with Secure Enclave):
- Validates app signature — a repackaged APK cannot produce a valid token
- Attestation cryptographically bound to the server-issued nonce
- `DeviceBind.attest_key_id` stored for subsequent assertion validation

**DeviceCheck** (fallback — iOS < 14, older devices):
- Confirms real Apple hardware
- Trust score starts at 1.0; user is not disadvantaged

**Android:** Google Play Integrity API — server-side OAuth2 JWT verification with nonce binding.

> **Known gap (A2):** Play Integrity nonce should be base64-encoded per Google's API contract. Currently passing raw UUID string — must fix before production.

> **Deferred (Phase 2):** App Attest assertion flow (subsequent sessions should use `generateAssertion`, not re-attest).

---

### 2.3 Unified Trust Score

**Field:** `User.trust_score Float @default(1.0)` — 1.0 = fully trusted, 0.0 = untrusted.

**Update formula (EMA-style):**
```typescript
const delta = weight < 0
  ? weight * user.trust_score         // negative: proportional to current (approaches 0)
  : weight * (1 - user.trust_score);  // positive: proportional to headroom (approaches 1)
newScore = clamp(trust_score + delta, 0, 1)
```

This means a single suspicious event barely affects a clean user (1.0 → ~0.80), while repeated signals on an abusive account converge toward LOW quickly.

**Signals and weights:**

| Signal | Weight | Trigger |
|--------|--------|---------|
| `integrity_fail` | −0.40 | Attestation rejected by Google/Apple |
| `multi_account_device` | −0.25 | Same device_id on multiple accounts |
| `bot_pattern` | −0.30 | EMA bot score crosses threshold |
| `impossible_movement` | −0.20 | GPS jump at impossible speed |
| `multi_account_ip` | −0.15 | Shared IP with >3 accounts |
| `velocity_abuse` | −0.12 | Rate limit exceeded (per-user) |
| `device_limit_exceeded` | −0.08 | >3 active bound devices |
| `collusion_proximity` | −0.10 | Opponent physically nearby |
| `low_accuracy_gps` | −0.03 | GPS accuracy > 500m or exactly 0 |
| Clean paid game | +0.01 | No fraud signal in completed game |

**Trust levels and enforcement:**

| Level | Score | Effect |
|-------|-------|--------|
| HIGH | ≥ 0.75 | Full access to paid games |
| MEDIUM | 0.45–0.74 | Access with monitoring |
| LOW | < 0.45 | Blocked from paid games (`ACCOUNT_UNDER_REVIEW`) |

Admin can manually restore via `PATCH /admin/users/:id/restore-trust` — logs `ADMIN_ACTION` FraudLog with `adminId`.

**File:** `services/trust.service.ts` (new)

---

### 2.4 GPS Impossible Movement Detection

**Problem:** No check for physically impossible GPS jumps (teleportation / location spoofing).

**Logic:**
1. Fetch previous `gps_lat`, `gps_lng`, `gps_updated_at` from DB
2. Haversine distance ÷ elapsed time = speed km/h
3. Speed > 900 km/h → `IMPOSSIBLE_MOVEMENT` FraudLog + trust penalty + `queue:join` blocked
4. Speed > 250 km/h → soft warning only

**GPS accuracy hardening:**
- `accuracy > 500m` or `accuracy === 0` → `lowConfidence: true`
- Android mock locations report accuracy = 0.0 exactly
- Low-confidence GPS applies `low_accuracy_gps` trust signal but does **not** block
- Collusion proximity check skips low-confidence GPS to avoid false positives

---

### 2.5 Per-User Velocity Checks

**Problem:** IP-based rate limiting can be bypassed by attackers with many IPs; legitimate users behind carrier NAT share IPs.

**Implementation:** `checkUserVelocity(userId, action, windowMs, maxCount)`
- Storage: Redis `INCR` + `PEXPIRE` (atomic). In-memory Map fallback.

**Applied at:**
- `queue:join` socket — max 10 joins per 5 minutes per user
- `POST /wallet/withdraw` — max 3 withdrawals per hour per user

---

### 2.6 Device Binding History

**Problem:** `User.device_id` stored only the most recent device — no history, no limit enforcement.

**New model `DeviceBind`:** tracks every `(userId, device_id)` pair with `first_seen`, `last_seen`, `platform`, `attest_key_id`, `is_active`.

**Enforcement:**
- `checkMultiAccount` upserts a `DeviceBind` on every login
- >3 active devices → `DEVICE_LIMIT_EXCEEDED` FraudLog + trust signal
- Currently flag-only; hard block deferred

---

### 2.7 Structured Audit Reason Codes

`FraudLog.reason_code` — indexed string in format `TYPE:qualifier`:

| Example | Meaning |
|---------|---------|
| `BOT_PATTERN:ema_threshold` | Bot score crossed EMA threshold |
| `IMPOSSIBLE_MOVEMENT:speed_exceeded` | GPS jump too fast |
| `INTEGRITY_FAIL:app:none device:none` | Both attestation methods failed |
| `MULTI_ACCOUNT_DEVICE:shared_device` | Device used by multiple accounts |
| `ADMIN_TRUST_RESTORE` | Manual admin action |
| `VELOCITY_ABUSE` | Per-user rate limit exceeded |

---

## 3. M5 — Critical Vulnerability Remediation

**Completed:** 2026-04-20 | Zero TypeScript errors | All 6 fixes backward-compatible

### Fix 1 — PIX Webhook Hard-Fail When Secret Not Configured

**Severity:** Critical | **File:** `services/pix.service.ts`

**Vulnerability:** `verifyPixWebhookSignature()` returned `true` when `INTER_WEBHOOK_SECRET` was unset — any HTTP call would be accepted as a valid PIX confirmation. An attacker could credit any wallet for free.

**Fix:**
```typescript
if (!config.inter.webhookSecret) {
  if (config.env === 'production') {
    throw new Error('[PIX] INTER_WEBHOOK_SECRET not configured. Refusing to process webhook.');
  }
  logger.warn('[PIX] Webhook signature verification skipped (dev only)');
  return true;
}
// crypto.timingSafeEqual prevents timing-based HMAC oracle
return crypto.timingSafeEqual(
  Buffer.from(expected, 'hex'),
  Buffer.from(signatureHeader || '', 'hex')
);
```

---

### Fix 2 — Withdrawal Double-Spend Race Condition

**Severity:** Critical | **File:** `services/pix.service.ts`

**Vulnerability (TOCTOU):** Balance check was outside the transaction. Two concurrent withdrawal requests could both pass the check (reading the same balance) and both execute the debit → negative balance.

**Fix:** Balance check moved inside the transaction + upgraded to `Serializable` isolation:
```typescript
const transaction = await prisma.$transaction(async (tx) => {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (Number(wallet.real_balance) < amountBRL) throw new Error('Insufficient balance');
  if (Number(wallet.rollover_remaining) > 0) throw new Error('Rollover requirement not met');
  await tx.wallet.update({ data: { real_balance: { decrement: amountBRL } } });
  return tx.transaction.create({ ... });
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

PostgreSQL Serializable transactions detect conflicting concurrent reads and abort one automatically.

---

### Fix 3 — Tournament Entry Race Condition

**Severity:** Critical | **File:** `controllers/game.controller.ts`

**Vulnerability:** Same TOCTOU pattern. Player count check and balance check were outside the transaction — concurrent requests could over-enroll and over-debit.

**Fix:** All checks (status, player count, balance, duplicate enrollment) and all mutations moved into a single `Serializable` transaction. Structured error tagging (`err.status`) returns correct HTTP codes from the catch block.

---

### Fix 4 — JWT Secrets: Warn in All Environments

**Severity:** Critical | **File:** `config/index.ts`

**Vulnerability:** Secret validation only ran in `NODE_ENV=production`. A staging server misconfigured as `development` would silently use weak default secrets, allowing JWT forgery.

**Fix:** Validation now runs everywhere — `throw` in production, `console.warn` in other environments. Visible at startup before any requests are served.

---

### Fix 5 — Admin Login Dedicated Rate Limit

**Severity:** Critical | **File:** `app.ts`

**Vulnerability:** Admin login shared the general admin limiter (200 req / 15 min) — sufficient for dictionary attacks.

**Fix:** Dedicated `adminLoginLimiter` at 5 req / 15 min registered before the general admin limiter:
```typescript
app.use(`${config.apiPrefix}/admin/login`, adminLoginLimiter); // 5/15min
app.use(`${config.apiPrefix}/admin`, adminLimiter);            // 200/15min
```

---

### Fix 6 — Access Token Blacklist on Logout

**Severity:** Critical | **Files:** `services/token-blacklist.service.ts` (new), `utils/jwt.ts`, `middleware/auth.middleware.ts`, `services/auth.service.ts`, `server.ts`

**Vulnerability:** `logout()` only cleared the refresh token. The access token (15-min TTL) remained usable — a token stolen from a shared device stayed valid after the user logged out.

**Fix:**

1. Access tokens now include `jti: uuidv4()` in their payload
2. New service `token-blacklist.service.ts`:
   - Redis `SET blacklist:{jti} 1 EX {ttlSeconds}` (primary, multi-server safe)
   - In-memory `Map<jti, expiresAt>` fallback when Redis unavailable
   - `cleanupBlacklist()` scheduled every 60 seconds
3. On logout: JTI + exp extracted and stored in blacklist
4. On every authenticated request: blacklist checked after signature verification

```typescript
if (payload.jti && await isTokenBlacklisted(payload.jti)) {
  return res.status(401).json({ error: 'Invalid or expired token' });
}
```

---

## 4. M5 — Additional Hardening (High/Medium)

These were identified in the same audit as the 6 critical fixes and remediated in the same session.

| Issue | Fix Applied |
|-------|------------|
| OTP stored as plaintext in-memory | SHA-256 hash stored; `crypto.timingSafeEqual` for comparison |
| Admin password comparison without timingSafeEqual | `timingSafeEqual` for both username and password |
| Refresh token not invalidated on rotation (reuse window) | Old refresh JTI blacklisted after successful rotation |
| `GET /auth/me` excluded from auth rate limiter | Removed the `skip` exemption |
| Account deletion without OTP confirmation (LGPD) | Two-step flow: `DELETE /auth/account` sends OTP; `POST /auth/account/confirm-deletion` verifies and soft-deletes |
| Admin trust restore not attributed to actor | `adminId` from JWT `username` field stored in FraudLog details |
| Coupon `max_players` race condition | `confirmPixDeposit` transaction upgraded to `Serializable` |

---

## 5. M6 — Security Gap Remediation

**Completed:** 2026-04-23 | Zero TypeScript errors | Three gaps closed from the G2/R-series list

---

### 5.1 App Attest Phase 2 — Device Session Tokens

**Problem (G2):** After iOS Phase 1 attestation, subsequent sessions re-attested unconditionally. Apple rate-limits `attestKey()` calls — in high-traffic scenarios this caused silent integrity failures.

**Solution — server-signed device session tokens:**

```
Phase 1 (first session)
  Client → queue:join { attestationType: 'app_attest', keyId, integrityToken, integrityNonce }
         → Server verifies with Apple API (existing flow)
         → Server emits integrity:session_token { token, expiresIn: 172800000 }
         → Client stores token in SecureStore / Keychain

Phase 2 (subsequent sessions, up to 48 h)
  Client → queue:join { attestationType: 'app_attest_session', integrityToken: <JWT> }
         → Server calls verifyDeviceSessionToken(token, userId):
             1. jwt.verify(token, secret)          — signature + expiry
             2. payload.sub === userId             — user binding
             3. DeviceBind.attest_key_id === kid   — revocation check
                && is_active = true
         → Passes: proceed to queue
         → Fails: INTEGRITY_FAIL, trust signal applied
```

**Security properties:**
- Token is bound to a specific `userId` + `keyId` pair — cannot be transferred between accounts
- Token signed with `JWT_ACCESS_SECRET + ':device-session-v1'` — separate from auth tokens
- Revocable: setting `DeviceBind.is_active = false` immediately invalidates the token
- Expires in 48 h (configurable via `DEVICE_SESSION_TTL_MS`)
- Mock-mode compatible: accepts `INTEGRITY_MOCK_TOKEN` in development

**Files:** `services/integrity.service.ts` (`issueDeviceSessionToken`, `verifyDeviceSessionToken`), `socket/index.ts`

---

### 5.2 IP-Level Velocity Limiting

**Problem:** Per-user velocity limits (`checkUserVelocity`) could be bypassed by account-farms — an attacker with 50 accounts behind the same IP could send 500 `queue:join` attempts in 5 minutes, each under the per-user threshold.

**Solution — `checkIPVelocity(ip, action, windowMs, maxCount)`:**

- Keyed by `velocity:ip:{action}:{ip}` — same Redis INCR + PEXPIRE pattern as per-user checks
- Applied in `queue:join` **before** the per-user check — cheaper fast-path for floods
- Ceiling: 20 `queue_join` attempts per IP per 5 minutes (2× the per-user limit to tolerate shared NAT)
- Returns `{ code: 'IP_VELOCITY_EXCEEDED' }` — no trust signal (IP may be shared; penalising trust on an account for an IP flood is a false positive risk)
- In-memory Map fallback when Redis unavailable (not shared across instances)

**Files:** `middleware/antifraud.middleware.ts` (`checkIPVelocity`), `socket/index.ts`, `config/index.ts`

---

### 5.3 Real-Time Bot Detection (Mid-Game)

**Problem:** `updateBotScore` only ran at game end. A bot could complete a full game before being flagged — in a paid match this means they may already have won the prize.

**Solution — `checkRealtimeBotPattern(gameId, userId, io)`:**

Called after every `game:move`, `game:draw`, and `game:pass`. Once ≥ 10 move intervals are recorded:

```typescript
fastRatio = intervals.filter(t => t < botMinMoveMs).length / intervals.length
if (fastRatio >= botRealtimeSuspiciousRatio) → emit game:bot_suspicion
```

**Behaviour:**
- Fires **once per game per player** — a `realtimeBotWarned` Set prevents repeated events on subsequent moves
- Emits `game:bot_suspicion { gameId, fastRatio, message }` to `user:{userId}` (private room) — opponents do not see it
- Logs at WARN level: `[AntifrAud] Real-time bot pattern detected`
- Does **not** apply a trust signal mid-game (post-game `updateBotScore` handles that — double-penalising would compound falsely)
- Set is cleaned up in `flushMoveTimings` when the game ends

**Thresholds (configurable):**

| Config key | Default | Meaning |
|---|---|---|
| `BOT_REALTIME_MIN_SAMPLE_SIZE` | 10 | Minimum moves before check activates |
| `BOT_REALTIME_SUSPICIOUS_RATIO` | 0.6 | Fast-move fraction to trigger warning |
| `BOT_MIN_MOVE_MS` | 800 | Under this ms counts as suspiciously fast |

**Files:** `socket/gameSocket.ts` (`checkRealtimeBotPattern`, `realtimeBotWarned`), `config/index.ts`

---

## 6. Current Security Posture

| Threat | Before M4/M5 | After M4/M5 |
|--------|-------------|-------------|
| PIX webhook forgery | Possible if secret unset | Hard-blocked in production |
| Withdrawal double-spend | TOCTOU vulnerable | Serializable transaction |
| Tournament over-enrollment | TOCTOU vulnerable | Serializable transaction |
| Coupon over-redemption | TOCTOU vulnerable | Serializable transaction |
| Integrity token replay | Replayable indefinitely | Single-use nonce, atomic delete |
| Post-logout token reuse | Valid for 15 min after logout | Immediately blacklisted |
| Stolen access token | Valid until expiry | JTI blacklisted on logout |
| Admin brute-force | 200 attempts / 15 min | 5 attempts / 15 min |
| Timing attack on admin login | String comparison | `crypto.timingSafeEqual` |
| Timing attack on OTP | String comparison | `crypto.timingSafeEqual` |
| OTP plaintext storage | Plaintext in-memory | SHA-256 hash |
| Weak secrets on staging | Silent | Startup warning |
| GPS location spoofing | Bounding-box only | Impossible-movement detection |
| Bot detection | Move-timing EMA only | Unified trust score (9 signals) |
| Multi-account (device) | Single flag | DeviceBind history + limit |
| LGPD account deletion | Single-step, immediate | OTP-confirmed two-step |
| Refresh token reuse | Reusable after rotation | Old token blacklisted |
| App Attest re-attestation rate limit | Re-attested every session | 48 h session token, revocable via DeviceBind |
| IP-level queue flooding | No IP-level gate | 20 attempts / 5 min per IP, blocks before per-user check |
| Bot detected only post-game | Prize already paid if bot won | Real-time warning at move 10+ |

---

## 7. Environment Variables Reference

Variables introduced by the security layer (in addition to those in `DOCUMENTATION.md`):

```env
# Integrity nonce
INTEGRITY_NONCE_TTL_MS=120000

# iOS App Attest
APPLE_APP_ATTEST_ENV=development    # 'production' for App Store builds

# App Attest Phase 2 — device session token (M6)
DEVICE_SESSION_TTL_MS=172800000     # 48 hours

# GPS thresholds
GPS_IMPOSSIBLE_SPEED_KMH=900        # hard block (km/h)
GPS_SUSPICIOUS_SPEED_KMH=250        # soft warning (km/h)
GPS_MAX_ACCURACY_M=500              # low-confidence threshold (metres)

# Device binding
MAX_DEVICES_PER_ACCOUNT=3

# Per-user velocity limits
VELOCITY_QUEUE_JOIN_MAX=10
VELOCITY_QUEUE_JOIN_WINDOW_MS=300000    # 5 minutes
VELOCITY_WITHDRAW_MAX=3
VELOCITY_WITHDRAW_WINDOW_MS=3600000    # 1 hour

# Per-IP velocity limits (M6)
VELOCITY_IP_QUEUE_JOIN_MAX=20           # higher ceiling for shared NAT
VELOCITY_IP_QUEUE_JOIN_WINDOW_MS=300000 # 5 minutes

# Real-time bot detection (M6)
BOT_REALTIME_MIN_SAMPLE_SIZE=10     # moves before check activates
BOT_REALTIME_SUSPICIOUS_RATIO=0.6   # fast-move fraction to trigger warning
```

---

## 8. Known Gaps & Recommendations

### Before production

| # | Gap | Action required |
|---|-----|-----------------|
| G1 | Play Integrity nonce must be base64-encoded | `Buffer.from(nonce).toString('base64')` in `integrity.service.ts` |
| ~~G2~~ | ~~App Attest Phase 2 not implemented~~ | **Closed M6** — device session token approach implemented |
| G3 | Device binding hard-block not enforced | Add `DEVICE_LIMIT_EXCEEDED` gate to `queue:join` (currently flag + trust penalty only) |
| G4 | `prisma db push` used instead of `prisma migrate` | Establish a clean migration baseline before production deploy |

### Recommended improvements

| # | Improvement | Priority |
|---|-------------|----------|
| R1 | GPS data retention — null `gps_*` fields for users inactive > 90 days (LGPD) | High |
| R2 | Trust score recovery rate — +0.01/game means ~25 clean games to recover from −0.25 drop; consider +0.03 for users flagged only once | Medium |
| R3 | IP reputation lookup (AbuseIPDB) — adds signal on VPN/proxy/TOR IPs; implement with fallback | Medium |
| R4 | In-memory velocity fallback warning at startup — when Redis unavailable, per-user velocity limits are not shared across instances | Medium |
| R5 | LGPD GPS retention job — scheduled cleanup of stale coordinates | Medium |
| R6 | PgBouncer connection pooling — configure via `?connection_limit=` in `DATABASE_URL` | Low |
