# Recording Notes — Changes Implemented (2026-04-11)

This document summarizes everything that changed recently (backend + mobile + admin) and what to mention while recording.

## Gameplay / In-Game (Mobile + Backend)

### Table look (felt texture)
- The table felt is no longer a flat color; it has a felt-like texture overlay + subtle lighting/shadows.
- Recording note: pause the camera over the table so the texture/noise is visible.

### Drag & drop to play tiles
- You can now play by dragging a tile (long-press to pick up, drag onto the table, release to drop).
- The table shows left/right drop zones during a drag/selection to guide the player.
- Recording note: demonstrate picking a tile from the hand, dragging it to the left side zone, then to the right side zone.

### First move rule (Brazilian start rule)
- The first move must follow:
  - Highest double first (6-6, else 5-5, else 4-4, etc).
  - If nobody has any double, then highest non-double starts (6-5, then next).
- This is enforced server-side; the client also guides the player by restricting the first playable option.
- Recording note: show a game start where the first player must play the highest double (or explain the rule on-screen).

### Turn timer: 15 seconds + automatic move on timeout
- Turn timer changed from 30s to 15s.
- If the player does not act in time, the server performs an automatic action:
  - First move: auto-plays the required opening tile.
  - Otherwise: auto-plays a random valid move; if none, it draws; if no draw possible, it passes.
- Recording note: intentionally wait for the timer to reach 0 to show “automatic play”.

### Board layout uses the sides
- The board uses a narrower central lane so the left/right “side spaces” remain visible/usable (like the reference screenshot).
- Recording note: show how the chain stays centered and the side spaces remain visible while the chain grows.

### Doubles (“carroças”) facing up
- Doubles are displayed vertically, visually “standing” compared to horizontal tiles.
- Recording note: point to any double tile on the chain and highlight it.

## Matchmaking / Fairness / Bots

### Exact bet matching (removed bet tolerance)
- Matchmaking no longer uses “bet tolerance”.
- Players are matched only with the exact same betAmount (for both 1v1 and 2v2).
- Recording note: explain that paid games always match identical buy-ins.

### Bots only in free tables
- Bots can only be injected in queues where betAmount is 0 (free).
- Paid games never inject bots.
- Recording note: show a free queue waiting for a bot match; explain paid queues are human-only.

### Anti-collusion: head-to-head win-rate alert + pair blocking
- Mobile History now shows a summary of paid 1v1 head-to-head stats per opponent (wins/games/%).
- The backend avoids re-matching pairs that have a highly skewed win-rate across enough games and logs `COLLUSION_SUSPECTED`.
- Recording note: open History and show the “Confrontos (1v1 pago)” panel; mention the automatic protection.

## Admin: Tournaments

### View registered players + bracket/games
- Admin now has a “View” modal for each tournament to see:
  - Registered players (active vs eliminated)
  - Tournament games (round + status + player names)
- Recording note: open Admin → Tournaments → click “Ver” on a tournament and scroll.

### Emergency cancel + refunds
- Admin cancel is treated as an emergency cancel:
  - Refunds only active (not eliminated) players
  - Cancels active tournament games (WAITING/PLAYING)
  - Marks the tournament CANCELLED
- Recording note: explain this as “panic button” behavior.

## Admin + Wallet: Coupons / Bonus

### New coupon system
- New database tables: `Coupon` and `CouponRedemption`.
- Admin can create/manage coupons:
  - Code, bonus amount, rollover multiplier, max users, optional start/end, active toggle.
- User endpoint to redeem: `POST /wallet/coupon/redeem`.
- Redemption:
  - Credits wallet `bonus_balance`
  - Adds `rollover_remaining` based on the rollover multiplier
  - Prevents redeeming the same coupon twice per user
- Recording note: show Admin → Bônus tab (create a coupon and list it).

### Rollover consumption on wagering
- Each bet now decrements `rollover_remaining` (down to zero) so withdrawals can unlock after wagering.
- Recording note: mention the rule; optional to show Wallet screen rollover decreasing after playing.

## Scoring

### Match target is 6 points
- Target score was changed to 6 (match ends at 6 points).
- Recording note: show the score bar with 6 slots and mention “first to 6”.

