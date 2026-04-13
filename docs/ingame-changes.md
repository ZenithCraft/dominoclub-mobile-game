# In-Game Changes (Mobile + Backend)

This document describes the in-game changes implemented in the domino match experience, with emphasis on technical details and the requested points.

## Summary of Changes

- First-move rule is now enforced: the highest double available (6:6 → 0:0) must be played first; if nobody has any doubles, the highest tile by pip sum (e.g., 6:5) must be played first.
- Turn time is set to 15 seconds and turn timeout now triggers an automatic play (auto-play) instead of “pass turn”.
- Board layout now uses the table side areas better by keeping the first tile centered and allowing the chain to grow on both sides.
- Doubles (“carroças”) are rendered sideways/perpendicular to the chain flow on the board.
- Player interaction now supports a drag gesture with animation to play a tile in single-play scenarios.

## Backend: First Tile Rule (Enforced)

### Goal

Ensure the first player is defined by the traditional rule:

- If any double exists: the player holding the highest double starts and must play that double.
- If no doubles exist in any hand: the player holding the highest tile by pip sum starts and must play that tile.

### Implementation

1) Added `requiredFirstTile` to the game state to “lock” which tile is valid for the first move.

- [domino.engine.ts](file:///c:/laragon/www/dominoclub-mobile-game/apps/backend/src/game/domino.engine.ts#L29-L55)

2) Updated the first player computation to also return the mandatory tile:

- `findFirstPlayer(...)` now returns `{ index, tile }` and selects:
  - the best double by value (the double pip), or
  - the best tile by sum `tile[0] + tile[1]`.
- [domino.engine.ts](file:///c:/laragon/www/dominoclub-mobile-game/apps/backend/src/game/domino.engine.ts#L126-L155)

3) Game and round initialization now persists `requiredFirstTile`:

- `initGame(...)` sets `currentPlayerIndex` and `requiredFirstTile`.
- `initNextRound(...)` also sets `requiredFirstTile`.
- [domino.engine.ts](file:///c:/laragon/www/dominoclub-mobile-game/apps/backend/src/game/domino.engine.ts#L88-L198)

4) First-move validation is enforced in two places:

