import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, Alert, Animated, Pressable, ActivityIndicator,
  Platform, useWindowDimensions, Easing, PanResponder, Dimensions, AppState,
} from 'react-native';
import { BlurModal } from '../components/BlurModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Socket } from 'socket.io-client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';
import {
  IconTrophy, IconSettings, IconAlert, IconX, IconFrown,
  IconVolumeUp, IconMusic, IconChevronLeft, IconChevronRight,
} from '../components/Icons';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { tileScale as deviceTileScale, isTablet } from '../theme/responsive';
import { ScreenBackground } from '../components/ScreenBackground';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useGameStore, Tile, GameState, PlacedTile, WIN_TYPE_LABEL, WIN_TYPE_POINTS } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { RootStackParamList } from '../navigation';

type PlaySide = 'left' | 'right' | 'top' | 'bottom';
type PlayOption = { side: PlaySide; flipped: boolean };
type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

const { width: GS_RAW_W, height: GS_RAW_H } = Dimensions.get('window');
const GS_SCREEN_W = Math.min(GS_RAW_W, GS_RAW_H);
const isSmallPhone = !isTablet && GS_SCREEN_W < 390;
const isPhone = !isTablet;
const smallPhoneScale = isSmallPhone ? Math.max(0.80, GS_SCREEN_W / 390) : 1;

const SETTINGS_CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const SETTINGS_ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

type NoiseDot = { x: number; y: number; s: number; o: number };
function makeNoise(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}
function FeltNoiseOverlay({ seed, dots, opacity }: { seed: number; dots: number; opacity: number }) {
  const points = useMemo(() => {
    const rnd = makeNoise(seed);
    const out: NoiseDot[] = [];
    for (let i = 0; i < dots; i++) {
      const s = 0.6 + rnd() * 1.2;
      out.push({
        x: rnd() * 100,
        y: rnd() * 100,
        s,
        o: Math.min(1, Math.max(0, opacity * (0.7 + rnd() * 0.8))),
      });
    }
    return out;
  }, [seed, dots, opacity]);

  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      {points.map((p, i) => (
        <Rect key={i} x={p.x} y={p.y} width={p.s} height={p.s} fill="#000" opacity={p.o} />
      ))}
    </Svg>
  );
}

function MiniPips({ value }: { value: number }) {
  const pos = [
    { x: 0.22, y: 0.22 },
    { x: 0.5, y: 0.22 },
    { x: 0.78, y: 0.22 },
    { x: 0.22, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.78, y: 0.5 },
    { x: 0.22, y: 0.78 },
    { x: 0.5, y: 0.78 },
    { x: 0.78, y: 0.78 },
  ];

  const map: Record<number, number[]> = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 3, 6, 2, 5, 8],
  };

  const ids = map[Math.max(0, Math.min(6, value))] ?? [];

  return (
    <View style={styles.miniPips}>
      {ids.map((i) => (
        <View
          key={i}
          style={[
            styles.miniPip,
            {
              left: `${pos[i].x * 100}%`,
              top: `${pos[i].y * 100}%`,
              transform: [{ translateX: -3 }, { translateY: -3 }],
            } as any,
          ]}
        />
      ))}
    </View>
  );
}

function MiniDomino({ left, right, style }: { left: number; right: number; style?: any }) {
  return (
    <View style={[styles.miniDomino, style]}>
      <View style={styles.miniHalf}>
        <MiniPips value={left} />
      </View>
      <View style={styles.miniDivider} />
      <View style={styles.miniHalf}>
        <MiniPips value={right} />
      </View>
    </View>
  );
}

