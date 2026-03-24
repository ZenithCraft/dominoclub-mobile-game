# DominoClub Project Documentation

## Overview
DominoClub is a **mobile** app for online domino games with real money bets (PIX), focused on the Brazilian market. Emphasis on competitive modes (1v1 and 2x2), anti-fraud security, and real-time gameplay. Cross-platform iOS/Android platform with integrated wallet and scheduled tournaments.

## Main Features
- **Authentication**: Mobile/OTP/social login, unique CPF validation (Serpro API), GPS geolocation.
- **Financial**: PIX deposits/withdrawals (min R$20), real/bonus balances with rollover, dynamic QR code.
- **Game Modes**:
  - 1v1 Arena (Sit & Go, variable bets).
  - 1v1 Cup (knockout).
  - Rotating 2x2 Tournaments (anti-collusion partner shuffle).
  - Recreational 2x2 (low stakes, duo cooldown).
- **Rules**: Brazilian dominoes (Carroa, L e L, Cruzada etc.), timeouts, limited chat.
- **Security**: IP/device/GPS blocking, anti-bot (touch patterns), initial bots.
- **Admin**: Financial dashboard, user/tournament management, match replays.

## Non-Functional Requirements
- Real-time (Socket.io/Photon), intelligent reconnection (4G).
- Scalable for peak times (e.g., 8 PM).

## Recommended Tech Stack
| Layer | Technology | Reason |
|-------|------------|--------|
| Mobile Frontend | React Native | Cross-platform, real-time UI; React expertise. Supports GPS/fingerprint. |
| Backend | Node.js + Socket.io + Prisma | Matchmaking/real-time turns; PIX webhook integration. Prisma para PostgreSQL. |
| Database | PostgreSQL | Robust queries para antifraude/geolocalização; row-level security nativa. |
| Payments | PagSeguro/PayBrokers | Native Brazil PIX QR/CPF. |
| Admin/Hosting | Next.js + HostGator/cPanel | Simple web dashboard; easy deploy. |

**Advantages**: Full control PostgreSQL, aligns with skills (React/cPanel), low cost, Brazil-ready.

## Next Steps
1. Game logic prototype (Ollama/Claude).
2. PostgreSQL setup + Prisma schema.
3. PIX sandbox integration.
