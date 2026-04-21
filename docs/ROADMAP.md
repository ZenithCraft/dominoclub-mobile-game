# DominoClub — Roadmap & Client Handoff

Updated: **2026-04-21**

This document: (1) current state of all components; (2) what the client must provide to go to production.

---

## Client Handoff — Credentials & Infrastructure Required

### External accounts

| Service | Variables needed |
|---------|-----------------|
| **Banco Inter (PIX)** | `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, mTLS cert pair (`INTER_CERT_PATH` / `INTER_KEY_PATH`), `INTER_PIX_KEY`, `INTER_WEBHOOK_URL`, `INTER_WEBHOOK_SECRET` |
| **Serpro (CPF)** | `SERPRO_API_KEY`, set `SERPRO_MOCK_MODE=false` |
| **SMS OTP** | Zenvia: `SMS_PROVIDER=zenvia`, `SMS_API_KEY`, `SMS_SENDER` — or — Twilio: `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| **Google Play Integrity** | Google service account credential JSON in `integrity.service.ts` |
| **Apple App Attest** | Production provisioning profile; set `APPLE_APP_ATTEST_ENV=production` |

### Infrastructure

- **Domain + TLS** — Nginx/Traefik/Cloudflare reverse proxy
  - `api.yourdomain.com` → backend `:3001`
  - `admin.yourdomain.com` → admin `:3000`
- **PostgreSQL** (with backups) and **Redis** (required for token blacklist + velocity limits at scale)
- **CDN geo-filtering** — backend already supports `cf-ipcountry` header (Cloudflare); non-BR IPs blocked in production

### App stores

- Apple Developer Account + Google Play Console
- Set `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_SOCKET_URL` in EAS Build

### Decisions the client must make

- **Withdrawal policy**: automatic PIX (current default) vs. manual admin approve/reject
- **LGPD data export**: currently returns JSON inline; production should email via SMTP

---

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | ✅ 100% | All models, migrations, security fields |
| Backend API | ✅ 100% | Auth, wallet, PIX, engine, matchmaking, socket, anti-fraud, tournaments, LGPD |
| Security hardening | ✅ 100% | M4 + M5 — see `SECURITY.md` |
| Mobile App | ✅ ~95% | Gameplay, wallet, tournaments, legal screens — beta-ready |
| Admin Dashboard | ✅ 100% | Stats, users, games, finance, tournaments, fraud, coupons, config |
| PIX Payments | ✅ 100% | Charges, webhook, idempotency, mTLS (prod), HMAC verification |
| CPF / SMS | ⚠️ Partial | SMS OK; CPF coded with mock — real Serpro key needed |
| Tests | ⚠️ ~60% | Backend unit solid; integration + mobile E2E pending |
| DevOps / Deploy | ✅ 100% | Docker + docker-compose + GitHub Actions CI |
| Launch Prep | ✅ ~95% | LGPD + EAS config ready — store accounts pending |

---

## Outstanding Items Before Launch

1. **Serpro CPF** — add real API key, set `SERPRO_MOCK_MODE=false`
2. **Play Integrity nonce** — base64-encode nonce before passing to Google API (see `SECURITY.md` G1)
3. **App Attest Phase 2** — implement assertion flow for subsequent sessions (see `SECURITY.md` G2)
4. **`prisma migrate` baseline** — establish clean migration history before production deploy
5. **Integration tests** — full flow: queue → match → finish → wallet updated; PIX webhook → balance credit
6. **Mobile E2E** — at minimum: login + match + deposit smoke test (Detox or Maestro)
7. **Beta** — TestFlight / internal Play track (requires live developer accounts)
8. **Withdrawal policy** — decide automatic vs. admin-approved

---

## Milestone Summary

### Phase 1 — Backend Core ✅
PIX payment flow, CPF (mock), SMS OTP (multi-provider), game replay system, tournament bracket engine.

### Phase 2 — Mobile Game Client ✅
Full gameplay logic, drag-to-play, turn timer with auto-play, wallet deposit/withdrawal flow, error handling, ModeSelect with tournament entry.

### Phase 3 — Admin Dashboard ✅
Login, stats, users (ban/search), games (replay/logs), financial (approve/reject), tournaments (create/cancel/emergency-cancel/bracket), pair blocks, coupons, fraud logs, game rooms, runtime config.

### Phase 4 — Testing ⚠️ Partial
Backend unit tests (93 passing). Integration tests scaffolded but full game-flow and PIX webhook paths pending. Mobile E2E not yet implemented.

### Phase 5 — Production Hardening ✅
Geofencing, rate limiting, Docker, GitHub Actions CI, Redis adapter, health check, deploy script.

### Phase 6 — Launch Prep ✅
App Store / Play Store EAS config, Terms of Service, Privacy Policy, Responsible Gambling, LGPD consent modal.

### Phase 7 — Security Hardening ✅
Full security audit + remediation. See [`SECURITY.md`](SECURITY.md) for complete details.

**M4:** Device attestation (Play Integrity + App Attest), nonce replay protection, unified trust score (EMA, 9 signals), GPS impossible-movement detection, per-user velocity checks, device binding history, structured audit reason codes.

**M5 Critical:** PIX webhook hard-fail, withdrawal/tournament Serializable transactions, JWT secrets validation everywhere, admin login rate limit (5/15min), access token JTI blacklist on logout.

**M5 High/Medium:** OTP SHA-256 hashing + timingSafeEqual, admin timingSafeEqual login, refresh token invalidation on rotation, LGPD 2-step account deletion, admin trust-restore audit trail, coupon race condition fix.