function GradientToggle({
  value,
  onValueChange,
  pressableTestID,
  accessibilityLabel,
  kind,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  pressableTestID?: string;
  accessibilityLabel?: string;
  kind?: 'sound' | 'music';
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      anim.setValue(value ? 1 : 0);
      return;
    }

    const a = Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [anim, value]);

  const thumbBgColor = value ? '#EDF186' : '#FA8A28';
  const iconColor = value ? '#0a1f0a' : '#ffffff';

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 88 - 34 - 2],
  });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={toggleStyles.hit}
      testID={pressableTestID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={8}
    >
      <View style={toggleStyles.track}>
        <Animated.View style={[toggleStyles.thumbWrap, { transform: [{ translateX }] }]}>
          <View style={[toggleStyles.thumb, { backgroundColor: thumbBgColor, alignItems: 'center', justifyContent: 'center' }]}>
            {kind === 'sound' ? (
              <IconVolumeUp size={18} color={iconColor} accessibilityLabel="Som" />
            ) : kind === 'music' ? (
              <IconMusic size={18} color={iconColor} accessibilityLabel="Música" />
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const toggleStyles = StyleSheet.create({
  hit: { width: 92, height: 44, justifyContent: 'center' },
  track: {
    width: 88,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    paddingHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  thumbWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
});

function asNumber(v: any, fallback: number) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlayer(raw: any, index: number) {
  const userId = String(raw?.userId ?? raw?.user_id ?? raw?.user?.id ?? raw?.id ?? `p${index}`);
  const seat = asNumber(raw?.seat, index);
  const team = asNumber(raw?.team, (seat % 2) + 1);
  const hand = Array.isArray(raw?.hand) ? raw.hand : [];
  return {
    userId,
    name: raw?.name ?? raw?.user?.name,
    avatarUrl: raw?.avatarUrl ?? raw?.avatar_url ?? raw?.user?.avatarUrl ?? raw?.user?.avatar_url,
    team,
    seat,
    hand,
    isBot: !!raw?.isBot,
    connected: raw?.connected !== false,
  };
}

function normalizeGameState(raw: any): GameState {
  const players = (Array.isArray(raw?.players) ? raw.players : []).map(normalizePlayer);
  return {
    id: String(raw?.id ?? ''),
    mode: String(raw?.mode ?? ''),
    variant: String(raw?.variant ?? ''),
    players,
    board: (Array.isArray(raw?.board) ? raw.board : []) as PlacedTile[],
    leftOpen: asNumber(raw?.leftOpen, -1),
    rightOpen: asNumber(raw?.rightOpen, -1),
    topOpen: raw?.topOpen,
    bottomOpen: raw?.bottomOpen,
    currentPlayerIndex: asNumber(raw?.currentPlayerIndex, 0),
    turnCount: asNumber(raw?.turnCount, 0),
    status: (raw?.status ?? 'playing') as any,
    turnStartedAt: raw?.turnStartedAt,
    boneyard: Array.isArray(raw?.boneyard) ? raw.boneyard : [],
    firstPlayMade: !!raw?.firstPlayMade,
    requiredFirstTile: Array.isArray(raw?.requiredFirstTile) && raw.requiredFirstTile.length === 2
      ? [Number(raw.requiredFirstTile[0]), Number(raw.requiredFirstTile[1])]
      : undefined,
    matchScores: (raw?.matchScores && typeof raw.matchScores === 'object') ? raw.matchScores : { 1: 0, 2: 0 },
    roundNumber: asNumber(raw?.roundNumber, 1),
    targetScore: asNumber(raw?.targetScore, 6),
    matchWinnerTeam: raw?.matchWinnerTeam,
  };
}

// ─── Game logic (ends + validation) ───────────────────────────────────────────

function computeOpenEndsFromBoard(board: PlacedTile[], variant: string) {
  if (!board || board.length === 0) {
    return { left: undefined, right: undefined, top: undefined, bottom: undefined, first: false };
  }
  let left: number | undefined;
  let right: number | undefined;
  let top: number | undefined;
  let bottom: number | undefined;

  for (let i = 0; i < board.length; i++) {
    const pt = board[i];
    const effective: Tile = pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile;
    if (i === 0) {
      left = effective[0];
      right = effective[1];
      continue;
    }
    if (pt.side === 'left') left = effective[0];
    else if (pt.side === 'right') right = effective[1];
    else if (variant === 'CRUZADA') {
      if (pt.side === 'top') top = effective[0];
      if (pt.side === 'bottom') bottom = effective[1];
    }
  }

  return { left, right, top, bottom, first: true };
}

function canPlayTile(tile: Tile, game: GameState): PlayOption[] {
  if (!game.firstPlayMade && (!game.board || game.board.length === 0)) {
    // Only the required opening tile (highest double) is playable on the first move.
    // If the server hasn't sent requiredFirstTile yet, fall back to allowing any tile.
    if (game.requiredFirstTile) {
      const [ra, rb] = game.requiredFirstTile;
      if (tile[0] !== ra || tile[1] !== rb) return [];
    }
    return [{ side: 'left', flipped: false }];
  }
  let leftOpen = game.leftOpen;
  let rightOpen = game.rightOpen;
  let topOpen = game.topOpen;
  let bottomOpen = game.bottomOpen;
  if ((leftOpen === -1 || rightOpen === -1) && (game.board?.length ?? 0) > 0) {
    const ends = computeOpenEndsFromBoard(game.board, game.variant);
    if (ends.left !== undefined) leftOpen = ends.left as any;
    if (ends.right !== undefined) rightOpen = ends.right as any;
    if (game.variant === 'CRUZADA') {
      if (ends.top !== undefined) topOpen = ends.top;
      if (ends.bottom !== undefined) bottomOpen = ends.bottom;
    }
  }
  const plays: PlayOption[] = [];
  const checkEnd = (open: number, side: PlaySide) => {
    if (open === -1 || open === undefined) return;
    const isLeftLike = side === 'left' || side === 'top';
    if (isLeftLike) {
      if (tile[1] === open) plays.push({ side, flipped: false });
      if (tile[0] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
    } else {
      if (tile[0] === open) plays.push({ side, flipped: false });
      if (tile[1] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
    }
  };
  checkEnd(leftOpen, 'left');
  checkEnd(rightOpen, 'right');
  if (game.variant === 'CRUZADA') {
    if (topOpen !== undefined) checkEnd(topOpen as any, 'top');
    if (bottomOpen !== undefined) checkEnd(bottomOpen as any, 'bottom');
  }
  return plays;
}

function getValidMovesForHand(hand: (Tile | null)[], game: GameState): Map<string, PlayOption[]> {
  const map = new Map<string, PlayOption[]>();
  for (const tile of hand) {
    if (!tile) continue;
    const plays = canPlayTile(tile, game);
    if (plays.length > 0) map.set(`${tile[0]}-${tile[1]}`, plays);
  }
  return map;
}

function tileKey(tile: Tile): string { return `${tile[0]}-${tile[1]}`; }

function buildLinearBoardTiles(
  board: PlacedTile[],
  opts?: { hPerRow?: number; rows?: number }
): (Tile | null)[] {
  if (!board || board.length === 0) return [];
  const seq: Tile[] = [];
  let leftCount = 0;
  for (let i = 0; i < board.length; i++) {
    const pt = board[i];
    const effective: Tile = pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile;
    if (i === 0) {
      seq.push(effective);
      continue;
    }
    if (pt.side === 'left' || pt.side === 'top') {
      seq.unshift(effective);
      leftCount++;
    } else {
      seq.push(effective);
    }
  }

  // We want the center piece (board[0]) to be at a fixed index so it stays centered on screen.
  // A row has (hPerRow horizontal + 1 corner) cells. Use a bounded number of rows to keep layout stable.
  const hPerRow = Math.max(6, Math.min(14, Math.floor(opts?.hPerRow ?? 6)));
  const rowCells = hPerRow + 1;
  const totalRows = Math.max(7, Math.min(21, Math.floor(opts?.rows ?? 13)));
  const centerRow = Math.floor(totalRows / 2);
  const centerIndex = centerRow * rowCells + Math.floor(hPerRow / 2);
  const totalCells = totalRows * rowCells;

  const padded: (Tile | null)[] = new Array(totalCells).fill(null);
  const startIndex = centerIndex - leftCount;

  for (let i = 0; i < seq.length; i++) {
    if (startIndex + i < totalCells && startIndex + i >= 0) {
      padded[startIndex + i] = seq[i];
    }
  }

  return padded;
}

function buildPlacedSequence(board: PlacedTile[]): { seq: Tile[]; leftCount: number } {
  if (!board || board.length === 0) return { seq: [], leftCount: 0 };
  const seq: Tile[] = [];
  let leftCount = 0;
  for (let i = 0; i < board.length; i++) {
    const pt = board[i];
    const effective: Tile = pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile;
    if (i === 0) {
      seq.push(effective);
      continue;
    }
    if (pt.side === 'left' || pt.side === 'top') {
      seq.unshift(effective);
      leftCount++;
    } else {
      seq.push(effective);
    }
  }
  return { seq, leftCount };
}

type SnakePlaced = { tile: Tile; x: number; y: number; horizontal: boolean; isCorner?: boolean };

function buildSnakeLayout(
  seq: (Tile | null)[],
  hPerRow: number,
  base: { short: number; long: number },
  gap: number,
  _overlap: number,
  scale: number
): { placed: SnakePlaced[]; width: number; height: number; leftEndIdx: number; rightEndIdx: number } {
  if (!seq.length) return { placed: [], width: 0, height: 0, leftEndIdx: -1, rightEndIdx: -1 };

  const S = Math.round(base.short * scale);
  const L = Math.round(base.long * scale);
  const GH = Math.round(gap * scale);
  const GV = Math.max(1, Math.round((gap + 4) * scale));

  const placed: SnakePlaced[] = [];
  let cursorY = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  let leftEndIdx = -1;
  let rightEndIdx = -1;

  const rowCells = hPerRow + 1;
  const rows = Math.ceil(seq.length / rowCells);

  // ── Pass 1: pre-compute per-row tile widths so rowBaseX can be resolved ──────
  // Each row has variable tile steps: horizontal tiles use L+GH, doubles use S+GH.
  // rowBaseX[n] offsets row n so that the corner always aligns with the actual
  // last tile in the chain (not a fixed row-boundary), supporting partial rows:
  //   LTR→RTL: corner left of LTR = rightmost RTL tile right
  //             baseX[n+1] = baseX[n] + cum_n[last_n+1] − totalWidth[n+1]
  //   RTL→LTR: corner right of RTL = leftmost LTR tile left
  //             baseX[n+1] = baseX[n] + totalWidth[n] − cum_n[last_n+1]
  const perRow: { tiles: (Tile | null)[]; corner: Tile | null; steps: number[]; cum: number[]; w: number; first: number; last: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const bi = r * rowCells;
    const tiles = Array.from({ length: hPerRow }, (_, i) => seq[bi + i] ?? null) as (Tile | null)[];
    const corner = (seq[bi + hPerRow] ?? null) as Tile | null;
    // Calculate steps: tile width only (gap added separately)
    const steps = tiles.map((t) => {
      if (!t) return 0; // No width for null slots - they don't contribute to layout
      return (t[0] === t[1] ? S : L);
    });
    // cum[i] = START position of tile i (gap before it already included).
    // cum[i+1] = cum[i] + steps[i] + gapBefore_{i+1}
    // Total row width = cum[last] + steps[last].
    const cum: number[] = [0];
    for (let i = 0; i < steps.length; i++) {
      if (i < steps.length - 1) {
        // Gap between tile i and tile i+1, only when both are real tiles
        const gapAfter = (steps[i] > 0 && steps[i + 1] > 0) ? GH : 0;
        cum.push(cum[i] + steps[i] + gapAfter);
      }
    }
    // Ensure cum has hPerRow+1 entries for legacy w = cum[hPerRow] usage
    while (cum.length <= hPerRow) cum.push(cum[cum.length - 1]);
    let pFirst = -1, pLast = -1;
    for (let i = 0; i < tiles.length; i++) { if (tiles[i]) { if (pFirst < 0) pFirst = i; pLast = i; } }
    const totalW = pLast >= 0 ? cum[pLast] + steps[pLast] : 0;
    perRow.push({ tiles, corner, steps, cum, w: totalW, first: pFirst, last: pLast });
  }

  const rowBaseX: number[] = [0];
  for (let r = 0; r < rows - 1; r++) {
    const rtl = r % 2 === 1;
    const rLast = perRow[r].last;
    // cum[rLast] + steps[rLast] = position AFTER the last tile
    let rLastCum = rLast >= 0 ? perRow[r].cum[rLast] + perRow[r].steps[rLast] : perRow[r].w;
    if (!rtl) {
      rowBaseX.push(rowBaseX[r] + rLastCum - perRow[r + 1].w);
    } else {
      rowBaseX.push(rowBaseX[r] + perRow[r].w - rLastCum);
    }
  }

  // ── Pass 2: place tiles ───────────────────────────────────────────────────────
  for (let rowNum = 0; rowNum < rows; rowNum++) {
    const rtl = rowNum % 2 === 1;
    const { tiles: rowTiles, corner: cornerTile, cum: cumSteps, w: totalRowWidth, first, last } = perRow[rowNum];
    const baseX = rowBaseX[rowNum];
    if (first === -1 && !cornerTile) continue;

    // Row height é baseado na peça horizontal (L = altura da peça vertical/double)
    // As peças horizontais têm altura S, então precisamos alinhar pelo topo com offset
    const rowHeight = L;

    for (let i = 0; i < rowTiles.length; i++) {
      const t = rowTiles[i];
      if (!t) continue;
      const isDouble = t[0] === t[1];
      const horizontal = !isDouble;
      const tileW = isDouble ? S : L;
      const tileH = isDouble ? L : S;

      // cum[i] is the START of tile i; for RTL mirror it within totalRowWidth
      const cellXLocal = rtl ? (totalRowWidth - cumSteps[i] - tileW) : cumSteps[i];
      const left = baseX + cellXLocal;
      // Alinhamento vertical: todas as peças alinhadas pelo topo da linha
      const top = cursorY + Math.floor((rowHeight - tileH) / 2);

      const displayTile: Tile = rtl ? [t[1], t[0]] as Tile : t;
      const placedIdx = placed.length;
      placed.push({ tile: displayTile, x: left, y: top, horizontal });
      // Track leftmost (first tile in row 0 for LTR, last tile in row 0 for RTL — but
      // since tiles are placed in visual left-to-right order within each row,
      // the very first placed tile is the left end overall).
      if (leftEndIdx === -1) leftEndIdx = placedIdx;
      // Right end: the last non-corner tile placed
      rightEndIdx = placedIdx;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, left + tileW);
      maxY = Math.max(maxY, top + tileH);
    }

    if (cornerTile) {
      const cornerW = S;
      let cornerLeft: number;
      let cornerTop: number;

      const lastTile = last >= 0 ? rowTiles[last] : null;
      const lastIsDouble = lastTile ? lastTile[0] === lastTile[1] : false;
      const lastTileW = lastIsDouble ? S : L;

      if (rtl) {
        // Left-side corner: aligned with left edge of the last (leftmost) tile in RTL
        // In RTL, the last tile's left edge = totalRowWidth - cum[last] - steps[last]
        const leftCellStart = last >= 0 ? (totalRowWidth - cumSteps[last] - perRow[rowNum].steps[last]) : 0;
        cornerLeft = baseX + leftCellStart;
      } else {
        // Right-side corner: aligned with right edge of the last tile minus cornerW
        // Right edge of last tile = cum[last] + steps[last]
        cornerLeft = baseX + (last >= 0 ? cumSteps[last] + perRow[rowNum].steps[last] : 0) - S;
      }
      // Corner starts just below the last tile's actual bottom edge with gap
      const lastTileBottom = cursorY + Math.floor((L + (lastIsDouble ? L : S)) / 2);
      cornerTop = lastTileBottom + GH;
      // cursorY for the next row: match the visual gap above the corner (GH).
      // The next row's first tile is centered in rowHeight=L:
      //   double → top = cursorY (no centering, height=L)  → gap = cursorY - cornerBottom
      //   horiz  → top = cursorY + (L-S)/2                 → gap = cursorY + (L-S)/2 - cornerBottom
      // We check the next row's first tile to compensate exactly:
      const nextRow = rowNum + 1 < rows ? perRow[rowNum + 1] : null;
      const nextFirstTile = nextRow ? nextRow.tiles.find(t => t !== null) : null;
      const nextIsDouble = nextFirstTile ? nextFirstTile[0] === nextFirstTile[1] : false;
      const centeringOffset = nextIsDouble ? 0 : Math.floor((L - S) / 2);
      cursorY = cornerTop + L + GH - centeringOffset;

      placed.push({ tile: cornerTile, x: cornerLeft, y: cornerTop, horizontal: false, isCorner: true });
      minX = Math.min(minX, cornerLeft);
      maxX = Math.max(maxX, cornerLeft + cornerW);
      maxY = Math.max(maxY, cornerTop + L);
    } else {
      cursorY = cursorY + rowHeight + GV;
    }
  }

  if (!placed.length) return { placed: [], width: 0, height: 0, leftEndIdx: -1, rightEndIdx: -1 };
  const shiftX = -minX;
  for (const p of placed) p.x += shiftX;
  return { placed, width: Math.max(1, maxX - minX), height: maxY, leftEndIdx, rightEndIdx };
}

// ─── Full board layout: horizontal snake + vertical CRUZADA branches ─────────
// Replaces the raw buildLinearBoardTiles + buildSnakeLayout two-call pattern.
// For non-CRUZADA boards (no top/bottom sides) the result is identical to before.

function buildHorizBoardTiles(
  board: PlacedTile[],
  opts?: { hPerRow?: number; rows?: number }
): { padded: (Tile | null)[]; spinnerPaddedIdx: number; rightEndRowParity: 0 | 1; leftEndPaddedIdx: number; leftEndRowParity: 0 | 1 } {
  if (!board || board.length === 0) return { padded: [], spinnerPaddedIdx: 0, rightEndRowParity: 0, leftEndPaddedIdx: 0, leftEndRowParity: 0 };
  const seq: Tile[] = [];
  let leftCount = 0;
  for (let i = 0; i < board.length; i++) {
    const pt = board[i];
    // top/bottom are handled as vertical branches — exclude from the horizontal snake
    if (i > 0 && pt.side !== 'left' && pt.side !== 'right') continue;
    const effective: Tile = pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile;
    if (i === 0) { seq.push(effective); continue; }
    if (pt.side === 'left') { seq.unshift(effective); leftCount++; }
    else { seq.push(effective); }
  }
  const hPerRow   = Math.max(6, Math.min(14, Math.floor(opts?.hPerRow ?? 6)));
  const rowCells  = hPerRow + 1;
  const totalRows = Math.max(7, Math.min(21, Math.floor(opts?.rows ?? 13)));
  const centerRow = Math.floor(totalRows / 2);
  const centerIndex = centerRow * rowCells + Math.floor(hPerRow / 2);
  const totalCells  = totalRows * rowCells;
  const padded: (Tile | null)[] = new Array(totalCells).fill(null);
  const startIndex = centerIndex - leftCount;
  for (let i = 0; i < seq.length; i++) {
    const idx = startIndex + i;
    if (idx < 0 || idx >= totalCells) continue;
    padded[idx] = seq[i];
  }
  // Derive the snake-row parity of the right chain end from its padded index.
  // Math.floor((pIdx / rowCells)) % 2 === 0 means LTR row (right-goes-right),
  // === 1 means RTL row (right-goes-left).  This is accurate regardless of how
  // many tiles occupy each row, unlike length-based heuristics.
  const rightEndPaddedIdx = Math.min(startIndex + seq.length - 1, totalCells - 1);
  const rightEndRowParity = (Math.floor(rightEndPaddedIdx / rowCells) % 2) as 0 | 1;
  const leftEndPaddedIdx  = Math.max(0, startIndex);
  const leftEndRowParity  = (Math.floor(leftEndPaddedIdx / rowCells) % 2) as 0 | 1;
  return { padded, spinnerPaddedIdx: centerIndex, rightEndRowParity, leftEndPaddedIdx, leftEndRowParity };
}

function buildFullBoardLayout(
  board: PlacedTile[],
  hPerRow: number,
  base: { short: number; long: number },
  gap: number,
  scale: number
): { placed: SnakePlaced[]; width: number; height: number; horizCount: number; rightEndRowParity: 0 | 1; leftEndRowParity: 0 | 1; leftEndSnakeIdx: number; snakeLeftEndIdx: number; snakeRightEndIdx: number } {
  if (!board || board.length === 0) return { placed: [], width: 0, height: 0, horizCount: 0, rightEndRowParity: 0, leftEndRowParity: 0, leftEndSnakeIdx: 0, snakeLeftEndIdx: -1, snakeRightEndIdx: -1 };

  // Step 1 — build horizontal snake (left/right chain only)
  const { padded, spinnerPaddedIdx, rightEndRowParity, leftEndRowParity, leftEndPaddedIdx } = buildHorizBoardTiles(board, { hPerRow, rows: 13 });
  const snake = buildSnakeLayout(padded, hPerRow, base, gap, 0, scale);
  if (!snake.placed.length) return { placed: [], width: 0, height: 0, horizCount: 0, rightEndRowParity: 0, leftEndRowParity: 0, leftEndSnakeIdx: 0, snakeLeftEndIdx: -1, snakeRightEndIdx: -1 };

  const horizCount = snake.placed.length;

  // Step 2 — find the spinner and left-end tile indices inside snake.placed
  let spinnerSnakeIdx = 0;
  let leftEndSnakeIdx = 0;
  { let c = 0;
    for (let i = 0; i < padded.length; i++) {
      if (i === leftEndPaddedIdx) leftEndSnakeIdx = c;
      if (i === spinnerPaddedIdx) { spinnerSnakeIdx = c; break; }
      if (padded[i] !== null) c++;
    }
  }
  spinnerSnakeIdx = Math.min(spinnerSnakeIdx, snake.placed.length - 1);
  leftEndSnakeIdx  = Math.min(leftEndSnakeIdx,  snake.placed.length - 1);

  const S = Math.round(base.short * scale);
  const L = Math.round(base.long * scale);
  const G = Math.max(1, Math.round(gap * scale));
  const GV = G;

  // Spinner is a double in CRUZADA → horizontal=false, width=S, height=L
  const spinner   = snake.placed[spinnerSnakeIdx];
  const spinnerCX = spinner.x + S / 2; // horizontal centre of the spinner tile

  const allPlaced: SnakePlaced[] = [...snake.placed];

  // snake.placed is already x-normalised (minX=0) and y starts at 0
  let minX = 0; let maxX = snake.width;
  let minY = 0; let maxY = snake.height;

  // Step 3 — top branch tiles (grow upward from spinner top)
  // Orientation rule (mirrors the horizontal chain in reverse):
  //   non-double in vertical branch → portrait (horizontal=false), width=S, height=L
  //   double in vertical branch     → landscape (horizontal=true),  width=L, height=S
  // Connecting end: effective[1] sits at the BOTTOM of each portrait tile → faces the spinner ✓
  let topEdgeY = spinner.y;
  let topEdgeXLeft = spinnerCX - S / 2;   // Left growing edge
  let topEdgeXRight = spinnerCX + S / 2;  // Right growing edge
  let topGrowLeft = true;
  let prevWasVertical = false;  // Track if previous tile was vertical
  for (let i = 1; i < board.length; i++) {
    const pt = board[i];
    if (pt.side !== 'top') continue;
    const effective: Tile = pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile;
    const isDouble = effective[0] === effective[1];
    const tileW = isDouble ? L : S;
    const tileH = isDouble ? S : L;
    const isVertical = !isDouble;  // Portrait orientation
    // If previous tile was also vertical, force grow to opposite side
    // to prevent overlapping vertical tiles
    if (prevWasVertical && isVertical) {
      topGrowLeft = !topGrowLeft;
    }
    // Alternate left and right for branching pattern
    const tileX = topGrowLeft ? Math.round(topEdgeXLeft - tileW) : Math.round(topEdgeXRight);
    const tileY = topEdgeY - GV - tileH;
    topEdgeY = tileY;
    if (topGrowLeft) topEdgeXLeft = tileX - G;
    else topEdgeXRight = tileX + tileW + G;
    topGrowLeft = !topGrowLeft;
    prevWasVertical = isVertical;
    allPlaced.push({ tile: effective, x: tileX, y: tileY, horizontal: isDouble });
    minX = Math.min(minX, tileX); maxX = Math.max(maxX, tileX + tileW);
    minY = Math.min(minY, tileY);
  }

  // Step 4 — bottom branch tiles (grow downward from spinner bottom)
  // Connecting end: effective[0] sits at the TOP of each portrait tile → faces the spinner ✓
  let bottomEdgeY = spinner.y + L;
  let bottomEdgeXLeft = spinnerCX - S / 2;   // Left growing edge
  let bottomEdgeXRight = spinnerCX + S / 2;  // Right growing edge
  let bottomGrowLeft = true;
  let bottomPrevWasVertical = false;  // Track if previous tile was vertical
  for (let i = 1; i < board.length; i++) {
    const pt = board[i];
    if (pt.side !== 'bottom') continue;
    const effective: Tile = pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile;
    const isDouble = effective[0] === effective[1];
    const tileW = isDouble ? L : S;
    const tileH = isDouble ? S : L;
    const isVertical = !isDouble;  // Portrait orientation
    // If previous tile was also vertical, force grow to opposite side
    // to prevent overlapping vertical tiles
    if (bottomPrevWasVertical && isVertical) {
      bottomGrowLeft = !bottomGrowLeft;
    }
    // Alternate left and right for branching pattern
    const tileX = bottomGrowLeft ? Math.round(bottomEdgeXLeft - tileW) : Math.round(bottomEdgeXRight);
    const tileY = bottomEdgeY + GV;
    bottomEdgeY = tileY + tileH;
    if (bottomGrowLeft) bottomEdgeXLeft = tileX - G;
    else bottomEdgeXRight = tileX + tileW + G;
    bottomGrowLeft = !bottomGrowLeft;
    bottomPrevWasVertical = isVertical;
    allPlaced.push({ tile: effective, x: tileX, y: tileY, horizontal: isDouble });
    minX = Math.min(minX, tileX); maxX = Math.max(maxX, tileX + tileW);
    maxY = Math.max(maxY, tileY + tileH);
  }

  // Step 5 — re-normalise so (minX, minY) = (0, 0)
  // shiftY > 0 when top branch tiles pushed above y=0
  const shiftX = -minX;
  const shiftY = -minY;
  for (const p of allPlaced) { p.x += shiftX; p.y += shiftY; }

  return { placed: allPlaced, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), horizCount, rightEndRowParity, leftEndRowParity, leftEndSnakeIdx, snakeLeftEndIdx: snake.leftEndIdx, snakeRightEndIdx: snake.rightEndIdx };
}

// ─── Domino piece images ──────────────────────────────────────────────────────
// Sorted descending: [6,6] → Frame 14164 … [0,0] → Frame 14191
const DOMINO_IMAGES: Record<string, any> = {
  '6,6': require('../../assets/domino-pieces/6-6.png'),
  '6,5': require('../../assets/domino-pieces/5-6.png'),
  '6,4': require('../../assets/domino-pieces/4-6.png'),
  '6,3': require('../../assets/domino-pieces/3-6.png'),
  '6,2': require('../../assets/domino-pieces/2-6.png'),
  '6,1': require('../../assets/domino-pieces/1-6.png'),
  '6,0': require('../../assets/domino-pieces/6-0.png'),
  '5,5': require('../../assets/domino-pieces/5-5.png'),
  '5,4': require('../../assets/domino-pieces/4-5.png'),
  '5,3': require('../../assets/domino-pieces/3-5.png'),
  '5,2': require('../../assets/domino-pieces/2-5.png'),
  '5,1': require('../../assets/domino-pieces/1-5.png'),
  '5,0': require('../../assets/domino-pieces/5-0.png'),
  '4,4': require('../../assets/domino-pieces/4-4.png'),
  '4,3': require('../../assets/domino-pieces/3-4.png'),
  '4,2': require('../../assets/domino-pieces/2-4.png'),
  '4,1': require('../../assets/domino-pieces/1-4.png'),
  '4,0': require('../../assets/domino-pieces/4-0.png'),
  '3,3': require('../../assets/domino-pieces/3-3.png'),
  '3,2': require('../../assets/domino-pieces/2-3.png'),
  '3,1': require('../../assets/domino-pieces/1-3.png'),
  '3,0': require('../../assets/domino-pieces/3-0.png'),
  '2,2': require('../../assets/domino-pieces/2-2.png'),
  '2,1': require('../../assets/domino-pieces/1-2.png'),
  '2,0': require('../../assets/domino-pieces/2-0.png'),
  '1,1': require('../../assets/domino-pieces/1-1.png'),
  '1,0': require('../../assets/domino-pieces/1-0.png'),
  '0,0': require('../../assets/domino-pieces/0-0.png'),
};

function DominoImagePreloader() {
  return (
    <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Object.values(DOMINO_IMAGES).map((src, i) => (
        <Image key={i} source={src} style={{ width: 1, height: 1 }} fadeDuration={0} />
      ))}
    </View>
  );
}

function TileHandImage({ tile, selected, playable, onPress }: {
  tile: Tile; selected?: boolean; playable?: boolean; onPress?: () => void;
}) {
  return (
    <DominoTile
      tile={tile}
      size="board"
      selected={selected}
      style={!playable ? { opacity: 0.38 } : undefined}
      onPress={onPress}
    />
  );
}

function DraggableTile({ tile, isPlayable, isSelected, onPress, onDragUp, onWebDragStart, onNativeDragStart, onNativeDragMove, onNativeDragEnd }: {
  tile: Tile;
  isPlayable: boolean;
  isSelected: boolean;
  onPress: () => void;
  onDragUp: (moveX?: number) => void;
  onWebDragStart?: (clientX: number, clientY: number) => void;
  onNativeDragStart?: (pageX: number, pageY: number) => void;
  onNativeDragMove?: (pageX: number, pageY: number) => void;
  onNativeDragEnd?: (pageX: number, pageY: number) => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);
  // Refs keep PanResponder callbacks up-to-date without recreating the responder
  const isPlayableRef        = useRef(isPlayable);
  const onDragUpRef          = useRef(onDragUp);
  const onNativeDragStartRef = useRef(onNativeDragStart);
  const onNativeDragMoveRef  = useRef(onNativeDragMove);
  const onNativeDragEndRef   = useRef(onNativeDragEnd);
  isPlayableRef.current        = isPlayable;
  onDragUpRef.current          = onDragUp;
  onNativeDragStartRef.current = onNativeDragStart;
  onNativeDragMoveRef.current  = onNativeDragMove;
  onNativeDragEndRef.current   = onNativeDragEnd;

  const panResponder = useRef(
    PanResponder.create({
      // Native only — on web we use pointer events to escape the ScrollView overflow clip
      onStartShouldSetPanResponder: () => Platform.OS !== 'web' && isPlayableRef.current,
      onMoveShouldSetPanResponder:  (_, gs) => Platform.OS !== 'web' && isPlayableRef.current && Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 6,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, gs) => {
        setIsDragging(true);
        pan.setValue({ x: 0, y: 0 });
        const pageX = gs.moveX || e.nativeEvent.pageX;
        const pageY = gs.moveY || e.nativeEvent.pageY;
        onNativeDragStartRef.current?.(pageX, pageY);
      },
      onPanResponderMove: (_, gs) => {
        // Ghost tile tracks finger at root level — don't move the local tile
        onNativeDragMoveRef.current?.(gs.moveX, gs.moveY);
      },
      onPanResponderRelease: (_, gs) => {
        setIsDragging(false);
        pan.setValue({ x: 0, y: 0 });
        onNativeDragEndRef.current?.(gs.moveX, gs.moveY);
      },
      onPanResponderTerminate: (_, gs) => {
        // Gesture was stolen (e.g. system interrupt) — clean up state
        setIsDragging(false);
        pan.setValue({ x: 0, y: 0 });
        onNativeDragEndRef.current?.(gs.moveX, gs.moveY);
      },
    })
  ).current;

  // Web: pointer capture so move/up fire even outside the element
  const webHandlers = (Platform.OS === 'web' && isPlayable) ? {
    onPointerDown: (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch {}
      onWebDragStart?.(e.clientX, e.clientY);
    },
  } : {};

  // Dim the source tile while dragging on native (ghost takes over visually)
  const opacity = isDragging && Platform.OS !== 'web' ? 0.2 : 1;

  return (
    <Animated.View
      {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      {...(webHandlers as any)}
      style={[
        { transform: pan.getTranslateTransform(), zIndex: isDragging ? 9999 : (isSelected ? 10 : 1), opacity }
      ]}
    >
      <TileHandImage
        tile={tile}
        selected={isSelected}
        playable={isPlayable}
        onPress={onPress}
      />
    </Animated.View>
  );
}

// ─── Tile size presets ────────────────────────────────────────────────────────
type DominoTileSize = 'icon' | 'hand' | 'xxs' | 'xs' | 'sm' | 'md' | 'board';
type DominoTileProps = {
  tile: Tile;
  size?: DominoTileSize;
  horizontal?: boolean;
  tileScale?: number;
  selected?: boolean;
  onPress?: () => void;
  style?: any;
};

const tabletScale = isTablet ? 1.05 : 1;
const T = (n: number) => Math.round(n * deviceTileScale * (isSmallPhone ? 0.66 : isPhone ? 0.70 : tabletScale));
const TILE_DIMS: Record<DominoTileSize, { short: number; long: number; pip: number; corner: number }> = {
  icon:  { short: T(16), long: T(25), pip: T(2),  corner: 2 },
  hand:  { short: T(28), long: T(44), pip: T(4),  corner: T(6) },
  xxs:   { short: T(19), long: T(30), pip: T(4),  corner: T(3) },
  xs:    { short: T(22), long: T(35), pip: T(4),  corner: T(4) },
  sm:    { short: T(34), long: T(54), pip: T(5),  corner: T(5) },
  md:    { short: T(44), long: T(70), pip: T(7),  corner: T(8) },
  board: { short: T(23), long: T(41), pip: T(4),  corner: T(5) }, // Tamanho intermediário para o tabuleiro
};

function DominoTile({ tile, size = 'md', horizontal, tileScale = 1, selected, onPress, style }: DominoTileProps) {
  const base = TILE_DIMS[size] ?? TILE_DIMS.md;
  const S    = Math.round(base.short * tileScale);
  const L    = Math.round(base.long  * tileScale);

  const tileW = horizontal ? L : S;
  const tileH = horizontal ? S : L;

  const hi = Math.max(tile[0], tile[1]);
  const lo = Math.min(tile[0], tile[1]);
  const imgSrc = DOMINO_IMAGES[`${hi},${lo}`];

  // Images named first-second.png: first = top half, second = bottom half.
  // Non-0 pairs: lo is on top (e.g. 1-6.png → 1 top). 0-pairs: hi is on top (e.g. 6-0.png → 6 top).
  const imageTopValue = lo === 0 ? hi : lo;
  const topMatchesTile0 = tile[0] === imageTopValue;
  const rotation = horizontal
    ? (topMatchesTile0 ? '-90deg' : '90deg')
    : (topMatchesTile0 ? '0deg'   : '180deg');

  const content = (
    <View style={[
      { width: tileW, height: tileH, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
      selected && (Platform.OS === 'web'
        ? ({ borderWidth: 2, borderColor: colors.primary, boxShadow: '0 0 10px rgba(28,187,61,0.6)' } as any)
        : { borderWidth: 2, borderColor: colors.primary }),
      style,
    ]}>
      <Image
        source={imgSrc}
        style={{ width: S, height: L, transform: [{ rotate: rotation }] }}
        resizeMode="stretch"
        fadeDuration={0}
      />
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{content}</TouchableOpacity>;
  }
  return content;
}

// ─── Emoji panel ──────────────────────────────────────────────────────────────

const EMOJIS = [
  { id: 'smile',   char: '😄' },
  { id: 'laugh',   char: '😂' },
  { id: 'love',    char: '😍' },
  { id: 'wow',     char: '🤩' },
  { id: 'sad',     char: '😢' },
  { id: 'angry',   char: '😡' },
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const emojiStyles = StyleSheet.create({
  popup: {
    position: 'absolute',
    top: 42,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 90,
    gap: 6,
    padding: 8,
    backgroundColor: 'rgba(8,18,8,0.94)',
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.2)',
    zIndex: 200,
  },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%' },
  btn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 24 },
});

// ─── Score box ────────────────────────────────────────────────────────────────

function ScoreBox({ is4Player, myScore, oppScore, targetScore }: { is4Player: boolean; myScore: number; oppScore: number; targetScore: number }) {
  const leftLabel  = is4Player ? 'Vocês' : 'Você';
  const rightLabel = is4Player ? 'Eles'  : 'Ele';
  const renderPips = (score: number) => {
    const filled = Math.min(score, targetScore);
    return (
      <View style={scoreStyles.pipsRow}>
        {Array.from({ length: targetScore }).map((_, i) => (
          <View key={i} style={[scoreStyles.pip, i < filled && scoreStyles.pipFilled]} />
        ))}
      </View>
    );
  };
  return (
    <View style={scoreStyles.box}>
      <View style={scoreStyles.row}>
        <Text style={scoreStyles.label}>{leftLabel}</Text>
        <Text style={scoreStyles.scoreValue}>{myScore}</Text>
      </View>
      {renderPips(myScore)}
      <View style={[scoreStyles.row, { marginTop: 6 }]}>
        <Text style={scoreStyles.label}>{rightLabel}</Text>
        <Text style={scoreStyles.scoreValue}>{oppScore}</Text>
      </View>
      {renderPips(oppScore)}
    </View>
  );
}
const scoreStyles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.lg,
    paddingVertical: isPhone ? 5 : isTablet ? 14 : 10,
    paddingHorizontal: isPhone ? 10 : isTablet ? 24 : 18,
    gap: isPhone ? 4 : isTablet ? 10 : 8,
    borderWidth: 1,
    borderColor: 'rgba(181,228,85,0.30)',
    minWidth: isPhone ? 110 : isTablet ? 220 : 160,
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' ? ({
      backdropFilter: 'blur(12px)',
      backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05))',
    } as any) : null),
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12, width: '100%' },
  label: { color: '#fff', fontSize: isPhone ? fonts.sizes.xs : isTablet ? fonts.sizes.lg : fonts.sizes.md, fontWeight: '700' },
  scoreValue: { color: '#1CBB3D', fontWeight: '900', fontSize: isPhone ? fonts.sizes.sm : isTablet ? fonts.sizes.xxl : fonts.sizes.lg },
  pipsRow: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-start' },
  pip: { width: isPhone ? 6 : isTablet ? 12 : 8, height: isPhone ? 6 : isTablet ? 12 : 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  pipFilled: { backgroundColor: '#1CBB3D', borderColor: '#1CBB3D' },
});