- `canPlayTile(...)` returns `[]` when the tile is not `requiredFirstTile` while `firstPlayMade=false`.
- `applyMove(...)` rejects the first move if `canPlayTile` does not allow it.
- [domino.engine.ts](file:///c:/laragon/www/dominoclub-mobile-game/apps/backend/src/game/domino.engine.ts#L219-L284)

### Technical Notes

- The first-tile comparison accepts inverted orientation (e.g., `6:5` matches `5:6`) so the client may send tiles in either order.
- The first move still carries `side`/`flipped` for compatibility, but the server enforces the correct tile.

## Backend: 15s Turn Timer + Timeout Auto-Play

### Configuration

- The turn timeout was set to 15 seconds via env:
  - [apps/backend/.env](file:///c:/laragon/www/dominoclub-mobile-game/apps/backend/.env#L61-L66)

### Timeout Behavior

Before: timeout executed `applyPass(...)` (auto-pass).

Now: timeout performs “auto-play” using the same bot heuristic, but applied to the human player who ran out of time:

- `getBotMove(...)` chooses a valid move (prioritizes highest pip max and selects the first available play).
- If `play`: server runs `applyMove(...)` using computed `side`/`flipped`.
- If `draw`: draws from boneyard and restarts the timer.
- If `pass`: passes the turn (fallback when there is no move and no boneyard).
- [gameSocket.ts](file:///c:/laragon/www/dominoclub-mobile-game/apps/backend/src/socket/gameSocket.ts#L409-L470)

### Logs / Move Records

- On timeout, the recorded move is now `play`/`draw`/`pass` (there is no longer a separate `timeout` move type in this path).
- The `game:timeout` event is still emitted to the client to indicate the turn was resolved automatically.
- [gameSocket.ts](file:///c:/laragon/www/dominoclub-mobile-game/apps/backend/src/socket/gameSocket.ts#L418-L466)

## Mobile: Turn Timer (UI) Aligned With Backend

- The local countdown remains 15 seconds (`setTurnTimer(15)`), but the client-side “auto-pass” when the counter hits 0 was removed.
- This avoids duplication/race conditions: the backend is the source of truth for timeouts and now resolves them via auto-play.
- [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L1127-L1141)

## Mobile: Board Uses Side Areas (Fixed Center)

### Problem

The previous layout made the board “grow” from the array start, which tends to pull the snake to one side and waste lateral space.

### Implementation

The function that converts `PlacedTile[]` into a linear render sequence was changed:

- Build the “real” sequence (`seq`) using `unshift` for left-end plays and `push` for right-end plays.
- Count how many plays were made on the left (`leftCount`).
- Create a fixed-size padded array (`TOTAL_CELLS = 13 * 7`) with `null` placeholders.
- Use a center index (`CENTER_INDEX = 45`) to position the initial tile (board[0]) at the center of the grid.
- [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L330-L365)

### Rendering With Placeholders

The board row renderer was adapted to accept `Tile | null`:

- `null` becomes an empty `<View />` with the same dimensions as a tile, keeping the grid stable.
- A `null` corner also produces a vertical spacer to preserve snake alignment.
- [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L1768-L1811)

### Known Limits

- The grid is intentionally bounded (13 rows × 7 cells per row). In very long matches, tiles may fall outside the grid (and not render) because they are outside the padding range.
- This trade-off was chosen to keep centering predictable and to consistently use the table side areas.

## Mobile: Doubles Rendered Sideways on the Board

### Goal

Render doubles (“carroças”) with an orientation perpendicular to the chain flow, as in real tables.

### Implementation

- For each tile rendered in a row, compute `isDouble`.
- If it is a double: invert `horizontal` (`horizontal={!isDouble}`) so the double is drawn perpendicular to the row flow.
- For the corner tile, a dedicated rule remains because it is already the vertical connector in the snake:
  - `horizontal={cornerTile[0] === cornerTile[1]}`.
- [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L1774-L1805)

## Mobile: Drag & Drop (Gesture + Animation)

### Goal

Improve “game feel” by replacing part of the rigid flow (select tile + press button) with a drag/drop interaction with visual feedback.

### Implementation

1) Import `PanResponder`:

- [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L1-L7)

2) Create `DraggableTile`:

- Uses `Animated.ValueXY()` for movement.
- `PanResponder` activates when the gesture moves upward (`dy < -10`) and the tile is playable.
- On release:
  - If `dy < -50`, calls `onDragUp()` (interpreted as “dropped into the board area”).
  - Always runs `Animated.spring(...)` to return the tile to its original position, keeping UI consistent.
- [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L379-L435)

3) Integrate into the player hand UI:

- Replace the tile component in the hand list with `DraggableTile`.
- In `onDragUp()`:
  - If there is only 1 valid play (or it is the first move, where the server accepts “left” as the default), the client emits `game:move` directly with `{ side, flipped }`.
  - If more than one option exists, the drag gesture only selects the tile and the user chooses the side using the existing buttons (kept).
- [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L1881-L1911)

### Notes / Current Behavior

- The implemented gesture is “drag up”, with no visual drop zones. This reduces complexity and avoids additional dependencies (gesture/reanimated).
- For tiles with multiple valid sides, the decision still happens via the existing buttons (kept as a UX fallback).

## Checklist (Original Request Coverage)

- Motion/effects: drag with `Animated` + `PanResponder` in the player hand.
- First tile in the middle: board centering via padding and fixed center.
- Enforced first tile: server enforcement via `requiredFirstTile`.
- 15s timer: adjusted (backend `.env` and mobile UI at 15).
- Timeout auto-play: implemented in the backend.
- Use table sides: centered layout and bidirectional snake expansion.
- Doubles facing/rotation: perpendicular orientation applied on the board.
