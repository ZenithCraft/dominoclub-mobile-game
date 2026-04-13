## Summary
- Replace the current table felt background (diamond texture image) with a Figma-like felt: solid #2C760F + subtle monochrome noise + soft vignette.
- Add a small spacing between tiles (2px baseline), while guaranteeing the corner/vertical connector always “glues” to the end of the row.
- Fix cases where vertical tiles don’t attach to horizontals by making snake-row tiles consistently horizontal (including doubles) and by applying a deterministic overlap for corner connectors.

## Current State Analysis (Repo Facts)
- The table oval currently renders an `ImageBackground` using `apps/mobile/assets/background.png` for the felt ([GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L1628-L1683)).
- Board layout is rendered as “snake rows”: 6 tiles in a horizontal row + 1 vertical corner tile between rows ([GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx#L1441-L1683)).
- Horizontal spacing is controlled by `SNAKE_GAP` and `scaledGap`, and the corner tile currently uses a small negative `marginTop` to try to attach.
- Row tiles currently use `horizontal={!isDouble}` which makes doubles vertical inside a “horizontal row” and can visually break attachment at row ends.
- `react-native-svg` is already used in the codebase (e.g., [Icons.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/components/Icons.tsx#L1-L80)), so we can render noise without adding binary assets.

## Decisions (From Your Answers)
- Felt texture: **solid color + monochrome noise (Figma-like)**.
- Tile spacing: **2px** (baseline; scaled with boardScale).
- Corners: **always glue the vertical connector** to the row end (controlled overlap), even if horizontal tiles have a gap.

## Proposed Changes (Decision Complete)

### 1) Table felt: solid + noise + vignette (no diamond pattern)
**File:** [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx)
- Replace `ImageBackground` felt usage with a plain `<View style={styles.tableFelt}>` using:
  - `backgroundColor: '#2C760F'` (matches Figma)
  - A noise overlay layer implemented with `react-native-svg` (no new PNG assets):
    - Add a small internal component (e.g. `FeltNoiseOverlay`) that renders ~250–500 1x1 rects/circles across a 100x100 viewBox.
    - Use a deterministic PRNG (seeded) so the noise pattern is stable and doesn’t change every render.
    - Use `fill="rgba(0,0,0,0.08)"` to match the “Monotone noise … #000000 8%” feel.
  - Add a subtle vignette/lighting overlay:
    - Use the already-present `expo-linear-gradient` to darken edges (top/bottom and/or diagonal) with low opacity.
    - Keep overlays `pointerEvents="none"` and clipped by the oval (`overflow: 'hidden'`, `borderRadius: 999`).
- Update styles:
  - Remove/replace `tableFeltImage` and `tableFeltShade` with `tableFeltNoise` + `tableFeltVignette`.
  - Optional (if needed to match Figma shadow): adjust `tableOuter` shadow color/intensity toward `#135F30` and blur-like radius to approximate “Y=12, Blur=60, 60%”.

### 2) Add 2px spacing between tiles (baseline) without breaking connections
**File:** [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx)
- Change the snake gap constants:
  - Set `SNAKE_GAP_BASE = 2` (instead of 0/5).
  - Compute `scaledGap = Math.max(1, Math.round(SNAKE_GAP_BASE * boardScale))`.
  - Keep vertical stacking between rows/corners controlled manually (avoid using container `gap` that could introduce vertical gaps).
- Add a small padding around the whole board inside the felt (so tiles don’t sit too close to the oval edge), e.g. `padding: Math.round(8 * boardScale)`.

### 3) Fix vertical connector attachment (corner glue) + doubles in rows
**File:** [GameScreen.tsx](file:///c:/laragon/www/dominoclub-mobile-game/apps/mobile/src/screens/GameScreen.tsx)
- Make snake-row tiles consistently horizontal (including doubles):
  - In the row render loop, set `horizontal={true}` for all row tiles.
  - Keep the corner tile `horizontal={false}` (vertical connector).
  - Rationale: the current `horizontal={!isDouble}` causes vertical doubles in a row, changing the silhouette and creating “non-attach” situations at row ends.
- Strengthen the corner “glue” behavior with a deterministic overlap:
  - Compute `cornerOverlap = Math.max(1, Math.round(2 * boardScale))`.
  - Apply `marginTop: -cornerOverlap` (or `transform: [{ translateY: -cornerOverlap }]`) to the corner container so it always touches the row above.
  - If needed, also apply a tiny horizontal nudge at corners to ensure the corner aligns with the exact row end (`translateX` based on direction), but only if testing shows a visible gap.
- Keep board tile shadows minimal/disabled on the board if they create a perceived gap; if spacing is present, reintroduce a lighter shadow that doesn’t “float” tiles away from each other.

## Verification Steps
- Typecheck mobile: `npx tsc -p apps/mobile/tsconfig.json --noEmit`.
- Build backend: `npm run build --workspace=apps/backend` (ensures changes don’t break shared types/build).
- Visual verification (mobile web or device):
  - Open a game with the existing mock board (`EXPO_PUBLIC_MOCK_GAME=true`) and confirm:
    - Felt matches: solid #2C760F with subtle noise; no diamond pattern.
    - Horizontal tiles have a small consistent gap.
    - Corner/vertical connector always touches the row end (no gap).
    - Doubles in rows remain horizontal and no longer break attachment.

## Out of Scope
- Changing the underlying game rules/engine beyond the already-updated target score/timer.
- Reworking board logic into a full absolute-positioned layout (will only do if flex-based snake still fails after these adjustments).