// ─── Opponent card (top centre) ───────────────────────────────────────────────

const TEAM_COLORS = {
  idle:  (t: number) => t === 1 ? 'rgba(59,130,246,0.45)' : 'rgba(239,68,68,0.45)',
  turn:  (t: number) => t === 1 ? 'rgba(96,165,250,0.95)'  : 'rgba(248,113,113,0.95)',
  glow:  (t: number) => t === 1 ? '#60a5fa' : '#f87171',
  none: 'rgba(0,0,0,0.55)',
};

function teamTurnStyle(team: number) {
  const g = TEAM_COLORS.glow(team);
  return Platform.OS === 'web'
    ? ({ borderColor: TEAM_COLORS.turn(team), boxShadow: `0 0 22px ${g}, 0 0 44px ${g}77` } as any)
    : { borderColor: TEAM_COLORS.turn(team), shadowColor: g, shadowOpacity: 1.0, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 20 };
}

function usePulse(active: boolean) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1.05, duration: 650, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1.0,  duration: 650, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => { loop.stop(); anim.setValue(1); };
    } else {
      anim.setValue(1);
    }
  }, [active]);
  return anim;
}

function OpponentCard({ player, tileCount, isTurn, team = 0, isOpponent = false }: { player: any; tileCount: number; isTurn: boolean; team?: number; matchScore?: number; isOpponent?: boolean }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  const avatarUri: string | undefined = player?.avatarUrl ?? player?.avatar;
  const idleBorder = team ? TEAM_COLORS.idle(team) : TEAM_COLORS.none;
  const scale = usePulse(isTurn);
  const gradientColors: [string, string] = isOpponent
    ? ['rgba(38,8,8,0.97)', 'rgba(100,22,22,0.93)']
    : ['rgba(8,38,14,0.97)', 'rgba(32,100,22,0.93)'];
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[oppStyles.card, { borderColor: idleBorder }, isTurn && teamTurnStyle(team)]}
      >
        <View style={oppStyles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={oppStyles.avatarImg} />
          ) : (
            <Text style={oppStyles.avatarText}>{name[0]?.toUpperCase?.() ?? '?'}</Text>
          )}
        </View>
        <View style={oppStyles.textWrap}>
          <Text style={oppStyles.name} numberOfLines={1}>{name}</Text>
          <Text style={oppStyles.sub}>{tileCount} peças</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
const oppStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: isSmallPhone ? 5 : isPhone ? 7 : 10,
    paddingLeft: isSmallPhone ? 8 : isPhone ? 12 : 16,
    paddingRight: isSmallPhone ? 6 : isPhone ? 10 : 12,
    gap: isSmallPhone ? 4 : isPhone ? 6 : 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.55)',
    minWidth: isSmallPhone ? 105 : isPhone ? 135 : isTablet ? 320 : 170,
    minHeight: isSmallPhone ? 34 : isPhone ? 40 : isTablet ? 80 : 48,
  },
  textWrap: { flex: 1, justifyContent: 'center', paddingLeft: isPhone ? 4 : isTablet ? 10 : 6 },
  name: { color: '#fff', fontWeight: '800', fontSize: isPhone ? 10 : isTablet ? fonts.sizes.md : fonts.sizes.xs },
  sub:  { color: 'rgba(255,255,255,0.7)', fontSize: isPhone ? 10 : isTablet ? fonts.sizes.sm : fonts.sizes.xs },
  avatar: {
    width: isSmallPhone ? 26 : isPhone ? 32 : isTablet ? 56 : 40,
    height: isSmallPhone ? 26 : isPhone ? 32 : isTablet ? 56 : 40,
    borderRadius: isSmallPhone ? 13 : isPhone ? 16 : isTablet ? 28 : 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: isPhone ? 10 : isTablet ? fonts.sizes.sm : fonts.sizes.xs },
});

// ─── Opponent Timer (same style as player timer) ──────────────────────────────

function OpponentTimer({ timer, isTurn }: { timer: number; isTurn: boolean }) {
  if (!isTurn) return null;
  const pulseAnim = usePulse(true);
  const timerStyle = timer > 10 ? styles.timerBadgeGreen
    : timer > 5 ? styles.timerBadgeGold
    : styles.timerBadgeRed;
  return (
    <Animated.View style={[styles.timerBadge, timerStyle, { transform: [{ scale: pulseAnim }] }]}>
      <Text style={styles.timerText}>{timer}</Text>
    </Animated.View>
  );
}

// ─── Side player card (4p left/right) — horizontal pill, same as OpponentCard ─

function SidePlayerCard({ player, tileCount, isTurn, team = 0, isOpponent = false }: { player: any; tileCount: number; isTurn: boolean; team?: number; matchScore?: number; isOpponent?: boolean }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  const avatarUri: string | undefined = player?.avatarUrl ?? player?.avatar;
  const idleBorder = team ? TEAM_COLORS.idle(team) : TEAM_COLORS.none;
  const scale = usePulse(isTurn);
  const gradientColors: [string, string] = isOpponent
    ? ['rgba(38,8,8,0.97)', 'rgba(100,22,22,0.93)']
    : ['rgba(8,38,14,0.97)', 'rgba(32,100,22,0.93)'];
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[sideStyles.card, { borderColor: idleBorder }, isTurn && teamTurnStyle(team)]}
      >
        <View style={sideStyles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={sideStyles.avatarImg} />
          ) : (
            <Text style={sideStyles.avatarText}>{name[0]?.toUpperCase?.() ?? '?'}</Text>
          )}
        </View>
        <Text style={sideStyles.name} numberOfLines={1}>{name}</Text>
        <Text style={sideStyles.sub}>{tileCount} peças</Text>
      </LinearGradient>
    </Animated.View>
  );
}
const sideStyles = StyleSheet.create({
  card: {
    flexDirection: 'column',
    alignItems: 'center',
    borderRadius: radius.xl,
    paddingVertical: isSmallPhone ? 4 : isPhone ? 6 : 10,
    paddingHorizontal: isSmallPhone ? 6 : isPhone ? 8 : 14,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.55)',
    minWidth: isSmallPhone ? 58 : isPhone ? 74 : isTablet ? 160 : 100,
  },
  name: { color: '#fff', fontWeight: '800', fontSize: isPhone ? 10 : isTablet ? fonts.sizes.md : fonts.sizes.xs, textAlign: 'center' },
  sub:  { color: 'rgba(255,255,255,0.7)', fontSize: isPhone ? 10 : isTablet ? fonts.sizes.sm : fonts.sizes.xs, textAlign: 'center' },
  avatar: {
    width: isSmallPhone ? 26 : isPhone ? 32 : isTablet ? 56 : 40,
    height: isSmallPhone ? 26 : isPhone ? 32 : isTablet ? 56 : 40,
    borderRadius: isSmallPhone ? 13 : isPhone ? 16 : isTablet ? 28 : 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: isPhone ? 10 : fonts.sizes.xs },
});

// ─── My player card (right side, below emoji) ────────────────────────────────

function MyPlayerCard({ name, hand, isMyTurn, avatarUri, onSelectEmoji, team = 0 }: {
  name: string; hand: number; isMyTurn: boolean; avatarUri?: string; onSelectEmoji?: (e: string) => void; team?: number; matchScore?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const idleBorder = team ? TEAM_COLORS.idle(team) : TEAM_COLORS.none;
  const scale = usePulse(isMyTurn);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <LinearGradient
        colors={['rgba(32,100,22,0.93)', 'rgba(8,38,14,0.97)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[myCardStyles.card, { borderColor: idleBorder }, isMyTurn && teamTurnStyle(team)]}
      >
        <View style={myCardStyles.nameWrap}>
          <Text style={myCardStyles.name} numberOfLines={1}>{name}</Text>
          <Text style={myCardStyles.sub}>{hand} peças</Text>
        </View>

        <View>
          <TouchableOpacity onPress={() => setOpen(v => !v)} activeOpacity={0.75} accessibilityLabel="Abrir reações">
            <View style={myCardStyles.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={myCardStyles.avatarImg} />
              ) : (
                <Text style={myCardStyles.avatarText}>{name[0]?.toUpperCase?.() ?? '?'}</Text>
              )}
            </View>
          </TouchableOpacity>
          {open && (
            <View style={[emojiStyles.popup, { top: -170, right: 0, position: 'absolute' }]}>
              {chunk(EMOJIS, 2).map((row, ri) => (
                <View key={ri} style={emojiStyles.row}>
                  {row.map((e) => (
                    <TouchableOpacity
                      key={e.id}
                      style={emojiStyles.btn}
                      onPress={() => { onSelectEmoji?.(e.id); setOpen(false); }}
                      accessibilityLabel={`Reação ${e.id}`}
                      activeOpacity={0.65}
                    >
                      <Text style={emojiStyles.emoji}>{e.char}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
const myCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: isSmallPhone ? 5 : isPhone ? 7 : 10,
    paddingLeft: isSmallPhone ? 8 : isPhone ? 12 : 16,
    paddingRight: isSmallPhone ? 6 : isPhone ? 10 : 12,
    gap: isSmallPhone ? 4 : isPhone ? 6 : 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.55)',
    minWidth: isSmallPhone ? 115 : isPhone ? 140 : isTablet ? 330 : 175,
    minHeight: isSmallPhone ? 34 : isPhone ? 40 : isTablet ? 80 : 48,
  },
  nameWrap: { flex: 1, justifyContent: 'center', paddingLeft: isPhone ? 4 : isTablet ? 10 : 6 },
  name: { color: '#fff', fontWeight: '800', fontSize: isPhone ? 10 : isTablet ? fonts.sizes.md : fonts.sizes.xs },
  sub:  { color: 'rgba(255,255,255,0.7)', fontSize: isPhone ? 10 : isTablet ? fonts.sizes.sm : fonts.sizes.xs },
  avatar: {
    width: isSmallPhone ? 26 : isPhone ? 32 : isTablet ? 56 : 40,
    height: isSmallPhone ? 26 : isPhone ? 32 : isTablet ? 56 : 40,
    borderRadius: isSmallPhone ? 13 : isPhone ? 16 : isTablet ? 28 : 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: isPhone ? 10 : fonts.sizes.xs },
});

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({
  result,
  userId,
  playAgainLoading,
  onPlayAgain,
  onExit,
}: {
  result: any;
  userId?: string;
  playAgainLoading: boolean;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  const { width: rcW, height: rcH } = useWindowDimensions();
  const rcIsTablet = Math.min(rcW, rcH) >= 768;
  const winnerId = result?.winnerId ? String(result.winnerId) : '';
  const isWinner = !!winnerId && winnerId === String(userId ?? '');
  const betAmount = typeof result?.betAmount === 'number' ? result.betAmount : Number(result?.betAmount ?? 0);
  const prizePerWinner = typeof result?.prizePerWinner === 'number' ? result.prizePerWinner : Number(result?.prizePerWinner ?? 0);
  const net = winnerId ? (isWinner ? (prizePerWinner - betAmount) : -betAmount) : 0;
  const netAbs = Math.abs(net);
  const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  return (
    <View style={[styles.resultCard, rcIsTablet && { maxWidth: 480 }, isWinner ? styles.resultCardWinner : styles.resultCardLoser]}>
      <ScrollView style={{ flexShrink: 1, width: '100%' }} contentContainerStyle={{ alignItems: 'center', gap: isPhone ? 8 : 12 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.resultIcon, { marginBottom: isPhone ? 0 : spacing.sm }]}>
          {isWinner ? (
            <IconTrophy size={isPhone ? 48 : 64} color={colors.gold} accessibilityLabel="Troféu" />
          ) : (
            <IconFrown size={isPhone ? 48 : 64} color={colors.textSecondary} accessibilityLabel="Rosto triste" />
          )}
        </View>
        <Text style={[styles.resultTitle, isWinner ? styles.resultTitleWinner : styles.resultTitleLoser]}>
          {!winnerId ? 'Fim de jogo' : isWinner ? 'Ganhador' : 'Você perdeu!'}
        </Text>
        {winnerId ? (
          <Text style={[styles.resultPrize, isWinner ? styles.resultPrizeWinner : styles.resultPrizeLoser]}>
            {isWinner ? fmtBRL(prizePerWinner) : fmtBRL(netAbs)}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.resultBtn, playAgainLoading && styles.resultBtnDisabled]}
          onPress={onPlayAgain}
          disabled={playAgainLoading}
        >
          <Text style={styles.resultBtnText} numberOfLines={1}>{playAgainLoading ? 'Procurando...' : 'Jogar novamente'}</Text>
        </TouchableOpacity>
        <Text style={styles.resultOrText}>ou</Text>
        <TouchableOpacity style={styles.resultSecondaryBtn} onPress={onExit} disabled={playAgainLoading}>
          <Text style={styles.resultSecondaryText} numberOfLines={1}>Voltar ao menu</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GameScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { user } = useAuthStore();
  const { currentGame, selectedTile, gameResult, roundBanner, lastQueue, setGame, setSelectedTile, setGameResult, setRoundBanner, clearGame } = useGameStore();

  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const dynIsTablet = Math.min(viewportWidth, viewportHeight) >= 768;
  const safeInsets = useSafeAreaInsets();
  const [feltWidth, setFeltWidth] = useState(0);
  const [tableBgSize, setTableBgSize] = useState({ width: 0, height: 0 });
  const tableBgRef = useRef<View>(null);
  const boardScreenCenterXRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerWidth / 2 : Dimensions.get('window').width / 2
  );

  // ── Web drag-and-drop ghost ─────────────────────────────────────────────────
  const [webDrag, setWebDrag] = useState<{ tile: Tile; x: number; y: number; startY: number } | null>(null);
  const webDragDropRef  = useRef<((dropX: number) => void) | null>(null);

  // ── Native (mobile) drag-and-drop ghost ────────────────────────────────────
  const nativeDragPos  = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [nativeDrag, setNativeDrag] = useState<{ tile: Tile; startY: number } | null>(null);
  const nativeDragDropRef = useRef<((dropX: number) => void) | null>(null);

  const handSectionTopRef = useRef<number>(Dimensions.get('window').height * 0.72);
  const handScrollRef = useRef<ScrollView>(null);

  // ── Opponent play animation ─────────────────────────────────────────────────
  type OpponentPlayAnim = { tile: Tile; horizontal: boolean; playerId: string };
  const [opponentPlayAnim, setOpponentPlayAnim] = useState<OpponentPlayAnim | null>(null);
  const oppPlayTranslate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const oppPlayOpacity   = useRef(new Animated.Value(0)).current;
  const oppPlayScale     = useRef(new Animated.Value(0.6)).current;
  // Always-current seat index — avoids stale closure in triggerOpponentPlayAnim
  const mySeatRef = useRef(0);
  const myEffectiveUserIdRef = useRef('');
  // View refs for opponent cards — used with measureInWindow for screen-absolute positions
  const oppCardTopViewRef   = useRef<View>(null);
  const oppCardLeftViewRef  = useRef<View>(null);
  const oppCardRightViewRef = useRef<View>(null);
  // Cached screen-absolute centres of each opponent card
  const oppCardTopRef   = useRef<{ x: number; y: number } | null>(null);
  const oppCardLeftRef  = useRef<{ x: number; y: number } | null>(null);
  const oppCardRightRef = useRef<{ x: number; y: number } | null>(null);
  // Ref for my own card position (for when I play a tile)
  const myCardViewRef   = useRef<View>(null);
  const myCardRef       = useRef<{ x: number; y: number } | null>(null);
  const tableCenterRef  = useRef<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : Dimensions.get('window').width / 2,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.38 : Dimensions.get('window').height * 0.38,
  });

  const startWebDrag = useCallback((tile: Tile, clientX: number, clientY: number, onDrop: (dropX: number) => void) => {
    if (Platform.OS !== 'web') return;
    webDragDropRef.current = onDrop;
    setWebDrag({ tile, x: clientX, y: clientY, startY: clientY });

    const handleMove = (e: PointerEvent) => {
      setWebDrag(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    };
    const handleUp = (e: PointerEvent) => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      const drop = webDragDropRef.current;
      webDragDropRef.current = null;
      setWebDrag(null);
      // Only trigger play if released above the hand section (i.e. over the table)
      if (drop && e.clientY < handSectionTopRef.current) {
        drop(e.clientX);
      }
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, []);

  const startNativeDrag = useCallback((tile: Tile, pageX: number, pageY: number, onDrop: (dropX: number) => void) => {
    if (Platform.OS === 'web') return;
    // Synchronously disable scroll before any move event fires — prevents ScrollView
    // from stealing the gesture when the first move is sideways (state update is async)
    handScrollRef.current?.setNativeProps({ scrollEnabled: false });
    nativeDragDropRef.current = onDrop;
    nativeDragPos.setValue({ x: pageX, y: pageY });
    setNativeDrag({ tile, startY: pageY });
  }, [nativeDragPos]);

  const updateNativeDragPos = useCallback((pageX: number, pageY: number) => {
    nativeDragPos.setValue({ x: pageX, y: pageY });
  }, [nativeDragPos]);

  const endNativeDrag = useCallback((pageX: number, pageY: number) => {
    // Re-enable scroll synchronously before clearing state
    handScrollRef.current?.setNativeProps({ scrollEnabled: true });
    const drop = nativeDragDropRef.current;
    nativeDragDropRef.current = null;
    setNativeDrag(null);
    if (drop && pageY < handSectionTopRef.current) {
      drop(pageX);
    }
  }, []);

  useEffect(() => {
    clearGame();
  }, []);

  const [turnTimer, setTurnTimer]       = useState(15);
  const [opponentTimer, setOpponentTimer] = useState(15);
  const turnEndTimeRef = useRef<number | null>(null);
  const opponentEndTimeRef = useRef<number | null>(null);
  const [resultModal, setResultModal]   = useState(false);
  const [playAgainSearching, setPlayAgainSearching] = useState(false);
  const [gameError, setGameError]       = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [emojiByUser, setEmojiByUser] = useState<Record<string, { char: string; nonce: number }>>({});
  const [drawByUser, setDrawByUser] = useState<Record<string, { nonce: number }>>({});
  const [loadingTimer, setLoadingTimer] = useState(20);

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef       = useRef<Socket | null>(null);
  const errorFadeAnim   = useRef(new Animated.Value(0)).current;
  const joinPulseAnim   = useRef(new Animated.Value(0)).current;
  const timerPulseAnim  = useRef(new Animated.Value(1)).current;
  const prevStateRef    = useRef<GameState | null>(null);
  const lastSeqRef      = useRef<number>(-1);
  // Tracks the highest round number ever seen — never reset, not even on retry/reconnect.
  // Used to hard-drop states from past rounds regardless of seq or prevStateRef state.
  const currentRoundRef = useRef<number>(0);
  const emojiAnimRef   = useRef<Map<string, Animated.Value>>(new Map());
  const bounceAnimRef  = useRef<Map<string, Animated.Value>>(new Map());
  const sideAnimRef    = useRef<Map<string, Animated.Value>>(new Map());
  const drawAnimRef    = useRef<Map<string, Animated.Value>>(new Map());
  const drawPulseAnim  = useRef(new Animated.Value(0)).current;


  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;
    if (currentGame) {
      joinPulseAnim.stopAnimation();
      joinPulseAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(joinPulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(joinPulseAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [currentGame, joinPulseAnim]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const is2v2 = currentGame?.mode?.includes('2V2') ?? false;
  const boardTileSize: DominoTileSize = 'board';
  const boardTilePreset = TILE_DIMS[boardTileSize];
  const tableHeight = isTablet
    ? Math.round(Math.min(viewportWidth * 0.72, 1366) / 1.45)
    : Math.round(Math.min(viewportWidth * 0.88, 940) / 2.05);
  const myUserId = String((user as any)?.id ?? (user as any)?.userId ?? (user as any)?._id ?? '');
  const myPlayerIndex = (() => {
    const players = currentGame?.players ?? [];
    if (!players.length) return -1;
    const byId = myUserId ? players.findIndex((p) => p.userId === myUserId) : -1;
    if (byId >= 0) return byId;
    const bySeat0 = players.findIndex((p) => p.seat === 0);
    return bySeat0 >= 0 ? bySeat0 : 0;
  })();
  const myEffectiveUserId = currentGame?.players[myPlayerIndex]?.userId ?? myUserId;
  const mySeat = myPlayerIndex >= 0 ? (currentGame?.players[myPlayerIndex]?.seat ?? 0) : 0;
  mySeatRef.current = mySeat;
  myEffectiveUserIdRef.current = myEffectiveUserId;
  const isMyTurn      = currentGame?.currentPlayerIndex === myPlayerIndex && currentGame?.status === 'playing';
  const turnUserId    = currentGame?.players[currentGame?.currentPlayerIndex ?? 0]?.userId ?? '';
  const myHand        = (currentGame?.players[myPlayerIndex]?.hand || []) as (Tile | null)[];

  const validMovesMap: Map<string, PlayOption[]> = currentGame && isMyTurn
    ? getValidMovesForHand(myHand, currentGame)
    : new Map();

  const hasValidMoves = validMovesMap.size > 0;
  const hasBoneyard   = (currentGame?.boneyard.length ?? 0) > 0;

  const validPlaysForSelected: PlayOption[] = selectedTile
    ? (validMovesMap.get(tileKey(selectedTile.tile)) ?? [])
    : [];
  const uniqueSides = [...new Set(validPlaysForSelected.map((p) => p.side))];

  const is4Player = (currentGame?.mode?.includes('2V2') ?? false) || (currentGame?.players.length ?? 0) >= 4;

  // Opponents (all players that are not me)
  const opponents = currentGame?.players.filter((p) => p.userId !== myEffectiveUserId) ?? [];

  // For 2-player: one opponent at top centre
  // For 4-player: top=partner, left/right=opponents
  const topOpponent   = is4Player
    ? currentGame?.players.find((p) => p.seat === (mySeat + 2) % 4)
    : opponents[0];
  const leftOpponent  = is4Player
    ? currentGame?.players.find((p) => p.seat === (mySeat + 3) % 4)
    : null;
  const rightOpponent = is4Player
    ? currentGame?.players.find((p) => p.seat === (mySeat + 1) % 4)
    : null;

  // Match scores (points, not tile counts)
  const myTeam       = currentGame?.players[myPlayerIndex]?.team ?? ((mySeat % 2) + 1);
  const oppTeam      = myTeam === 1 ? 2 : 1;
  const myMatchScore  = currentGame?.matchScores?.[myTeam]  ?? 0;
  const oppMatchScore = currentGame?.matchScores?.[oppTeam] ?? 0;
  const targetScore   = currentGame?.targetScore ?? 6;

  // ── Timer ──────────────────────────────────────────────────────────────────
  // Timestamp-based timer that works even when browser tab is inactive
  const resetTurnTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    turnEndTimeRef.current = Date.now() + 15000;
    opponentEndTimeRef.current = Date.now() + 15000;
    setTurnTimer(15);
    setOpponentTimer(15);
    timerRef.current = setInterval(() => {
      if (turnEndTimeRef.current) {
        const remaining = Math.ceil((turnEndTimeRef.current - Date.now()) / 1000);
        const newValue = Math.max(0, remaining);
        setTurnTimer(newValue);
        if (newValue <= 0) {
          clearInterval(timerRef.current!);
        }
      }
    }, 100);
  }, []);

  // Opponent timer countdown - only count when it's opponent's turn
  useEffect(() => {
    if (isMyTurn || !currentGame || currentGame.status !== 'playing') {
      setOpponentTimer(15);
      opponentEndTimeRef.current = null;
      return;
    }
    opponentEndTimeRef.current = Date.now() + opponentTimer * 1000;
    const interval = setInterval(() => {
      if (opponentEndTimeRef.current) {
        const remaining = Math.ceil((opponentEndTimeRef.current - Date.now()) / 1000);
        const newValue = Math.max(0, remaining);
        setOpponentTimer(newValue);
        if (newValue <= 0) {
          clearInterval(interval);
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isMyTurn, currentGame?.status, currentGame?.currentPlayerIndex]);

  // Auto-pass when timer reaches 0 (no auto-play)
  const autoPassExecutedRef = useRef(false);
  useEffect(() => {
    if (turnTimer !== 0 || !isMyTurn || !currentGame) {
      autoPassExecutedRef.current = false;
      return;
    }
    // Prevent multiple executions
    if (autoPassExecutedRef.current) return;
    autoPassExecutedRef.current = true;

    // Auto-pass when time runs out
    const timeout = setTimeout(() => {
      handlePass();
    }, 100);

    return () => clearTimeout(timeout);
  }, [turnTimer, isMyTurn]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Heartbeat animation when ≤ 10 seconds remain
  useEffect(() => {
    if (!isMyTurn || turnTimer > 10) {
      timerPulseAnim.stopAnimation();
      timerPulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(timerPulseAnim, { toValue: 1.18, duration: 250, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(timerPulseAnim, { toValue: 0.97, duration: 200, useNativeDriver: true }),
        Animated.timing(timerPulseAnim, { toValue: 1.1,  duration: 180, useNativeDriver: true }),
        Animated.timing(timerPulseAnim, { toValue: 1,    duration: 870, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => { anim.stop(); timerPulseAnim.setValue(1); };
  }, [turnTimer <= 10, isMyTurn]);

  // ── Error toast ────────────────────────────────────────────────────────────
  const showError = useCallback((msg: string) => {
    setGameError(msg);
    errorFadeAnim.setValue(1);
    Animated.sequence([
      Animated.delay(2500),
      Animated.timing(errorFadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setGameError(null));
  }, [errorFadeAnim]);

  const ensureAnim = useCallback((refMap: { current: Map<string, Animated.Value> }, userId: string) => {
    const map = refMap.current;
    let v = map.get(userId);
    if (!v) {
      v = new Animated.Value(0);
      map.set(userId, v);
    }
    return v;
  }, []);

  const triggerEmojiFx = useCallback((userId: string, emojiId: string) => {
    const found = EMOJIS.find((e) => e.id === emojiId);
    const char = found?.char ?? emojiId;
    setEmojiByUser((s) => ({ ...s, [userId]: { char, nonce: Date.now() } }));
    const v = ensureAnim(emojiAnimRef, userId);
    const b = ensureAnim(bounceAnimRef, userId);
    const s = ensureAnim(sideAnimRef, userId);
    v.stopAnimation();
    v.setValue(0);
    b.stopAnimation();
    b.setValue(0);
    s.stopAnimation();
    s.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(b, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(b, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(b, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(b, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(s, { toValue: 1, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(s, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(s, { toValue: 1, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(s, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(1400),
      Animated.timing(v, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [ensureAnim]);

  useEffect(() => {
    if (!selectedTile && hasBoneyard) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(drawPulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(drawPulseAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    drawPulseAnim.stopAnimation();
    drawPulseAnim.setValue(0);
  }, [selectedTile, hasBoneyard, drawPulseAnim]);

  // Loading timer: 10 seconds countdown while waiting for game to start
  useEffect(() => {
    if (currentGame || loadingTimer <= 0) return;
    const timer = setInterval(() => setLoadingTimer(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [currentGame, loadingTimer]);

  const triggerOpponentPlayAnim = useCallback((
    tile: Tile,
    horizontal: boolean,
    playerId: string,
    seat: number,
  ) => {
    if (process.env.NODE_ENV === 'test') return;
    // Determine which opponent card ref to use as origin based on seat relative to mySeat
    const curMySeat = mySeatRef.current;
    let fromRef = oppCardTopRef;
    if (seat === (curMySeat + 1) % 4) fromRef = oppCardRightRef;
    else if (seat === (curMySeat + 3) % 4) fromRef = oppCardLeftRef;

    const fromPos = fromRef.current ?? { x: tableCenterRef.current.x, y: 60 };
    const toPos   = tableCenterRef.current;

    oppPlayTranslate.setValue({ x: fromPos.x - toPos.x, y: fromPos.y - toPos.y });
    oppPlayOpacity.setValue(0);
    oppPlayScale.setValue(0.55);

    setOpponentPlayAnim({ tile, horizontal, playerId });

    Animated.parallel([
      Animated.timing(oppPlayOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(oppPlayScale,   { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.back(1.5)) }),
      Animated.timing(oppPlayTranslate, { toValue: { x: 0, y: 0 }, duration: 420, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start(() => {
      Animated.timing(oppPlayOpacity, { toValue: 0, duration: 200, delay: 120, useNativeDriver: true }).start(() => {
        setOpponentPlayAnim(null);
      });
    });
  }, [oppPlayTranslate, oppPlayOpacity, oppPlayScale]);

  const triggerDrawFx = useCallback((userId: string) => {
    setDrawByUser((s) => ({ ...s, [userId]: { nonce: Date.now() } }));
    const v = ensureAnim(drawAnimRef, userId);
    v.stopAnimation();
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(550),
      Animated.timing(v, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [ensureAnim]);

  // ── Socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let didReceiveState = false;
    let cleanup: (() => void) | null = null;
    let joinTimeout: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const socket = await connectSocket();
        if (!mounted) return;
        socketRef.current = socket;

        const onGameState = (state: any) => {
          didReceiveState = true;
          if (joinTimeout) { clearTimeout(joinTimeout); joinTimeout = null; }
          const incomingSeq: number   = typeof state?.seq         === 'number' ? state.seq         : -1;
          const incomingRound: number = typeof state?.roundNumber === 'number' ? state.roundNumber : 0;

          // ── Hard-drop: state belongs to a past round we have already advanced past ──
          // currentRoundRef is NEVER reset (survives retries/reconnects), so this guard
          // is always reliable even when prevStateRef is null.
          if (incomingRound > 0 && incomingRound < currentRoundRef.current) return;

          // ── New round detected: advance the round counter and reset seq ──────────
          // Reset lastSeqRef when detecting a new round to ensure the first state of the
          // new round is always accepted. This prevents a race condition where a stale
          // game:sync_request response (from the previous round) that arrives just after
          // the new round starts could update lastSeqRef and block the new round's first state.
          if (incomingRound > currentRoundRef.current) {
            currentRoundRef.current = incomingRound;
            lastSeqRef.current = -1;
          }

          // ── Board-cleared fallback (roundNumber missing / zero) ───────────────────
          const incomingBoardLen: number = Array.isArray(state?.board) ? state.board.length : 0;
          const prevBoardLen: number     = prevStateRef.current?.board?.length ?? 0;
          if (prevBoardLen > 0 && incomingBoardLen === 0) lastSeqRef.current = -1;

          // ── Seq deduplication (within the same round) ────────────────────────────
          if (incomingSeq !== -1 && incomingSeq <= lastSeqRef.current) return;
          if (incomingSeq !== -1) lastSeqRef.current = incomingSeq;
          const normalized = normalizeGameState(state);
          const prev = prevStateRef.current;

          // DEBUG: Log hand size changes between rounds
          const me = normalized.players.find((p) => p.userId === myUserId) ?? normalized.players.find((p) => p.seat === 0);
          const newHand = me?.hand ?? [];
          const prevMe = prev?.players?.find((p) => p.userId === myUserId);
          // Log on every state update for debugging
          console.log(`[GAME STATE] Round ${normalized.roundNumber}, Hand size: ${newHand?.length}, Status: ${normalized.status}`);
          // CRITICAL: On round change, ensure we completely replace the hand, never accumulate
          if (normalized.roundNumber !== prev?.roundNumber) {
            console.log(`[ROUND CHANGE] Round ${prev?.roundNumber} -> ${normalized.roundNumber}`);
            // Force hand replacement by clearing selected tile
            setSelectedTile(null);
            // If server sent wrong hand size, log error
            if (newHand?.length > 7) {
              console.error(`[CRITICAL ERROR] Received ${newHand.length} tiles! Expected 6 or 7.`);
            }
          }

          setGame(normalized);
          resetTurnTimer();
          const cur = useGameStore.getState().selectedTile;
          if (cur) {
            const idx = cur.handIndex;
            const isSameAtIndex =
              idx >= 0 &&
              idx < newHand.length &&
              !!newHand[idx] &&
              (newHand[idx] as any)[0] === cur.tile[0] &&
              (newHand[idx] as any)[1] === cur.tile[1];

            if (!isSameAtIndex) {
              const foundIdx = newHand.findIndex((t) => t && t[0] === cur.tile[0] && t[1] === cur.tile[1]);
              if (foundIdx === -1) setSelectedTile(null);
              else setSelectedTile({ tile: newHand[foundIdx] as Tile, handIndex: foundIdx });
            }
          }

          if (prev) {
            const prevB = prev.boneyard?.length ?? 0;
            const nextB = normalized.boneyard?.length ?? 0;
            if (prevB - nextB === 1) {
              const prevLen = new Map(prev.players.map((p) => [p.userId, p.hand?.length ?? 0]));
              const drew = normalized.players.find((p) => (p.hand?.length ?? 0) === (prevLen.get(p.userId) ?? 0) + 1);
              if (drew) triggerDrawFx(drew.userId);
            }

            // Detect opponent tile play: board grew by 1 and an opponent hand shrunk by 1
            const prevBoard = prev.board ?? [];
            const nextBoard = normalized.board ?? [];
            if (nextBoard.length === prevBoard.length + 1) {
              const prevHandLen = new Map(prev.players.map((p) => [p.userId, p.hand?.length ?? 0]));
              const myUId = myEffectiveUserIdRef.current || String((useAuthStore.getState().user as any)?.id ?? (useAuthStore.getState().user as any)?.userId ?? '');
              const playedBy = normalized.players.find(
                (p) => p.userId !== myUId && (p.hand?.length ?? 0) === (prevHandLen.get(p.userId) ?? 0) - 1
              );
              if (playedBy) {
                const newPt = nextBoard[nextBoard.length - 1];
                const effective: Tile = newPt.flipped ? [newPt.tile[1], newPt.tile[0]] : newPt.tile;
                const isDouble = effective[0] === effective[1];
                const horizontal = !isDouble;
                triggerOpponentPlayAnim(effective, horizontal, playedBy.userId, playedBy.seat);
              }
            }
          }
          prevStateRef.current = normalized;
        };

        const onEnded = (result: any) => { if (timerRef.current) clearInterval(timerRef.current); setGameResult(result); setResultModal(true); };
        const onRoundEnded = (data: any) => {
          // Advance currentRoundRef so any stale same-round states are hard-dropped.
          // Do NOT reset lastSeqRef here: the server seq counter never resets between
          // rounds, so the first state of round N+1 will always have a higher seq than
          // the last state of round N. Resetting to -1 here would allow a stale
          // game:sync_request response (with the last round's seq) to slip through
          // during the 4-second inter-round pause and show the old hand to the player.
          const endedRound: number = typeof data?.roundNumber === 'number' ? data.roundNumber : 0;
          if (endedRound > 0) currentRoundRef.current = Math.max(currentRoundRef.current, endedRound);
          setRoundBanner({
            roundNumber:     data.roundNumber,
            winnerTeam:      data.winnerTeam,
            winType:         data.winType,
            points:          data.points,
            matchScores:     data.matchScores,
            targetScore:     data.targetScore,
            matchOver:       data.matchOver,
            matchWinnerTeam: data.matchWinnerTeam,
          });
          // Auto-hide banner after 3.5s (server starts next round in 4s)
          setTimeout(() => setRoundBanner(null), 3500);
        };
        const onGameError = ({ message }: { message: string }) => showError(message);
        const onTimeout = ({ userId }: { userId: string }) => { if (String(userId) === myUserId) showError('Tempo esgotado — sua vez foi pulada'); };
        const onEmoji = ({ userId, emoji }: { userId: string; emoji: string }) => triggerEmojiFx(String(userId), String(emoji));
        let disconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        const onDisconnect = () => {
          // Só mostra o banner após 1.5s de desconexão (evita flicker em reconexões rápidas)
          disconnectTimeout = setTimeout(() => setDisconnected(true), 1500);
        };
        const onConnect = () => {
          if (disconnectTimeout) clearTimeout(disconnectTimeout);
          setDisconnected(false);
          // Request full state sync after reconnect — we may have missed
          // the round-start broadcast while the socket was offline.
          socket.emit('game:sync_request', { gameId });
        };

        socket.on('game:state', onGameState);
        socket.on('game:ended', onEnded);
        socket.on('game:round_ended', onRoundEnded);
        socket.on('game:error', onGameError);
        socket.on('game:timeout', onTimeout);
        socket.on('game:emoji', onEmoji);
        socket.on('disconnect', onDisconnect);
        socket.on('connect', onConnect);

        socket.emit('game:join', { gameId });
        joinTimeout = setTimeout(() => {
          if (!mounted || didReceiveState) return;
          setDisconnected(true);
          setGameError('Não foi possível entrar na partida. Verifique sua conexão e tente novamente.');
        }, 9000);

        cleanup = () => {
          if (disconnectTimeout) clearTimeout(disconnectTimeout);
          socket.off('game:state', onGameState);
          socket.off('game:ended', onEnded);
          socket.off('game:round_ended', onRoundEnded);
          socket.off('game:error', onGameError);
          socket.off('game:timeout', onTimeout);
          socket.off('game:emoji', onEmoji);
          socket.off('disconnect', onDisconnect);
          socket.off('connect', onConnect);
        };
      } catch (err: any) {
        if (!mounted) return;
        showError(err?.message || 'Falha ao conectar na partida');
        setDisconnected(true);
      }
    })();
    return () => {
      mounted = false;
      if (joinTimeout) clearTimeout(joinTimeout);
      cleanup?.();
      socketRef.current?.emit('game:leave', { gameId });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameId, myUserId, joinAttempt]);

  const handleRetryJoin = useCallback(() => {
    disconnectSocket();
    socketRef.current = null;
    prevStateRef.current = null;
    lastSeqRef.current = -1;
    setDisconnected(false);
    setGameError(null);
    setJoinAttempt((n) => n + 1);
  }, []);

  // ── AppState: reconnect when coming back from background ───────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const sock = socketRef.current;
      if (!sock || !sock.connected) {
        handleRetryJoin();
      } else {
        sock.emit('game:sync_request', { gameId });
      }
    });
    return () => sub.remove();
  }, [gameId, handleRetryJoin]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleTileSelect = (tile: Tile, handIndex: number) => {
    if (!isMyTurn) return;
    if ((validMovesMap.get(tileKey(tile)) ?? []).length === 0) { showError('Esta pedra não pode ser jogada agora'); return; }
    const isSame = selectedTile?.handIndex === handIndex;
    setSelectedTile(isSame ? null : { tile, handIndex });
  };

  const handlePlayTile = useCallback(async (side: PlaySide) => {
    if (!selectedTile) return;
    if (turnTimer === 0) { showError('Tempo esgotado'); return; }
    const plays = validPlaysForSelected.filter((p) => p.side === side);
    if (!plays.length) return;
    try {
      const socket = socketRef.current ?? await connectSocket();
      socket.emit('game:move', { gameId, tile: selectedTile.tile, side, flipped: plays[0].flipped });
      setSelectedTile(null);
    } catch (err: any) {
      showError(err?.message || 'Falha ao jogar');
    }
  }, [selectedTile, validPlaysForSelected, gameId, showError]);

  const handlePlayImmediate = useCallback(async () => {
    if (!selectedTile || validPlaysForSelected.length !== 1) return;
    if (turnTimer === 0) { showError('Tempo esgotado'); return; }
    const { side, flipped } = validPlaysForSelected[0];
    try {
      const socket = socketRef.current ?? await connectSocket();
      socket.emit('game:move', { gameId, tile: selectedTile.tile, side, flipped });
      setSelectedTile(null);
    } catch (err: any) {
      showError(err?.message || 'Falha ao jogar');
    }
  }, [selectedTile, validPlaysForSelected, gameId, showError]);

  const handlePass = useCallback(async () => {
    try {
      const socket = socketRef.current ?? await connectSocket();
      socket.emit('game:pass', { gameId });
    } catch (err: any) {
      showError(err?.message || 'Falha ao passar');
    }
  }, [gameId, showError]);

  const handleDraw = useCallback(async () => {
    try {
      const socket = socketRef.current ?? await connectSocket();
      socket.emit('game:draw', { gameId });
    } catch (err: any) {
      showError(err?.message || 'Falha ao comprar');
    }
  }, [gameId, showError]);

  const handleEmoji = useCallback(async (emoji: string) => {
    try {
      triggerEmojiFx(myEffectiveUserId, emoji);
      const socket = socketRef.current ?? await connectSocket();
      socket.emit('game:emoji', { gameId, emoji });
    } catch (err: any) {
      showError(err?.message || 'Falha ao enviar reação');
    }
  }, [gameId, showError, triggerEmojiFx, myEffectiveUserId]);

  const doLeave = () => {
    setLeaveConfirmVisible(false);
    setSettingsVisible(false);
    // Tell the backend — it will run forfeitGame → ABANDONED, deduct bet
    socketRef.current?.emit('game:leave', { gameId });
    // Show the "you lost" result screen immediately so the player sees the penalty
    const game = useGameStore.getState().currentGame;
    const opponent = game?.players.find((p) => p.userId !== myEffectiveUserId && !p.isBot)
      ?? game?.players.find((p) => p.userId !== myEffectiveUserId);
    const bet = lastQueue?.betAmount ?? 0;
    setGameResult({
      status: 'ABANDONED',
      mode: game?.mode,
      betAmount: bet,
      winnerId: opponent?.userId ?? '',
      winnerTeam: opponent?.team,
      matchScores: game?.matchScores,
      prizePool: 0,
      prizePerWinner: 0,
    });
    setResultModal(true);
  };

  const handleLeaveGame = () => {
    setLeaveConfirmVisible(true);
  };

  const handlePlayAgain = useCallback(async () => {
    const qMode = (gameResult?.mode || lastQueue?.mode) as any;
    const qBet = typeof gameResult?.betAmount === 'number'
      ? gameResult.betAmount
      : typeof lastQueue?.betAmount === 'number'
        ? lastQueue.betAmount
        : 0;

    if (!qMode) {
      setResultModal(false);
      clearGame();
      navigation.replace('Main');
      return;
    }

    setPlayAgainSearching(true);
    try {
      const socket = socketRef.current ?? await connectSocket();
      const cleanup = () => {
        socket.off('game:found');
        socket.off('queue:error');
      };

      const timeout = setTimeout(() => {
        cleanup();
        socket.emit('queue:leave');
        setPlayAgainSearching(false);
        showError('Ainda não encontramos uma partida. Tente novamente.');
      }, 45000);

      socket.once('game:found', ({ gameId: nextGameId }: { gameId: string }) => {
        clearTimeout(timeout);
        cleanup();
        setPlayAgainSearching(false);
        setResultModal(false);
        clearGame();
        navigation.replace('Game', { gameId: nextGameId });
      });

      socket.once('queue:error', ({ message }: { message: string }) => {
        clearTimeout(timeout);
        cleanup();
        setPlayAgainSearching(false);
        showError(message);
      });

      socket.emit('queue:join', { mode: qMode, betAmount: qBet });
    } catch (err: any) {
      setPlayAgainSearching(false);
      showError(err?.message || 'Falha ao procurar nova partida');
    }
  }, [gameResult?.mode, gameResult?.betAmount, lastQueue?.mode, lastQueue?.betAmount, navigation, clearGame, showError]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!currentGame) {
    const glowOpacity = joinPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.32] });
    const glowScale = joinPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
    const tileLift = joinPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
    return (
      <ScreenBackground style={styles.bg}>
        <SafeAreaView style={[styles.container, styles.centered]}>
          <View style={styles.joinWrap}>
            <Animated.View style={[styles.joinGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
            <LinearGradient
              colors={['rgba(187,255,0,0.20)', 'rgba(0,0,0,0.55)', 'rgba(28,187,61,0.18)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.joinCard}
            >
              <View style={styles.joinSpinnerRow}>
                <ActivityIndicator color="#1CBB3D" size="large" />
              </View>
              <Text style={styles.joinTitle}>Entrando na partida...</Text>
              <Text style={styles.joinSubtitle}>Conectando e preparando a mesa</Text>
              <View style={styles.joinMiniRow}>
                <Animated.View style={{ transform: [{ translateY: tileLift }, { rotate: '-10deg' }] }}>
                  <Image source={DOMINO_IMAGES['6,6']} style={styles.joinMiniDomino} fadeDuration={0} />
                </Animated.View>
                <Animated.View style={{ transform: [{ translateY: tileLift }, { rotate: '0deg' }] }}>
                  <Image source={DOMINO_IMAGES['5,3']} style={styles.joinMiniDomino} fadeDuration={0} />
                </Animated.View>
                <Animated.View style={{ transform: [{ translateY: tileLift }, { rotate: '10deg' }] }}>
                  <Image source={DOMINO_IMAGES['2,1']} style={styles.joinMiniDomino} fadeDuration={0} />
                </Animated.View>
              </View>
            </LinearGradient>
          </View>
          {(disconnected || gameError) && (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingHint}>{gameError || 'Sem conexão com o servidor.'}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={handleRetryJoin} activeOpacity={0.85}>
                <Text style={styles.retryBtnText}>Tentar novamente</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => { clearGame(); navigation.replace('Main'); }}
                activeOpacity={0.85}
              >
                <Text style={styles.backBtnText}>Voltar</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  // Gap negativo para compensar a sombra embutida nas imagens das peças
  // Valor ajustado para manter peças próximas mas com espaçamento visual mínimo
  const SNAKE_GAP_BASE = 3;
  const SNAKE_GAP = SNAKE_GAP_BASE;
  const snakeMaxW = feltWidth
    ? Math.max(0, feltWidth * (is4Player ? 0.92 : 0.94))
    : Math.max(0, viewportWidth * (is4Player ? 0.80 : 0.92));
  const SNAKE_H_PER_ROW = Math.max(
    6,
    Math.min(14, Math.floor((snakeMaxW + SNAKE_GAP) / (boardTilePreset.long + SNAKE_GAP)))
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  const boardTileNoShadow = Platform.OS === 'web'
    ? ({ boxShadow: '0px 1px 2px rgba(0,0,0,0.16)' } as any)
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 2, elevation: 2 };

  const baseLayout = buildFullBoardLayout(currentGame.board ?? [], SNAKE_H_PER_ROW, boardTilePreset, SNAKE_GAP, 1);

  // ── Board scale: shrink tiles so they always fit inside the oval ─────────
  const boardScale = (() => {
    if (!feltWidth || baseLayout.width === 0 || baseLayout.height === 0) return 1;
    const boardPadBase = 4;
    const availW = Math.max(0, feltWidth  * 0.94 - boardPadBase * 2);
    const availH = Math.max(0, tableHeight * (is4Player ? 0.76 : 0.86) - boardPadBase * 2);
    const scaleW = baseLayout.width > availW ? availW / baseLayout.width : 1;
    const scaleH = baseLayout.height > availH ? availH / baseLayout.height : 1;
    return Math.max(is4Player ? 0.41 : 0.55, Math.min(1, scaleW, scaleH));
  })();
  // Recompute layout at the actual boardScale so positions are integers — no
  // further multiplication in render, which avoids cumulative rounding drift.
  const layout = boardScale < 1
    ? buildFullBoardLayout(currentGame.board ?? [], SNAKE_H_PER_ROW, boardTilePreset, SNAKE_GAP, boardScale)
    : baseLayout;
  const boardPad = Math.round(16 * boardScale);
  const layoutW = layout.width;
  const layoutH = layout.height;

  const renderPlayerFx = (userId: string, placement: 'top' | 'bottom' | 'left' | 'right') => {
    const emoji = emojiByUser[userId];
    const draw = drawByUser[userId];
    if (!emoji && !draw) return null;

    const emojiAnim = ensureAnim(emojiAnimRef, userId);
    const bounceAnim = ensureAnim(bounceAnimRef, userId);
    const sideAnim = ensureAnim(sideAnimRef, userId);
    const drawAnim = ensureAnim(drawAnimRef, userId);

    const emojiAnchor =
      placement === 'left' || placement === 'bottom'
        ? { top: -18, left: -10 }
        : { top: -18, right: -10 };

    const drawAnchor =
      placement === 'left'
        ? { bottom: -14, left: -10 }
        : { bottom: -14, right: -10 };

    return (
      <View pointerEvents="none" style={styles.playerFxLayer}>
        {!!draw && (
          <Animated.View
            style={[
              styles.drawBubble,
              drawAnchor,
              {
                opacity: drawAnim,
                transform: [
                  { scale: drawAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                  { translateY: drawAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
                ],
              },
            ]}
          >
            <Text style={styles.drawBubbleText}>+1</Text>
          </Animated.View>
        )}

        {!!emoji && (
          <Animated.View
            key={emoji.nonce}
            style={[
              styles.emojiBubble,
              emojiAnchor,
              {
                opacity: emojiAnim,
                transform: [
                  { scale: Animated.multiply(
                      emojiAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }),
                      bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
                    ) },
                  { translateY: emojiAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
                  { translateY: bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
                  { translateY: sideAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] }) },
                  { translateX: sideAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 12] }) },
                ],
              },
            ]}
          >
            <Text style={styles.emojiBubbleText}>{emoji.char}</Text>
          </Animated.View>
        )}
      </View>
    );
  };

  return (
    <ScreenBackground style={styles.bg}>
      <DominoImagePreloader />
      <SafeAreaView style={styles.container}>

      {/* Loading overlay — 10 second countdown at game start */}
      {loadingTimer > 0 && !currentGame && (
        <BlurModal visible transparent animationType="none">
          <View style={[styles.container, { backgroundColor: 'rgba(10, 31, 10, 0.95)', justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 20, fontSize: 18, color: colors.primary, fontWeight: '600' }}>
              Aguardando jogadores...
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: colors.textSecondary }}>
              {loadingTimer}s
            </Text>
          </View>
        </BlurModal>
      )}

      {/* Disconnect banner */}
      {disconnected && (
        <View style={styles.disconnectBanner}>
          <IconAlert size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.disconnectText}>Reconectando...</Text>
        </View>
      )}

      {/* Error toast */}
      {gameError && (
        <Animated.View style={[styles.errorToast, { opacity: errorFadeAnim }]}>
          <Text style={styles.errorToastText}>{gameError}</Text>
        </Animated.View>
      )}

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <ScoreBox is4Player={is4Player} myScore={myMatchScore} oppScore={oppMatchScore} targetScore={targetScore} />
        </View>
        <View style={styles.topCenter} />
        <TouchableOpacity style={styles.gearBtn} onPress={() => setSettingsVisible(true)}>
          <IconSettings size={isTablet ? 40 : 24} color={colors.textPrimary} accessibilityLabel="Configurações" />
        </TouchableOpacity>
      </View>

      {/* ── Middle: [table] (side players are absolute overlays on tableFrame) ── */}
      <View style={styles.middle}>

        {/* Table */}
        <View style={styles.tableWrap}>
          <View style={styles.tableArea}>
            <View style={[styles.tableFrame, { height: tableHeight, width: is4Player ? (isTablet ? '96%' : '85%') : (isTablet ? '99%' : '90%') }]}>
              {topOpponent && (
                <View style={styles.oppCardOverlay}>
                  <View
                    ref={oppCardTopViewRef}
                    style={styles.playerCardFxWrap}
                    onLayout={() => {
                      (oppCardTopViewRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
                        oppCardTopRef.current = { x: x + w / 2, y: y + h / 2 };
                      });
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <OpponentCard player={topOpponent} tileCount={topOpponent.hand.length} isTurn={turnUserId === topOpponent.userId} team={topOpponent.team} matchScore={currentGame.matchScores?.[topOpponent.team] ?? 0} isOpponent={topOpponent.team !== myTeam} />
                      <OpponentTimer timer={opponentTimer} isTurn={turnUserId === topOpponent.userId} />
                    </View>
                    {renderPlayerFx(topOpponent.userId, 'top')}
                  </View>
                </View>
              )}

              {/* Side players anchored to table edges */}
              {is4Player && leftOpponent && (
                <View style={styles.sideCardLeft}>
                  <View
                    ref={oppCardLeftViewRef}
                    style={styles.playerCardFxWrap}
                    onLayout={() => {
                      (oppCardLeftViewRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
                        oppCardLeftRef.current = { x: x + w / 2, y: y + h / 2 };
                      });
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <OpponentTimer timer={opponentTimer} isTurn={turnUserId === leftOpponent.userId} />
                      <SidePlayerCard player={leftOpponent} tileCount={leftOpponent.hand.length} isTurn={turnUserId === leftOpponent.userId} team={leftOpponent.team} matchScore={currentGame.matchScores?.[leftOpponent.team] ?? 0} isOpponent={leftOpponent.team !== myTeam} />
                    </View>
                    {renderPlayerFx(leftOpponent.userId, 'left')}
                  </View>
                </View>
              )}
              {is4Player && rightOpponent && (
                <View style={styles.sideCardRight}>
                  <View
                    ref={oppCardRightViewRef}
                    style={styles.playerCardFxWrap}
                    onLayout={() => {
                      (oppCardRightViewRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
                        oppCardRightRef.current = { x: x + w / 2, y: y + h / 2 };
                      });
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <SidePlayerCard player={rightOpponent} tileCount={rightOpponent.hand.length} isTurn={turnUserId === rightOpponent.userId} team={rightOpponent.team} matchScore={currentGame.matchScores?.[rightOpponent.team] ?? 0} isOpponent={rightOpponent.team !== myTeam} />
                      <OpponentTimer timer={opponentTimer} isTurn={turnUserId === rightOpponent.userId} />
                    </View>
                    {renderPlayerFx(rightOpponent.userId, 'right')}
                  </View>
                </View>
              )}

              <View
                ref={tableBgRef}
                style={styles.tableBg}
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  setTableBgSize({ width: Math.round(width), height: Math.round(height) });
                  // Measure absolute screen position for accurate left/right side detection
                  (tableBgRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
                    boardScreenCenterXRef.current = x + w / 2;
                    tableCenterRef.current = { x: x + w / 2, y: y + h * 0.45 };
                  });
                }}
              >
                {tableBgSize.width > 0 && (
                  <Image
                    source={require('../../assets/Rectangle 1.png')}
                    style={{ position: 'absolute', top: -tableBgSize.height * 0.15, left: -tableBgSize.width * 0.15, width: tableBgSize.width * 1.3, height: tableBgSize.height * 1.3 }}
                    resizeMode="cover"
                  />
                )}

                <View
                  style={styles.tableFelt}
                  onLayout={(e) => setFeltWidth(Math.round(e.nativeEvent.layout.width))}
                >
                {/* Watermark */}
                {currentGame.board.length === 0 && (
                  <Image
                    source={require('../../assets/b9e1ca54722e75c0419489ace1bdc6e4b752369c.png')}
                    style={styles.watermarkImage}
                    resizeMode="contain"
                  />
                )}

                {currentGame.board.length > 0 && (() => {
                  const S_u = boardTilePreset.short;
                  const L_u = boardTilePreset.long;

                  // Active tile: selected via click, or currently being dragged
                  const dragTile = webDrag?.tile ?? nativeDrag?.tile ?? null;
                  const activeGhostTile = selectedTile?.tile ?? (isMyTurn ? dragTile : null);
                  const validPlaysForGhost: PlayOption[] = activeGhostTile
                    ? (validMovesMap.get(tileKey(activeGhostTile)) ?? []) : [];

                  const leftPlay  = isMyTurn && activeGhostTile && layout.placed.length > 0
                    ? validPlaysForGhost.find(p => p.side === 'left') : undefined;
                  const rightPlay = isMyTurn && activeGhostTile && layout.placed.length > 0
                    ? validPlaysForGhost.find(p => p.side === 'right') : undefined;
                  const topPlay = isMyTurn && activeGhostTile && layout.placed.length > 0
                    ? validPlaysForGhost.find(p => p.side === 'top') : undefined;
                  const bottomPlay = isMyTurn && activeGhostTile && layout.placed.length > 0
                    ? validPlaysForGhost.find(p => p.side === 'bottom') : undefined;

                  // During drag, highlight the side the finger is heading toward (left/right for horizontal chain)
                  const dragX = webDrag?.x ?? null;
                  const dragTargetSide: 'left' | 'right' | null = dragX !== null
                    ? (dragX < boardScreenCenterXRef.current ? 'left' : 'right') : null;

                  const activeIsDouble = activeGhostTile
                    ? activeGhostTile[0] === activeGhostTile[1] : false;
                  const ghostHoriz = !activeIsDouble;
                  const ghostW_u = ghostHoriz ? L_u : S_u;
                  const ghostW_px = Math.round(ghostW_u * boardScale);

                  const gapPx = Math.round(2 * boardScale);

                  // rightEndRowParity: 0 = LTR row (chain arrives from left), 1 = RTL row.
                  // Declared early so rightEndP IIFE can use it.
                  const rightComesFromLeft = layout.rightEndRowParity === 0;
                  // leftEndRowParity: 0 = LTR (left-end tile is visually leftmost in its row),
                  //                   1 = RTL (left-end tile is visually rightmost in its row).
                  const leftEndIsInLTR = layout.leftEndRowParity === 0;

                  // Chain endpoints: use tracked indices from buildSnakeLayout.
                  // leftEndIdx = first non-corner tile placed (visual left end).
                  // rightEndIdx = last non-corner tile placed (visual right end).
                  // If the last placed tile overall is a corner, the right end IS that corner.
                  const horizTiles = layout.placed.slice(0, layout.horizCount > 0 ? layout.horizCount : layout.placed.length);
                  const lastHorizTile = horizTiles[horizTiles.length - 1];
                  const rightEndIsCorner = lastHorizTile?.isCorner ?? false;

                  const leftEndP = layout.snakeLeftEndIdx >= 0 && layout.snakeLeftEndIdx < horizTiles.length
                    ? horizTiles[layout.snakeLeftEndIdx]
                    : horizTiles[0];
                  const leftEndIsCorner = leftEndP?.isCorner ?? false;

                  const rightEndP = rightEndIsCorner
                    ? lastHorizTile
                    : (layout.snakeRightEndIdx >= 0 && layout.snakeRightEndIdx < horizTiles.length
                        ? horizTiles[layout.snakeRightEndIdx]
                        : lastHorizTile);

                  // Top/bottom endpoints (vertical CRUZADA branches)
                  // Find tiles that are not in the horizontal chain
                  const hasVerticalTiles = layout.placed.length > layout.horizCount;
                  const verticalTiles = hasVerticalTiles
                    ? layout.placed.slice(layout.horizCount)
                    : [];

                  // Separate top and bottom tiles based on Y position relative to spinner
                  const spinnerIdx = layout.horizCount > 0 ? Math.min(layout.horizCount - 1, layout.placed.length - 1) : 0;
                  const spinnerTile = layout.placed[spinnerIdx];
                  const spinnerCenterY = spinnerTile?.y ?? 0;

                  const topTiles = verticalTiles.filter(t => t.y < spinnerCenterY);
                  const bottomTiles = verticalTiles.filter(t => t.y >= spinnerCenterY);

                  // Get the last tile in each branch
                  // Top column: last tile is the one with MIN Y (topmost)
                  // Bottom column: last tile is the one with MAX Y (bottommost)
                  const topEndP = topTiles.length > 0
                    ? topTiles.reduce((min, t) => t.y < min.y ? t : min)
                    : null;
                  const bottomEndP = bottomTiles.length > 0
                    ? bottomTiles.reduce((max, t) => t.y > max.y ? t : max)
                    : null;

                  // Track growth pattern: determine if next tile should grow left or right
                  const topGrowingLeft = topTiles.length % 2 === 0; // Odd count = should grow right
                  const bottomGrowingLeft = bottomTiles.length % 2 === 0;

                  // DEBUG — remove after fixing ghosts
                  if (__DEV__ && (leftPlay || rightPlay)) {
                    const dbgPlaced = layout.placed.map((p, i) =>
                      `[${i}](${p.x.toFixed(0)},${p.y.toFixed(0)} h=${p.horizontal} c=${!!p.isCorner})`).join(' ');
                    console.log('[ghost] snakeLeftEndIdx=', layout.snakeLeftEndIdx, 'snakeRightEndIdx=', layout.snakeRightEndIdx,
                      'leftEndP=', leftEndP ? `(${leftEndP.x.toFixed(0)},${leftEndP.y.toFixed(0)} h=${leftEndP.horizontal} c=${!!leftEndP.isCorner})` : 'null',
                      'rightEndP=', rightEndP ? `(${rightEndP.x.toFixed(0)},${rightEndP.y.toFixed(0)} h=${rightEndP.horizontal} c=${!!rightEndP.isCorner})` : 'null',
                      'horizCount=', layout.horizCount, 'rightIsCorner=', rightEndIsCorner,
                      'rightParity=', layout.rightEndRowParity, 'leftParity=', layout.leftEndRowParity);
                  }

                  // Ghost side: corners have no horizontal extension (ghost goes BELOW them).
                  const leftGhostOnLeft  = !leftEndIsCorner && leftEndIsInLTR;
                  const rightGhostOnLeft = !rightEndIsCorner && !rightComesFromLeft;

                  const ghostExt_px = ghostW_px + gapPx;
                  let leftSlot_px  = 0;
                  let rightSlot_px = 0;
                  if (leftPlay  && !leftEndIsCorner)  { if (leftGhostOnLeft)  leftSlot_px += ghostExt_px; else rightSlot_px += ghostExt_px; }
                  if (rightPlay && !rightEndIsCorner) { if (rightGhostOnLeft) leftSlot_px += ghostExt_px; else rightSlot_px += ghostExt_px; }
                  const extW = layoutW + leftSlot_px + rightSlot_px;

                  const ghostH_u  = ghostHoriz ? S_u : L_u;
                  const ghostH_px = Math.round(ghostH_u * boardScale);
                  const cornerL_px = Math.round(L_u * boardScale);
                  const cornerS_px = Math.round(S_u * boardScale);

                  // Y: center on endpoint tile; for corners, place ghost directly below.
                  const ghostY = (endP: typeof leftEndP): number => {
                    if (endP.isCorner) return endP.y + cornerL_px + gapPx;
                    const endTileH_u = endP.horizontal ? S_u : L_u;
                    const centerOffset = Math.round(((endTileH_u - ghostH_u) / 2) * boardScale);
                    return endP.y + centerOffset;
                  };

                  const flippedTile = (play: { flipped: boolean }): Tile => {
                    if (!activeGhostTile) return [0, 0];
                    return play.flipped
                      ? ([activeGhostTile[1], activeGhostTile[0]] as Tile)
                      : activeGhostTile;
                  };

                  const leftEndTileW_px  = Math.round((leftEndP.horizontal ? L_u : S_u) * boardScale);
                  const rightEndTileW_px = Math.round((rightEndP.horizontal ? L_u : S_u) * boardScale);

                  // X: corner ends are centered on the corner; others use horizontal formula.
                  const leftEndTileLeft_px  = leftEndP.x + leftSlot_px;
                  const leftGhostX_px = leftEndIsCorner
                    ? leftEndTileLeft_px + Math.round((cornerS_px - ghostW_px) / 2)
                    : leftGhostOnLeft
                      ? leftEndTileLeft_px - ghostW_px - gapPx
                      : leftEndTileLeft_px + leftEndTileW_px + gapPx;

                  const rightEndTileLeft_px = rightEndP.x + leftSlot_px;
                  const rightGhostX_px = rightEndIsCorner
                    ? rightEndTileLeft_px + Math.round((cornerS_px - ghostW_px) / 2)
                    : rightComesFromLeft
                      ? rightEndTileLeft_px + rightEndTileW_px + gapPx
                      : rightEndTileLeft_px - ghostW_px - gapPx;

                  // Extend container height if corner ghosts extend below the laid-out board.
                  let extraBelowH = 0;
                  if (leftPlay  && leftEndIsCorner)  extraBelowH = Math.max(extraBelowH, ghostY(leftEndP)  + ghostH_px - layoutH + gapPx);
                  if (rightPlay && rightEndIsCorner) extraBelowH = Math.max(extraBelowH, ghostY(rightEndP) + ghostH_px - layoutH + gapPx);
                  const extH = layoutH + Math.max(0, extraBelowH);

                  // Top/bottom ghost dimensions and positions
                  const topbottomGhostW_u = ghostHoriz ? L_u : S_u;
                  const topbottomGhostH_u = ghostHoriz ? S_u : L_u;
                  const topbottomGhostW_px = Math.round(topbottomGhostW_u * boardScale);
                  const topbottomGhostH_px = Math.round(topbottomGhostH_u * boardScale);
                  const gapVertPx = Math.round(4 * boardScale);
                  const wrapperOffsetYVertical = Math.round(5 * boardScale); // Match tile offset

                  // Position ghost in the next available slot, following the alternating growth pattern
                  const ghostY_topbottom = (endP: typeof topEndP, side: 'top' | 'bottom'): number => {
                    if (!endP) return 0;
                    const endTileH_u = endP.horizontal ? S_u : L_u;
                    const endTileH_px = Math.round(endTileH_u * boardScale);
                    if (side === 'top') {
                      // Ghost goes above the last top tile, with offset compensation
                      return endP.y + wrapperOffsetYVertical - topbottomGhostH_px - gapVertPx;
                    } else {
                      // Ghost goes below the last bottom tile, with offset compensation
                      return endP.y + wrapperOffsetYVertical + endTileH_px + gapVertPx;
                    }
                  };

                  // Position ghost in next slot (left or right of current end tile)
                  const ghostX_topbottom = (endP: typeof topEndP, growingLeft: boolean): number => {
                    if (!endP) return 0;
                    const endTileW_u = endP.horizontal ? L_u : S_u;
                    const endTileW_px = Math.round(endTileW_u * boardScale);
                    const gapPx = Math.round(2 * boardScale); // Tile gap

                    // Next ghost position follows the alternating pattern
                    if (growingLeft) {
                      return endP.x + leftSlot_px - topbottomGhostW_px - gapPx; // Extend left
                    } else {
                      return endP.x + leftSlot_px + endTileW_px + gapPx; // Extend right
                    }
                  };

                  return (
                    <View style={[styles.snakeBoardFrame, { paddingTop: boardPad + 40, paddingBottom: boardPad + 12, paddingHorizontal: boardPad + 24 }]}>
                      <View style={[styles.snakeBoard, { width: extW, height: extH }]}>
                        {/* Board tiles (shifted right by leftSlot_px) */}
                        {layout.placed.map((p, i) => {
                          return (
                            <View key={i} style={{ position: 'absolute', left: p.x + leftSlot_px, top: p.y }}>
                              <DominoTile
                                tile={p.tile}
                                size={boardTileSize}
                                tileScale={boardScale}
                                horizontal={p.horizontal}
                                style={boardTileNoShadow}
                              />
                            </View>
                          );
                        })}

                        {/* ── Left ghost: tap to play on left side ── */}
                        {leftPlay && (
                          <TouchableOpacity
                            onPress={() => handlePlayTile('left')}
                            activeOpacity={0.75}
                            style={{ position: 'absolute', left: leftGhostX_px, top: ghostY(leftEndP), zIndex: 50 }}
                          >
                            <View style={{ position: 'absolute', top: -11, left: 0, right: 0, alignItems: 'center' }}>
                              <View style={[styles.ghostArrow, dragTargetSide === 'left' && styles.ghostArrowActive]} />
                            </View>
                            <View style={{
                              width: ghostW_px,
                              height: Math.round((ghostHoriz ? S_u : L_u) * boardScale),
                              borderRadius: 4,
                              borderWidth: 2,
                              borderStyle: 'dashed',
                              borderColor: dragTargetSide === 'left' ? '#f97316' : '#1CBB3D',
                              backgroundColor: dragTargetSide === 'left' ? 'rgba(249,115,22,0.15)' : 'rgba(28,187,61,0.15)',
                            }} />
                          </TouchableOpacity>
                        )}

                        {/* ── Right ghost: tap to play on right side ── */}
                        {rightPlay && (
                          <TouchableOpacity
                            onPress={() => handlePlayTile('right')}
                            activeOpacity={0.75}
                            style={{ position: 'absolute', left: rightGhostX_px, top: ghostY(rightEndP), zIndex: 50 }}
                          >
                            <View style={{ position: 'absolute', top: -11, left: 0, right: 0, alignItems: 'center' }}>
                              <View style={[styles.ghostArrow, dragTargetSide === 'right' && styles.ghostArrowActive]} />
                            </View>
                            <View style={{
                              width: ghostW_px,
                              height: Math.round((ghostHoriz ? S_u : L_u) * boardScale),
                              borderRadius: 4,
                              borderWidth: 2,
                              borderStyle: 'dashed',
                              borderColor: dragTargetSide === 'right' ? '#f97316' : '#1CBB3D',
                              backgroundColor: dragTargetSide === 'right' ? 'rgba(249,115,22,0.15)' : 'rgba(28,187,61,0.15)',
                            }} />
                          </TouchableOpacity>
                        )}

                        {/* ── Top ghost: tap to play on top side ── */}
                        {topPlay && topEndP && hasVerticalTiles && (
                          <TouchableOpacity
                            onPress={() => handlePlayTile('top')}
                            activeOpacity={0.75}
                            style={{ position: 'absolute', left: ghostX_topbottom(topEndP, topGrowingLeft), top: ghostY_topbottom(topEndP, 'top'), zIndex: 50 }}
                          >
                            <View style={{ position: 'absolute', bottom: -11, left: 0, right: 0, alignItems: 'center' }}>
                              <View style={[styles.ghostArrow, { transform: [{ rotate: '180deg' }] }]} />
                            </View>
                            <View style={{
                              width: topbottomGhostW_px,
                              height: topbottomGhostH_px,
                              borderRadius: 4,
                              borderWidth: 2,
                              borderStyle: 'dashed',
                              borderColor: '#1CBB3D',
                              backgroundColor: 'rgba(28,187,61,0.15)',
                            }} />
                          </TouchableOpacity>
                        )}

                        {/* ── Bottom ghost: tap to play on bottom side ── */}
                        {bottomPlay && bottomEndP && hasVerticalTiles && (
                          <TouchableOpacity
                            onPress={() => handlePlayTile('bottom')}
                            activeOpacity={0.75}
                            style={{ position: 'absolute', left: ghostX_topbottom(bottomEndP, bottomGrowingLeft), top: ghostY_topbottom(bottomEndP, 'bottom'), zIndex: 50 }}
                          >
                            <View style={{ position: 'absolute', top: -11, left: 0, right: 0, alignItems: 'center' }}>
                              <View style={[styles.ghostArrow]} />
                            </View>
                            <View style={{
                              width: topbottomGhostW_px,
                              height: topbottomGhostH_px,
                              borderRadius: 4,
                              borderWidth: 2,
                              borderStyle: 'dashed',
                              borderColor: '#1CBB3D',
                              backgroundColor: 'rgba(28,187,61,0.15)',
                            }} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })()}

              </View>
              </View>
            </View>
          </View>

          {/* Hand section — action bar above tiles, player card beside */}
          <View
            style={styles.handSection}
            onLayout={(e) => {
              const screenH = Platform.OS === 'web' && typeof window !== 'undefined'
                ? window.innerHeight
                : Dimensions.get('window').height;
              handSectionTopRef.current = screenH - e.nativeEvent.layout.height;
            }}
          >

            {/* ── Action bar — draw / pass only ── */}
            {isMyTurn && !selectedTile && (
              <View style={styles.actionBar}>
                {hasBoneyard && !is2v2 && !hasValidMoves && (
                  <Animated.View style={{ transform: [{ scale: drawPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
                    <LinearGradient
                      colors={['#1CBB3D', '#22c55e']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.drawBtn}
                    >
                      <TouchableOpacity style={styles.drawBtnInner} onPress={handleDraw} activeOpacity={0.9}>
                        <Text style={styles.drawBtnText}>+ Comprar</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  </Animated.View>
                )}
              </View>
            )}

            {/* ── Hand tiles + player card ── */}
            <View style={styles.handRow}>
              <ScrollView
                ref={handScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.handScroll}
                scrollEnabled={Platform.OS === 'web' ? true : !nativeDrag}
                {...(Platform.OS === 'web'
                  ? ({
                      onWheel: (e: any) => {
                        try {
                          (e.currentTarget as any).scrollLeft += e.deltaY;
                          e.preventDefault?.();
                        } catch {}
                      },
                    } as any)
                  : {})}
                contentContainerStyle={styles.handContent}
              >
                {myHand.map((tile, i) => {
                  if (!tile) return null;
                  const key = tileKey(tile);
                  const isPlayable = isMyTurn && validMovesMap.has(key);
                  const isSelected = selectedTile?.handIndex === i;
                  return (
                    <View key={`${key}-${i}`} style={[styles.handTileWrap, isSelected && styles.handTileSelected]}>
                      {isMyTurn && isPlayable && !isSelected && (
                        <View style={styles.handTileArrow} />
                      )}
                      <DraggableTile
                        tile={tile}
                        isSelected={isSelected}
                        isPlayable={!isMyTurn || isPlayable}
                        onPress={() => handleTileSelect(tile, i)}
                        onDragUp={(moveX?: number) => {
                          const plays = validMovesMap.get(tileKey(tile)) || [];
                          if (!plays.length) return;
                          if (turnTimer === 0) { showError('Tempo esgotado'); return; }
                          const emptyBoard = (currentGame?.board?.length ?? 0) === 0;
                          if (emptyBoard || plays.length === 1) {
                            const play = plays[0];
                            connectSocket().then(s => {
                              s.emit('game:move', { gameId, tile, side: play.side, flipped: play.flipped });
                              setSelectedTile(null);
                            }).catch(() => showError('Falha ao jogar'));
                          } else {
                            const cx = boardScreenCenterXRef.current;
                            const intendedSide: PlaySide = (moveX ?? cx) < cx ? 'left' : 'right';
                            const sidePlay = plays.find(p => p.side === intendedSide);
                            if (sidePlay) {
                              connectSocket().then(s => {
                                s.emit('game:move', { gameId, tile, side: sidePlay.side, flipped: sidePlay.flipped });
                                setSelectedTile(null);
                              }).catch(() => showError('Falha ao jogar'));
                            } else {
                              const otherSide = intendedSide === 'left' ? 'direita →' : '← esquerda';
                              showError(`Solte no lado ${otherSide}`);
                            }
                          }
                        }}
                        onWebDragStart={isPlayable && turnTimer > 0 ? (clientX, clientY) => {
                          const plays = validMovesMap.get(tileKey(tile)) || [];
                          startWebDrag(tile, clientX, clientY, (dropX: number) => {
                            if (!plays.length) return;
                            const emptyBoard = (currentGame?.board?.length ?? 0) === 0;
                            if (emptyBoard || plays.length === 1) {
                              const play = plays[0];
                              connectSocket().then(s => {
                                s.emit('game:move', { gameId, tile, side: play.side, flipped: play.flipped });
                                setSelectedTile(null);
                              }).catch(() => showError('Falha ao jogar'));
                            } else {
                              const cx = boardScreenCenterXRef.current;
                              const intendedSide: PlaySide = dropX < cx ? 'left' : 'right';
                              const sidePlay = plays.find(p => p.side === intendedSide);
                              if (sidePlay) {
                                connectSocket().then(s => {
                                  s.emit('game:move', { gameId, tile, side: sidePlay.side, flipped: sidePlay.flipped });
                                  setSelectedTile(null);
                                }).catch(() => showError('Falha ao jogar'));
                              } else {
                                const otherSide = intendedSide === 'left' ? 'direita →' : '← esquerda';
                                showError(`Solte no lado ${otherSide}`);
                              }
                            }
                          });
                        } : undefined}
                        onNativeDragStart={isPlayable && Platform.OS !== 'web' && turnTimer > 0 ? (pageX, pageY) => {
                          const plays = validMovesMap.get(tileKey(tile)) || [];
                          startNativeDrag(tile, pageX, pageY, (dropX: number) => {
                            if (!plays.length) return;
                            const emptyBoard = (currentGame?.board?.length ?? 0) === 0;
                            if (emptyBoard || plays.length === 1) {
                              const play = plays[0];
                              connectSocket().then(s => {
                                s.emit('game:move', { gameId, tile, side: play.side, flipped: play.flipped });
                                setSelectedTile(null);
                              }).catch(() => showError('Falha ao jogar'));
                            } else {
                              const cx = boardScreenCenterXRef.current;
                              const intendedSide: PlaySide = dropX < cx ? 'left' : 'right';
                              const sidePlay = plays.find(p => p.side === intendedSide);
                              if (sidePlay) {
                                connectSocket().then(s => {
                                  s.emit('game:move', { gameId, tile, side: sidePlay.side, flipped: sidePlay.flipped });
                                  setSelectedTile(null);
                                }).catch(() => showError('Falha ao jogar'));
                              } else {
                                const otherSide = intendedSide === 'left' ? 'direita →' : '← esquerda';
                                showError(`Solte no lado ${otherSide}`);
                              }
                            }
                          });
                        } : undefined}
                        onNativeDragMove={Platform.OS !== 'web' ? updateNativeDragPos : undefined}
                        onNativeDragEnd={Platform.OS !== 'web' ? endNativeDrag : undefined}
                      />
                    </View>
                  );
                })}

                {/* ── Pass button — inline, same position as Jogar, only when no valid moves ── */}
                {isMyTurn && !selectedTile && !hasValidMoves && !hasBoneyard && (
                  <View style={styles.inlineActions}>
                    <TouchableOpacity style={styles.passBtn} onPress={handlePass} activeOpacity={0.8}>
                      <Text style={styles.passBtnText}>Passar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── Inline play / cancel buttons — inside the scroll, always right after the last tile ── */}
                {isMyTurn && selectedTile && (
                  <View style={styles.inlineActions}>
                    {uniqueSides.length === 1 && (
                      <TouchableOpacity style={styles.jogarBtn} onPress={handlePlayImmediate} activeOpacity={0.85}>
                        <Text style={styles.jogarBtnText}>Jogar</Text>
                      </TouchableOpacity>
                    )}
                    {uniqueSides.length > 1 && uniqueSides.map((side) => (
                      <TouchableOpacity key={side} style={styles.sideBtn} onPress={() => handlePlayTile(side)} activeOpacity={0.8}>
                        {side === 'left'  ? <IconChevronLeft  size={20} color="#fff" /> :
                         side === 'right' ? <IconChevronRight size={20} color="#fff" /> :
                         side === 'top'   ? <IconChevronLeft  size={20} color="#fff" /> :
                                            <IconChevronRight size={20} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedTile(null)}>
                      <IconX size={16} color="#fff" accessibilityLabel="Cancelar" />
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>

              <View style={styles.playerCardWithTimer}>
                {currentGame?.status === 'playing' && isMyTurn && (
                  <Animated.View style={[
                    styles.timerBadge,
                    turnTimer > 10 ? styles.timerBadgeGreen
                      : turnTimer > 5 ? styles.timerBadgeGold
                      : styles.timerBadgeRed,
                    { transform: [{ scale: timerPulseAnim }], alignSelf: 'center' },
                  ]}>
                    <Text style={styles.timerText}>{turnTimer}</Text>
                  </Animated.View>
                )}
                <View
                  ref={myCardViewRef}
                  style={styles.playerCardFxWrap}
                  onLayout={() => {
                    (myCardViewRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
                      myCardRef.current = { x: x + w / 2, y: y + h / 2 };
                    });
                  }}
                >
                  <MyPlayerCard
                    name={user?.name?.split(' ')[0] || 'Você'}
                    hand={myHand.filter(Boolean).length}
                    isMyTurn={isMyTurn}
                    avatarUri={(user as any)?.avatarUrl ?? (user as any)?.avatar}
                    onSelectEmoji={handleEmoji}
                    team={myTeam}
                    matchScore={myMatchScore}
                  />
                  {renderPlayerFx(myEffectiveUserId, 'bottom')}
                </View>
              </View>
            </View>

          </View>
        </View>


      </View>


      {/* ── Settings modal (HomeScreen-style card) ── */}
      <BlurModal visible={settingsVisible} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => setSettingsVisible(false)}
          testID="settings-overlay"
        >
          <Pressable
            style={styles.settingsCard}
            onPress={() => {}}
            onStartShouldSetResponder={() => true}
            testID="settings-card"
          >
            <View style={[styles.settingsTextureWrap, (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : null)]}>
              <Image
                source={require('../../assets/e27c2e8e377e60057010a8431706b96b0152436f.png')}
                style={styles.settingsTexture}
                resizeMode="cover"
              />
            </View>

            <View style={styles.modalHeader}>
              <View style={{ width: 26 }} />
              <Text style={styles.settingsTitle}>Configurações</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)} accessibilityLabel="Fechar configurações">
                <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: isPhone ? 4 : 8 }} showsVerticalScrollIndicator={false}>
              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>Som:</Text>
                <GradientToggle
                  value={soundOn}
                  onValueChange={setSoundOn}
                  pressableTestID="settings-sound-toggle"
                  accessibilityLabel="Som"
                  kind="sound"
                />
              </View>

              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>Música:</Text>
                <GradientToggle
                  value={musicOn}
                  onValueChange={setMusicOn}
                  pressableTestID="settings-music-toggle"
                  accessibilityLabel="Música"
                  kind="music"
                />
              </View>
              {/* Leave */}
              <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveGame}>
                <Text style={styles.leaveBtnText}>Abandonar partida</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </BlurModal>

      <BlurModal visible={leaveConfirmVisible} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => setLeaveConfirmVisible(false)}
          testID="leave-confirm-overlay"
        >
          <Pressable
            style={[styles.confirmCard, dynIsTablet && { maxWidth: 520 }]}
            onPress={() => {}}
            onStartShouldSetResponder={() => true}
            testID="leave-confirm-card"
          >
            <ScrollView style={{ flexShrink: 1, width: '100%' }} contentContainerStyle={{ alignItems: 'center', gap: isPhone ? 8 : 12 }} showsVerticalScrollIndicator={false}>
              <View style={[styles.confirmIcon, { marginBottom: isPhone ? 0 : spacing.sm }]}>
                <IconAlert size={isPhone ? 32 : 40} color="#ef4444" />
              </View>
              <Text style={styles.confirmTitle}>Abandonar partida</Text>
              <Text style={styles.confirmText}>Tem certeza que deseja sair?</Text>
              <View style={styles.confirmWarningBox}>
                <Text style={styles.confirmWarningText}>⚠️ Você perderá a aposta!</Text>
              </View>
              <View style={[styles.confirmActions, { marginTop: isPhone ? 4 : spacing.lg }]}>
                <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setLeaveConfirmVisible(false)}>
                  <Text style={styles.confirmCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmLeaveBtn} onPress={doLeave}>
                  <Text style={styles.confirmLeaveText}>Sair</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </BlurModal>

      {/* ── Result modal ── */}
      <BlurModal visible={resultModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <ResultCard
            result={gameResult}
            userId={myEffectiveUserId}
            playAgainLoading={playAgainSearching}
            onPlayAgain={handlePlayAgain}
            onExit={() => { setResultModal(false); setPlayAgainSearching(false); clearGame(); navigation.replace('Main'); }}
          />
        </View>
      </BlurModal>


      {/* ── Web drag ghost — floats above everything, outside the hand ScrollView ── */}
      {Platform.OS === 'web' && webDrag && (() => {
        // TileHandImage always renders vertically: width = short, height = long
        const ghostW = TILE_DIMS.hand.short;
        const ghostH = TILE_DIMS.hand.long;
        const dy = webDrag.startY - webDrag.y;
        const sc = 1 + Math.min(1, Math.max(0, (dy - 10) / 60)) * 0.06;
        return (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: webDrag.x - ghostW / 2,
              top:  webDrag.y - ghostH * 1.2,
              zIndex: 99999,
              opacity: 0.88,
              ...(Platform.OS === 'web' ? ({
                pointerEvents: 'none',
                transform: `scale(${sc})`,
                transformOrigin: 'center center',
              } as any) : null),
            }}
          >
            <TileHandImage tile={webDrag.tile} selected={true} playable={true} />
          </View>
        );
      })()}

      {/* ── Opponent play fly animation overlay ── */}
      {opponentPlayAnim && (() => {
        const oppTile = opponentPlayAnim.tile;
        const isHoriz = opponentPlayAnim.horizontal;
        const tileW = Math.round(isHoriz ? TILE_DIMS.hand.long : TILE_DIMS.hand.short);
        const tileH = Math.round(isHoriz ? TILE_DIMS.hand.short : TILE_DIMS.hand.long);
        // tableCenterRef stores screen-absolute coords (from measureInWindow).
        // The overlay is inside SafeAreaView so subtract its insets.
        const centerLeft = tableCenterRef.current.x - tileW / 2 - safeInsets.left;
        const centerTop  = tableCenterRef.current.y - tileH / 2 - safeInsets.top;
        return (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: centerLeft,
              top:  centerTop,
              zIndex: 99998,
              opacity: oppPlayOpacity,
              transform: [
                { translateX: oppPlayTranslate.x },
                { translateY: oppPlayTranslate.y },
                { scale: oppPlayScale },
              ],
            }}
          >
            <DominoTile
              tile={oppTile}
              size="hand"
              horizontal={isHoriz}
              selected
            />
          </Animated.View>
        );
      })()}

      {/* ── Round banner overlay ── */}
      {roundBanner && (
        <View style={styles.roundBannerOverlay} pointerEvents="none">
          <View style={styles.roundBannerCard}>
            {roundBanner.winnerTeam === null ? (
              <Text style={styles.roundBannerTitle}>Empate!</Text>
            ) : (
              <Text style={styles.roundBannerTitle}>
                {roundBanner.winType ? WIN_TYPE_LABEL[roundBanner.winType as keyof typeof WIN_TYPE_LABEL] : 'Simples'}!
              </Text>
            )}
            {roundBanner.winnerTeam !== null && roundBanner.points > 0 && (
              <Text style={styles.roundBannerPoints}>+{roundBanner.points} ponto{roundBanner.points !== 1 ? 's' : ''}</Text>
            )}
            <View style={styles.roundBannerScores}>
              <Text style={styles.roundBannerScoreLabel}>Nós</Text>
              <Text style={styles.roundBannerScoreValue}>{roundBanner.matchScores?.[1] ?? 0}</Text>
              <Text style={styles.roundBannerScoreSep}>–</Text>
              <Text style={styles.roundBannerScoreValue}>{roundBanner.matchScores?.[2] ?? 0}</Text>
              <Text style={styles.roundBannerScoreLabel}>Eles</Text>
            </View>
            <Text style={styles.roundBannerRound}>Rodada {roundBanner.roundNumber}</Text>
          </View>
        </View>
      )}
      </SafeAreaView>

      {/* ── Native drag ghost — rendered OUTSIDE SafeAreaView to use raw screen coords ── */}
      {Platform.OS !== 'web' && nativeDrag && (() => {
        // TileHandImage always renders vertically: width = short, height = long
        const ghostW = TILE_DIMS.board.short;
        const ghostH = TILE_DIMS.board.long;
        const scl = nativeDragPos.y.interpolate({
          inputRange: [nativeDrag.startY - 70, nativeDrag.startY],
          outputRange: [1.06, 1],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Animated.subtract(nativeDragPos.x, ghostW / 2),
              top:  Animated.subtract(nativeDragPos.y, ghostH * 0.7),
              zIndex: 99999,
              opacity: 0.88,
              transform: [{ scale: scl }],
            }}
          >
            <TileHandImage tile={nativeDrag.tile} selected={true} playable={true} />
          </Animated.View>
        );
      })()}
    </ScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: colors.bg,
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : null),
  },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },

  container: { flex: 1, backgroundColor: 'transparent' },
  centered:  { alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textMuted, fontSize: fonts.sizes.lg },
  joinWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  joinGlow: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#BBFF00',
  },
  joinCard: {
    width: 360,
    maxWidth: '94%',
    borderRadius: radius.xl,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 14px 28px rgba(0,0,0,0.50)' } as any) : shadows.card),
  },
  joinSpinnerRow: { alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  joinTitle: { color: '#fff', fontSize: fonts.sizes.xl, fontWeight: '900', textAlign: 'center' },
  joinSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: fonts.sizes.sm, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  joinMiniRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 16 },
  joinMiniDomino: { width: 48, height: 72, resizeMode: 'contain' },
  miniDomino: {
    width: 64,
    height: 44,
    flexDirection: 'row',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  miniHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  miniDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  miniPips: { width: '100%', height: '100%' },
  miniPip: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  loadingCard: {
    marginTop: 16,
    width: 320,
    maxWidth: '92%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    gap: 10,
  },
  loadingHint: { color: '#e2e8f0', fontSize: fonts.sizes.sm, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#1CBB3D',
    borderRadius: radius.full,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { color: '#000', fontWeight: '900', fontSize: fonts.sizes.sm },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { color: '#e2e8f0', fontWeight: '800', fontSize: fonts.sizes.sm },

  disconnectBanner: { backgroundColor: colors.warning, paddingVertical: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', zIndex: 9999 },
  disconnectText:   { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },

  errorToast: {
    position: 'absolute', top: 70, alignSelf: 'center', zIndex: 100,
    backgroundColor: colors.error, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    ...shadows.card,
  },
  errorToastText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: 2,
    gap: spacing.sm,
    zIndex: 50,
  },
  topLeft: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  gearBtn: {
    width: isPhone ? 44 : isTablet ? 76 : 40, height: isPhone ? 44 : isTablet ? 76 : 40, borderRadius: radius.md,
    backgroundColor: 'rgba(0,100,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(28,187,61,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  timerBadge: {
    width: isSmallPhone ? 40 : isPhone ? 46 : isTablet ? 80 : 60,
    height: isSmallPhone ? 40 : isPhone ? 46 : isTablet ? 80 : 60,
    borderRadius: isSmallPhone ? 20 : isPhone ? 23 : isTablet ? 40 : 30,
    borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  timerBadgeGreen: {
    backgroundColor: '#0f2d17',
    borderColor: '#1CBB3D',
  },
  timerBadgeGold: {
    backgroundColor: '#1c1000',
    borderColor: '#b45309',
  },
  timerBadgeRed: {
    backgroundColor: '#3d0a0a',
    borderColor: '#991b1b',
  },
  timerText: {
    color: '#fff', fontWeight: '900', fontSize: isTablet ? fonts.sizes.xxl : fonts.sizes.lg,
  },

  // ── Middle ──
  middle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    gap: spacing.sm,
  },
  tableWrap: { flex: 1, minWidth: 0, position: 'relative' },
  sideCardLeft: {
    position: 'absolute',
    left: 0,
    top: '50%',
    zIndex: 20,
    transform: [{ translateX: -60 }, { translateY: -30 }],
  },
  sideCardRight: {
    position: 'absolute',
    right: 0,
    top: '50%',
    zIndex: 20,
    transform: [{ translateX: 60 }, { translateY: -30 }],
  },
  tableArea: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative', paddingTop: isSmallPhone ? 6 : isPhone ? 10 : 16, paddingBottom: isSmallPhone ? 80 : isPhone ? 100 : isTablet ? 180 : 120 },
  oppCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    transform: [{ translateY: isSmallPhone ? -10 : -20 }],
  },
  tableSideBadgeLeft: {
    position: 'absolute',
    left: 0,
    top: '50%',
    zIndex: 15,
    transform: [{ translateY: -52 }, { translateX: -36 }],
  },
  tableSideBadgeRight: {
    position: 'absolute',
    right: 0,
    top: '50%',
    zIndex: 15,
    transform: [{ translateY: -52 }, { translateX: 36 }],
  },
  tableOuter: {
    width: '86%',
    maxWidth: 900,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    padding: 16,
  },
  tableFrame: {
    width: '90%',
    maxWidth: isTablet ? 1280 : 1020,
    alignSelf: 'center',
    backgroundColor: '#060e06',
    borderRadius: 999,
    padding: 6,
    borderWidth: 8,
    borderColor: '#0d1a0d',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 12px 40px rgba(0,0,0,0.45)' } as any)
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.45, shadowRadius: 18, elevation: 14 }),
  },
  tableBg: {
    flex: 1,
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
  },
  tableFelt: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  watermarkImage: {
    width: 130,
    height: 80,
    opacity: 0.1,
  },
  boardTiles: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md },
  boardMultiWrap: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.md },
  boardRow: { flexDirection: 'row', alignItems: 'center' },
  snakeBoardFrame: { alignSelf: 'center' },
  snakeBoard: { alignSelf: 'center', gap: 0 },
  ghostArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fbbf24',
    alignSelf: 'center',
    marginBottom: 2,
  },
  ghostArrowActive: {
    borderTopColor: '#f97316',
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
  },
  snakeRow: { alignItems: 'center', gap: 0 },
  snakeCorner: { borderRadius: 4, backgroundColor: '#d4cfc6' },
  playerCardWithTimer: { flexDirection: 'row', alignItems: 'center', gap: isSmallPhone ? 8 : 20, marginBottom: 8 },
  playerCardFxWrap: { position: 'relative', alignSelf: 'center' },
  playerFxLayer: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  emojiBubble: {
    position: 'absolute',
    paddingHorizontal: 4,
    paddingVertical: 0,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  emojiBubbleText: { color: '#fff', fontSize: 26, fontWeight: '900' },
  drawBubble: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(28,187,61,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(28,187,61,0.35)',
  },
  drawBubbleText: { color: '#bbf7d0', fontSize: 14, fontWeight: '900' },

  // ── Hand section ──
  handSection: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'column',
    paddingHorizontal: spacing.sm,
    zIndex: 200,
  },
  actionBar: {
    position: 'absolute',
    top: -28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    zIndex: 300,
  },
  jogarBtn: {
    backgroundColor: '#0f2d17',
    borderRadius: radius.full,
    paddingVertical: isSmallPhone ? 6 : isPhone ? 8 : isTablet ? 16 : 11,
    paddingHorizontal: isSmallPhone ? 14 : isPhone ? 20 : isTablet ? 40 : 28,
    borderWidth: 2,
    borderColor: '#1CBB3D',
  },
  jogarBtnText: { color: '#fff', fontWeight: '900', fontSize: isSmallPhone ? fonts.sizes.xs : isPhone ? fonts.sizes.sm : isTablet ? fonts.sizes.xl : fonts.sizes.md, letterSpacing: 0.4 },
  sideBtn: {
    width: isSmallPhone ? 32 : isPhone ? 38 : isTablet ? 60 : 44,
    height: isSmallPhone ? 32 : isPhone ? 38 : isTablet ? 60 : 44,
    borderRadius: isSmallPhone ? 16 : isPhone ? 19 : isTablet ? 30 : 22,
    backgroundColor: '#0f2d17',
    borderWidth: 2, borderColor: '#1CBB3D',
    alignItems: 'center', justifyContent: 'center',
  },
  drawBtn: {
    borderRadius: radius.full,
    padding: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.35), 0 0 18px rgba(28,187,61,0.30)' } as any)
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 10 }),
  },
  drawBtnInner: {
    borderRadius: radius.full,
    paddingVertical: isSmallPhone ? 6 : isPhone ? 8 : isTablet ? 16 : 11,
    paddingHorizontal: isSmallPhone ? 12 : isPhone ? 18 : isTablet ? 36 : 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  drawBtnText: { color: '#052e16', fontWeight: '900', fontSize: isSmallPhone ? fonts.sizes.xs : isPhone ? fonts.sizes.sm : isTablet ? fonts.sizes.xl : fonts.sizes.md, letterSpacing: 0.3 },
  passBtn: {
    backgroundColor: '#1c1000',
    borderRadius: radius.full,
    paddingVertical: isSmallPhone ? 6 : isPhone ? 8 : isTablet ? 16 : 11,
    paddingHorizontal: isSmallPhone ? 14 : isPhone ? 20 : isTablet ? 40 : 28,
    borderWidth: 2, borderColor: '#b45309',
  },
  passBtnText: { color: '#fff', fontWeight: '900', fontSize: isSmallPhone ? fonts.sizes.xs : isPhone ? fonts.sizes.sm : isTablet ? fonts.sizes.xl : fonts.sizes.md, letterSpacing: 0.4 },
  cancelBtn: {
    width: isSmallPhone ? 32 : isPhone ? 38 : isTablet ? 60 : 44,
    height: isSmallPhone ? 32 : isPhone ? 38 : isTablet ? 60 : 44,
    borderRadius: isSmallPhone ? 16 : isPhone ? 19 : isTablet ? 30 : 22,
    backgroundColor: '#3d0a0a',
    borderWidth: 2, borderColor: '#8b1a1a',
    alignItems: 'center', justifyContent: 'center',
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 8,
    paddingBottom: 4,
    paddingLeft: 6,
  },
  handRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  handScroll: {
    flex: 1,
    zIndex: 10,
    ...(Platform.OS === 'web'
      ? ({
          overflowX: 'auto',
          overflowY: 'hidden',
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth',
        } as any)
      : null),
  },
  handContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingTop: 8,
    paddingBottom: 4,
  },
  handTileWrap: {
    alignItems: 'center',
  },
  handTileSelected: {
    transform: [{ translateY: -12 }],
  },
  // Downward-pointing triangle above a playable tile (same technique as ghostArrow)
  handTileArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1CBB3D',
    alignSelf: 'center',
    marginBottom: 3,
  },

  // Settings modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  settingsCard: {
    width: Platform.OS === 'web' ? 640 : '92%',
    maxWidth: isTablet ? 580 : 440,
    maxHeight: Platform.OS === 'web' ? 560 : '85%',
    backgroundColor: colors.bgCard,
    borderWidth: 3, borderColor: '#BBFF00',
    borderRadius: radius.xl,
    padding: isPhone ? 12 : SETTINGS_CARD_PAD,
    gap: isPhone ? 8 : SETTINGS_ITEM_GAP,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.45)' } as any) : shadows.card),
  },
  settingsTextureWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  settingsTexture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    width: '140%',
    height: '140%',
    top: '-20%',
    left: '-20%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover', objectPosition: 'center' } as any) : null),
  } as any,
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsTitle: {
    fontSize: isPhone ? fonts.sizes.xl : fonts.sizes.xxxl,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SETTINGS_CARD_PAD,
    paddingVertical: isPhone ? 8 : SETTINGS_ITEM_GAP,
    borderRadius: radius.lg,
    borderWidth: 0,
    overflow: 'hidden',
  },
  settingLabel: {
    fontSize: isPhone ? fonts.sizes.md : fonts.sizes.xl,
    color: '#fff',
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  leaveBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#7f1d1d',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  leaveBtnText: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.md },
  // Leave confirm modal - Estilo KYC
  confirmCard: {
    width: '92%',
    maxWidth: isTablet ? 520 : 380,
    maxHeight: '88%',
    backgroundColor: '#082006',
    borderRadius: radius.xl,
    padding: isPhone ? spacing.md : spacing.xl,
    borderWidth: 2,
    borderColor: '#0F400B',
    alignItems: 'center',
    gap: spacing.md,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } as any)
      : {
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.5,
          shadowRadius: 16,
        }),
  },
  confirmIcon: { marginBottom: spacing.sm },
  confirmTitle: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.xl, textAlign: 'center' },
  confirmText: { color: '#a3c4a3', fontWeight: '600', fontSize: fonts.sizes.sm, textAlign: 'center', marginTop: spacing.xs },
  confirmWarningBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    width: '100%',
    marginTop: spacing.sm,
  },
  confirmWarningText: { color: '#ef4444', fontWeight: '700', fontSize: fonts.sizes.sm, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, width: '100%' },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#4F4E47',
    borderWidth: 2,
    borderColor: '#4F4E47',
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmCancelText: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.md },
  confirmLeaveBtn: {
    flex: 1,
    backgroundColor: '#1F5D18',
    borderWidth: 2,
    borderColor: '#1F5D18',
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmLeaveText: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.md },

  // Result modal - Estilo baseado nas imagens
  resultCard: {
    width: '88%',
    maxWidth: isTablet ? 480 : 340,
    maxHeight: '88%',
    borderRadius: radius.xl,
    paddingVertical: isPhone ? spacing.md : spacing.xxl,
    paddingHorizontal: isPhone ? spacing.md : spacing.xl,
    alignItems: 'center',
    gap: isPhone ? 6 : spacing.md,
  },
  resultCardWinner: {
    backgroundColor: '#082006',
    borderWidth: 2,
    borderColor: '#0F400B',
  },
  resultCardLoser: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#4F4E47',
  },
  resultIcon: { marginBottom: 0 },
  resultTitle: { fontSize: isPhone ? fonts.sizes.md : fonts.sizes.xl, fontWeight: '900', textAlign: 'center' },
  resultTitleWinner: { color: '#facc15' },
  resultTitleLoser: { color: 'rgba(255,255,255,0.7)' },
  resultPrize: { fontSize: isPhone ? fonts.sizes.lg : fonts.sizes.xxl, fontWeight: '900', textAlign: 'center' },
  resultPrizeWinner: { color: '#facc15' },
  resultPrizeLoser: { color: 'rgba(255,255,255,0.6)' },
  resultBtn: {
    backgroundColor: '#1F5D18',
    borderRadius: radius.full,
    paddingVertical: isPhone ? 9 : 12,
    paddingHorizontal: isPhone ? 16 : 28,
    width: '80%',
    alignItems: 'center',
  },
  resultBtnDisabled: { opacity: 0.75 },
  resultBtnText: { color: '#fff', fontWeight: '800', fontSize: isPhone ? fonts.sizes.sm : fonts.sizes.md },
  resultOrText: { color: 'rgba(255,255,255,0.5)', fontSize: fonts.sizes.xs, fontWeight: '600' },
  resultSecondaryBtn: {
    backgroundColor: '#4F4E47',
    borderRadius: radius.full,
    paddingVertical: isPhone ? 9 : 12,
    paddingHorizontal: isPhone ? 16 : 28,
    width: '80%',
    alignItems: 'center',
  },
  resultSecondaryText: { color: '#fff', fontWeight: '700', fontSize: isPhone ? fonts.sizes.sm : fonts.sizes.md },

  // Round banner overlay
  roundBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    pointerEvents: 'none' as any,
  },
  roundBannerCard: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderWidth: 2,
    borderColor: '#1CBB3D',
    borderRadius: radius.xl,
    paddingVertical: 24,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 32px rgba(0,0,0,0.7)' } as any) : shadows.card),
  },
  roundBannerTitle: {
    color: '#1CBB3D',
    fontSize: fonts.sizes.xxxl,
    fontWeight: '900',
    textAlign: 'center',
  },
  roundBannerPoints: {
    color: '#facc15',
    fontSize: fonts.sizes.xxl,
    fontWeight: '800',
    textAlign: 'center',
  },
  roundBannerScores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  roundBannerScoreLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
  },
  roundBannerScoreValue: {
    color: '#fff',
    fontSize: fonts.sizes.xxl,
    fontWeight: '900',
  },
  roundBannerScoreSep: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
  },
  roundBannerRound: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
    marginTop: 4,
  },
});
