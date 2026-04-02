import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ImageBackground, Image,
  TouchableOpacity, Modal, Alert, Animated, Pressable, ActivityIndicator,
  Platform, useWindowDimensions, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Socket } from 'socket.io-client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import {
  IconTrophy, IconSettings, IconAlert, IconX, IconFrown,
  IconVolumeUp, IconMusic,
} from '../components/Icons';
import { colors, spacing, fonts, radius, shadows, backgroundCoverFix } from '../theme';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useGameStore, Tile, GameState, PlacedTile } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { RootStackParamList } from '../navigation';

type PlaySide = 'left' | 'right' | 'top' | 'bottom';
type PlayOption = { side: PlaySide; flipped: boolean };
type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

const SETTINGS_CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const SETTINGS_ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

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
    6: [0, 2, 3, 5, 6, 8],
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
  if (!game.firstPlayMade && (!game.board || game.board.length === 0)) return [{ side: 'left', flipped: false }];
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

function buildLinearBoardTiles(board: PlacedTile[]): Tile[] {
  if (!board || board.length === 0) return [];
  const seq: Tile[] = [];
  for (let i = 0; i < board.length; i++) {
    const pt = board[i];
    const effective: Tile = pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile;
    if (i === 0) {
      seq.push(effective);
      continue;
    }
    if (pt.side === 'left' || pt.side === 'top') seq.unshift(effective);
    else seq.push(effective);
  }
  return seq;
}

// ─── Pip positions ────────────────────────────────────────────────────────────
// [topFraction, leftFraction] within each half, matching standard domino layout.
const PIP_POSITIONS: Record<number, [number, number][]> = {
  0: [],
  1: [[0.50, 0.50]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.50, 0.50], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.25, 0.75], [0.75, 0.25], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.25, 0.75], [0.50, 0.50], [0.75, 0.25], [0.75, 0.75]],
  6: [[0.18, 0.25], [0.50, 0.25], [0.82, 0.25], [0.18, 0.75], [0.50, 0.75], [0.82, 0.75]],
};

function TileHandImage({ tile, selected, playable, onPress }: {
  tile: Tile; selected?: boolean; playable?: boolean; onPress?: () => void;
}) {
  return (
    <DominoTile
      tile={tile}
      size="hand"
      selected={selected}
      style={!playable ? { opacity: 0.38 } : undefined}
      onPress={onPress}
    />
  );
}

// ─── Tile size presets ────────────────────────────────────────────────────────
type DominoTileSize = 'icon' | 'hand' | 'sm' | 'md';
type DominoTileProps = {
  tile: Tile;
  size?: DominoTileSize;
  horizontal?: boolean;
  tileScale?: number;
  selected?: boolean;
  onPress?: () => void;
  style?: any;
};

const TILE_DIMS: Record<DominoTileSize, { short: number; long: number; pip: number; corner: number }> = {
  icon: { short: 16, long: 28, pip: 2, corner: 2 },
  hand: { short: 32, long: 56, pip: 5, corner: 6 },
  sm:   { short: 32, long: 64, pip: 5, corner: 6 },
  md:   { short: 44, long: 88, pip: 7, corner: 8 },
};

// Ivory white matching the PNG tile colour
const TILE_BG    = '#f8f6f0';
const TILE_LINE  = '#c8c4bc';
const TILE_PIP   = '#1c1c1e';

function DominoTile({ tile, size = 'md', horizontal, tileScale = 1, selected, onPress, style }: DominoTileProps) {
  const base   = TILE_DIMS[size] ?? TILE_DIMS.md;
  const S      = Math.round(base.short  * tileScale);
  const L      = Math.round(base.long   * tileScale);
  const pip    = Math.max(2, Math.round(base.pip    * tileScale));
  const corner = Math.max(2, Math.round(base.corner * tileScale));
  const divW   = Math.max(1, Math.round(tileScale));

  const tileW  = horizontal ? L : S;
  const tileH  = horizontal ? S : L;
  const halfW  = horizontal ? (L - divW) / 2 : S;
  const halfH  = horizontal ? S : (L - divW) / 2;

  const selectedStyle = selected
    ? (Platform.OS === 'web'
        ? ({ borderColor: colors.primary, boxShadow: '0 0 10px rgba(74,222,128,0.6)' } as any)
        : { borderColor: colors.primary, shadowColor: '#4ade80', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 6 })
    : { borderColor: TILE_LINE };

  const tileShadow = Platform.OS === 'web'
    ? ({ boxShadow: '0px 6px 10px rgba(0,0,0,0.55)' } as any)
    : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.45,
        shadowRadius: 7,
        elevation: 9,
      };

  const content = (
    <View style={[
      {
        width: tileW,
        height: tileH,
        backgroundColor: TILE_BG,
        borderRadius: corner,
        borderWidth: selected ? 2 : 1,
        flexDirection: horizontal ? 'row' : 'column',
        overflow: 'hidden',
      },
      !selected && tileShadow,
      selectedStyle,
      style,
    ]}>
      <Pips value={tile[0]} halfW={halfW} halfH={halfH} dot={pip} />
      <View style={horizontal
        ? { width: divW, height: tileH, backgroundColor: TILE_LINE }
        : { width: tileW, height: divW, backgroundColor: TILE_LINE }
      } />
      <Pips value={tile[1]} halfW={halfW} halfH={halfH} dot={pip} />
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ borderRadius: corner }}>{content}</TouchableOpacity>;
  }
  return content;
}

function Pips({ value, halfW, halfH, dot }: { value: number; halfW: number; halfH: number; dot: number }) {
  const spots = PIP_POSITIONS[value] ?? [];
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const edge = Math.max(dot * 0.8, Math.min(halfW, halfH) * 0.08);
  const minCenter = dot / 2 + edge;
  return (
    <View style={{ width: halfW, height: halfH }}>
      {spots.map(([topFrac, leftFrac], idx) => (
        <View
          key={idx}
          style={{
            position: 'absolute',
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: TILE_PIP,
            top:  clamp(topFrac * halfH, minCenter, halfH - minCenter) - dot / 2,
            left: clamp(leftFrac * halfW, minCenter, halfW - minCenter) - dot / 2,
          }}
        />
      ))}
    </View>
  );
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
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)',
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

function ScoreBox({ is4Player, myScore, oppScore }: { is4Player: boolean; myScore: number; oppScore: number }) {
  const leftLabel = is4Player ? 'Vocês:' : 'Você:';
  const rightLabel = is4Player ? 'Eles:' : 'Ele:';
  return (
    <View style={scoreStyles.box}>
      <View style={scoreStyles.row}>
        <Text style={scoreStyles.label}>{leftLabel}</Text>
        <Text style={scoreStyles.scoreValue}>{myScore}</Text>
      </View>
      <View style={scoreStyles.row}>
        <Text style={scoreStyles.label}>{rightLabel}</Text>
        <Text style={scoreStyles.scoreValue}>{oppScore}</Text>
      </View>
    </View>
  );
}
const scoreStyles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingLeft: 28,
    paddingRight: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(181,228,85,0.30)',
    minWidth: 180,
    ...(Platform.OS === 'web' ? ({
      backdropFilter: 'blur(12px)',
      backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05))',
    } as any) : null),
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  label: { color: '#fff', fontSize: fonts.sizes.md, fontWeight: '700' },
  scoreValue: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.md },
});

// ─── Opponent card (top centre) ───────────────────────────────────────────────

function OpponentCard({ player, tileCount, isTurn }: { player: any; tileCount: number; isTurn: boolean }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  const avatarUri: string | undefined = player?.avatarUrl ?? player?.avatar;
  return (
    <LinearGradient
      colors={['rgba(8,38,14,0.97)', 'rgba(32,100,22,0.93)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[oppStyles.card, isTurn && oppStyles.cardTurn]}
    >
      <View style={oppStyles.sideSlot}>
        <DominoTile tile={[1, 1]} size="icon" />
        <Text style={oppStyles.tileCount}>{tileCount}</Text>
      </View>

      <View style={oppStyles.nameWrap}>
        <Text style={oppStyles.name} numberOfLines={1}>{name}</Text>
        <Text style={oppStyles.sub}>{tileCount}/7</Text>
      </View>

      <View style={[oppStyles.sideSlot, oppStyles.sideSlotRight]}>
        <View style={oppStyles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={oppStyles.avatarImg} />
          ) : (
            <Text style={oppStyles.avatarText}>{name[0]?.toUpperCase?.() ?? '?'}</Text>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}
const oppStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.55)',
    minWidth: 200,
    minHeight: 48,
  },
  cardTurn: Platform.OS === 'web'
    ? ({ borderColor: 'rgba(74,222,128,0.65)', boxShadow: '0 0 14px rgba(74,222,128,0.45)' } as any)
    : { borderColor: 'rgba(74,222,128,0.65)', shadowColor: '#4ade80', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  sideSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 62,
  },
  sideSlotRight: { justifyContent: 'flex-end' },
  tileIcon: { width: 16, height: 22 },
  tileCount: {
    color: '#c8c8c8',
    fontWeight: '800',
    fontSize: 24,
    lineHeight: 26,
  },
  nameWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.sm, textAlign: 'center' },
  sub:  { color: '#fff', fontSize: fonts.sizes.sm, textAlign: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.sm },
});

// ─── Side player card (4p left/right) ────────────────────────────────────────

function SidePlayerCard({ player, tileCount, isTurn }: { player: any; tileCount: number; isTurn: boolean }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  const avatarUri: string | undefined = player?.avatarUrl ?? player?.avatar;
  return (
    <LinearGradient
      colors={['rgba(8,38,14,0.97)', 'rgba(32,100,22,0.93)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[sideStyles.card, isTurn && sideStyles.cardTurn]}
    >
      <View style={sideStyles.sideSlot}>
        <DominoTile tile={[1, 1]} size="icon" />
        <Text style={sideStyles.tileCount}>{tileCount}</Text>
      </View>

      <View style={sideStyles.nameWrap}>
        <Text style={sideStyles.name} numberOfLines={1}>{name}</Text>
        <Text style={sideStyles.sub}>{tileCount}/7</Text>
      </View>

      <View style={[sideStyles.sideSlot, sideStyles.sideSlotRight]}>
        <View style={sideStyles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={sideStyles.avatarImg} />
          ) : (
            <Text style={sideStyles.avatarText}>{name[0]?.toUpperCase?.() ?? '?'}</Text>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}
const sideStyles = StyleSheet.create({
  card: {
    borderColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 12,
    gap: 8,
    width: 180,
    minWidth: 180,
    minHeight: 48,
  },
  cardTurn: Platform.OS === 'web'
    ? ({ borderColor: 'rgba(74,222,128,0.65)', boxShadow: '0 0 14px rgba(74,222,128,0.45)' } as any)
    : { borderColor: 'rgba(74,222,128,0.65)', shadowColor: '#4ade80', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  sideSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 62,
  },
  sideSlotRight: { justifyContent: 'flex-end' },
  tileIcon: { width: 16, height: 22 },
  tileCount: {
    color: '#c8c8c8',
    fontWeight: '800',
    fontSize: 24,
    lineHeight: 26,
  },
  nameWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  name: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.sm, textAlign: 'center' },
  sub:  { color: '#fff', fontSize: fonts.sizes.sm, textAlign: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.sm },
});

// ─── My player card (right side, below emoji) ────────────────────────────────

function MyPlayerCard({ name, hand, isMyTurn, avatarUri, onSelectEmoji }: {
  name: string; hand: number; isMyTurn: boolean; avatarUri?: string; onSelectEmoji?: (e: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <LinearGradient
      colors={['rgba(32,100,22,0.93)', 'rgba(8,38,14,0.97)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[myCardStyles.card, isMyTurn && myCardStyles.cardMyTurn]}
    >
      <View style={myCardStyles.sideSlot}>
        <DominoTile tile={[1, 1]} size="icon" />
        <Text style={myCardStyles.tileCount}>{hand}</Text>
      </View>

      <View style={myCardStyles.nameWrap}>
        <Text style={myCardStyles.name} numberOfLines={1}>{name}</Text>
        <Text style={myCardStyles.sub}>{hand}/7</Text>
      </View>

      <View style={[myCardStyles.sideSlot, myCardStyles.sideSlotRight]}>
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
      </View>
    </LinearGradient>
  );
}
const myCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.55)',
    minWidth: 200,
    minHeight: 48,
  },
  cardMyTurn: { borderColor: 'rgba(74,222,128,0.65)' },
  sideSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 62,
  },
  sideSlotRight: { justifyContent: 'flex-end' },
  tileIcon: { width: 16, height: 22 },
  tileCount: {
    color: '#c8c8c8',
    fontWeight: '800',
    fontSize: 24,
    lineHeight: 26,
  },
  nameWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  name: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.sm, textAlign: 'center' },
  sub:  { color: '#fff', fontSize: fonts.sizes.sm, textAlign: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.sm },
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
  const winnerId = result?.winnerId ? String(result.winnerId) : '';
  const isWinner = !!winnerId && winnerId === String(userId ?? '');
  const betAmount = typeof result?.betAmount === 'number' ? result.betAmount : Number(result?.betAmount ?? 0);
  const prizePerWinner = typeof result?.prizePerWinner === 'number' ? result.prizePerWinner : Number(result?.prizePerWinner ?? 0);
  const net = winnerId ? (isWinner ? (prizePerWinner - betAmount) : -betAmount) : 0;
  const netAbs = Math.abs(net);
  return (
    <View style={styles.resultCard}>
      {isWinner ? (
        <IconTrophy size={48} color={colors.gold} accessibilityLabel="Troféu" />
      ) : (
        <IconFrown size={48} color={colors.textSecondary} accessibilityLabel="Rosto triste" />
      )}
      <Text style={styles.resultTitle}>
        {!winnerId ? 'Fim de jogo' : isWinner ? 'Você ganhou!' : 'Você perdeu!'}
      </Text>
      {winnerId ? (
        <Text style={styles.resultPrize}>
          {net >= 0 ? 'Você ganhou' : 'Você perdeu'}: R$ {netAbs.toFixed(2)}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.resultBtn, playAgainLoading && styles.resultBtnDisabled]}
        onPress={onPlayAgain}
        disabled={playAgainLoading}
      >
        <Text style={styles.resultBtnText}>{playAgainLoading ? 'Procurando...' : 'Jogar novamente'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.resultSecondaryBtn} onPress={onExit} disabled={playAgainLoading}>
        <Text style={styles.resultSecondaryText}>Voltar ao menu</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GameScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { user } = useAuthStore();
  const { currentGame, selectedTile, gameResult, lastQueue, setGame, setSelectedTile, setGameResult, clearGame } = useGameStore();

  const { width: viewportWidth } = useWindowDimensions();
  const [feltWidth, setFeltWidth] = useState(0);

  const [turnTimer, setTurnTimer]       = useState(30);
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

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef      = useRef<Socket | null>(null);
  const errorFadeAnim  = useRef(new Animated.Value(0)).current;
  const joinPulseAnim  = useRef(new Animated.Value(0)).current;
  const prevStateRef   = useRef<GameState | null>(null);
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
  const tableHeight = Math.round(Math.min(viewportWidth * 0.82, 880) / 2.4);
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

  // Scores (tile counts per team)
  const myTeam  = currentGame?.players[myPlayerIndex]?.team ?? ((mySeat % 2) + 1);
  const myTeamTiles  = currentGame?.players.filter((p) => p.team === myTeam)
    .reduce((s, p) => s + (p.hand?.length ?? 0), 0) ?? 0;
  const oppTeamTiles = currentGame?.players.filter((p) => p.team !== myTeam)
    .reduce((s, p) => s + (p.hand?.length ?? 0), 0) ?? 0;

  // ── Timer ──────────────────────────────────────────────────────────────────
  const resetTurnTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTurnTimer(30);
    timerRef.current = setInterval(() => {
      setTurnTimer((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => { if (turnTimer === 0 && isMyTurn) handlePass(); }, [turnTimer, isMyTurn]);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

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

        const onGameState = (state: GameState) => {
          didReceiveState = true;
          if (joinTimeout) { clearTimeout(joinTimeout); joinTimeout = null; }
          const normalized = normalizeGameState(state);
          const prev = prevStateRef.current;
          setGame(normalized);
          resetTurnTimer();
          const me = normalized.players.find((p) => p.userId === myUserId) ?? normalized.players.find((p) => p.seat === 0);
          const newHand = me?.hand ?? [];
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
          }
          prevStateRef.current = normalized;
        };

        const onEnded = (result: any) => { if (timerRef.current) clearInterval(timerRef.current); setGameResult(result); setResultModal(true); };
        const onGameError = ({ message }: { message: string }) => showError(message);
        const onTimeout = ({ userId }: { userId: string }) => { if (String(userId) === myUserId) showError('Tempo esgotado — sua vez foi pulada'); };
        const onEmoji = ({ userId, emoji }: { userId: string; emoji: string }) => triggerEmojiFx(String(userId), String(emoji));
        const onDisconnect = () => setDisconnected(true);
        const onConnect = () => { setDisconnected(false); socket.emit('game:join', { gameId }); };

        socket.on('game:state', onGameState);
        socket.on('game:ended', onEnded);
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
          socket.off('game:state', onGameState);
          socket.off('game:ended', onEnded);
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
    setDisconnected(false);
    setGameError(null);
    setJoinAttempt((n) => n + 1);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleTileSelect = (tile: Tile, handIndex: number) => {
    if (!isMyTurn) return;
    if ((validMovesMap.get(tileKey(tile)) ?? []).length === 0) { showError('Esta pedra não pode ser jogada agora'); return; }
    const isSame = selectedTile?.handIndex === handIndex;
    setSelectedTile(isSame ? null : { tile, handIndex });
  };

  const handlePlayTile = useCallback(async (side: PlaySide) => {
    if (!selectedTile) return;
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
    clearGame();
    navigation.replace('Main');
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
      <ImageBackground
        source={require('../../assets/background.png')}
        style={[styles.bg, backgroundCoverFix]}
        resizeMode="cover"
      >
        <View style={styles.bgOverlay} />
        <SafeAreaView style={[styles.container, styles.centered]}>
          <View style={styles.joinWrap}>
            <Animated.View style={[styles.joinGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
            <LinearGradient
              colors={['rgba(187,255,0,0.20)', 'rgba(0,0,0,0.55)', 'rgba(74,222,128,0.18)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.joinCard}
            >
              <View style={styles.joinSpinnerRow}>
                <ActivityIndicator color="#4ade80" size="large" />
              </View>
              <Text style={styles.joinTitle}>Entrando na partida...</Text>
              <Text style={styles.joinSubtitle}>Conectando e preparando a mesa</Text>
              <View style={styles.joinMiniRow}>
                <Animated.View style={{ transform: [{ translateY: tileLift }, { rotate: '-10deg' }] }}>
                  <MiniDomino left={6} right={6} />
                </Animated.View>
                <Animated.View style={{ transform: [{ translateY: tileLift }, { rotate: '0deg' }] }}>
                  <MiniDomino left={5} right={3} />
                </Animated.View>
                <Animated.View style={{ transform: [{ translateY: tileLift }, { rotate: '10deg' }] }}>
                  <MiniDomino left={2} right={1} />
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
      </ImageBackground>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const boardCount = currentGame?.board?.length ?? 0;
  const boardTilesLinear = buildLinearBoardTiles(currentGame.board ?? []);
  const baseGap = 6;
  const minScale = 0.34;
  const calcScale = (() => {
    if (!feltWidth || boardTilesLinear.length === 0) {
      return Math.min(1, Math.max(minScale, 11 / Math.max(11, boardCount)));
    }
    let totalBase = 0;
    for (const t of boardTilesLinear) {
      const isHorizontal = t[0] !== t[1];
      const baseW = isHorizontal ? 64 : 32; // TILE_DIMS.sm long/short
      totalBase += baseW;
    }
    const gaps = Math.max(0, boardTilesLinear.length - 1) * baseGap;
    const available = Math.max(0, feltWidth - spacing.md * 2);
    const neededScale = available > 0 ? available / (totalBase + gaps) : 1;
    return Math.min(1, Math.max(minScale, neededScale));
  })();
  const boardScale = calcScale;

  const boardLines: Tile[][] = (() => {
    if (!feltWidth || boardTilesLinear.length === 0) return [];
    const available = Math.max(0, feltWidth - spacing.md * 2);
    let totalBase = 0;
    for (const t of boardTilesLinear) {
      const isHorizontal = t[0] !== t[1];
      const baseW = isHorizontal ? 64 : 32;
      totalBase += baseW;
    }
    const gaps = Math.max(0, boardTilesLinear.length - 1) * baseGap;
    const totalScaled = (totalBase + gaps) * boardScale;
    if (totalScaled <= available) return [];

    const lines: Tile[][] = [];
    let line: Tile[] = [];
    let acc = 0;
    for (const t of boardTilesLinear) {
      const isHorizontal = t[0] !== t[1];
      const baseW = isHorizontal ? 64 : 32;
      const add = baseW * minScale + (line.length > 0 ? baseGap : 0);
      if (acc + add > available && line.length > 0) {
        lines.push(line);
        line = [];
        acc = 0;
      }
      line.push(t);
      acc += add;
    }
    if (line.length > 0) lines.push(line);
    return lines;
  })();

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
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.bg, backgroundCoverFix]}
      resizeMode="cover"
    >
      <View style={styles.bgOverlay} />
      <SafeAreaView style={styles.container}>

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
        <View style={styles.topCenter}>
          {currentGame?.status === 'playing' && (
            <View style={[styles.timerBadge, turnTimer <= 10 && styles.timerBadgeUrgent]}>
              <Text style={[styles.timerText, turnTimer <= 10 && styles.timerTextUrgent]}>
                {turnTimer}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.gearBtn} onPress={() => setSettingsVisible(true)}>
          <IconSettings size={24} color={colors.textPrimary} accessibilityLabel="Configurações" />
        </TouchableOpacity>
      </View>

      {/* ── Middle: [left player] [table] [emoji] [right player] ── */}
      <View style={styles.middle}>
        {/* Table */}
        <View style={styles.tableWrap}>
          <View style={styles.tableArea}>
            {/* Score box — enlarged, anchored to the left edge of the table area */}
            <View style={styles.scoreOverlay}>
              <ScoreBox is4Player={is4Player} myScore={myTeamTiles} oppScore={oppTeamTiles} />
            </View>

            <View style={[styles.tableOuter, { height: tableHeight }]}>
              {/* Top opponent card — centred on the oval's top rim */}
              {topOpponent && (
                <View style={styles.oppCardOverlay}>
                  <View style={styles.playerCardFxWrap}>
                    <OpponentCard player={topOpponent} tileCount={topOpponent.hand.length} isTurn={turnUserId === topOpponent.userId} />
                    {renderPlayerFx(topOpponent.userId, 'top')}
                  </View>
                </View>
              )}

              {/* Side player cards — centred on the oval's left/right rims */}
              {is4Player && leftOpponent && (
                <View style={styles.tableSideBadgeLeft}>
                  <View style={styles.playerCardFxWrap}>
                    <SidePlayerCard player={leftOpponent} tileCount={leftOpponent.hand.length} isTurn={turnUserId === leftOpponent.userId} />
                    {renderPlayerFx(leftOpponent.userId, 'left')}
                  </View>
                </View>
              )}
              {is4Player && rightOpponent && (
                <View style={styles.tableSideBadgeRight}>
                  <View style={styles.playerCardFxWrap}>
                    <SidePlayerCard player={rightOpponent} tileCount={rightOpponent.hand.length} isTurn={turnUserId === rightOpponent.userId} />
                    {renderPlayerFx(rightOpponent.userId, 'right')}
                  </View>
                </View>
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

                {currentGame.board.length > 0 && boardLines.length <= 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.boardTiles, { gap: baseGap }]}>
                    {boardTilesLinear.map((tile, i) => (
                      <View key={i}>
                        <DominoTile tile={tile} size="sm" horizontal={tile[0] !== tile[1]} tileScale={boardScale} />
                      </View>
                    ))}
                  </ScrollView>
                )}
                {currentGame.board.length > 0 && boardLines.length > 1 && (
                  <View style={styles.boardMultiWrap}>
                    {boardLines.map((line, li) => (
                      <View key={li} style={[styles.boardRow, { gap: baseGap }]}>
                        {line.map((tile, i) => (
                          <View key={`${li}-${i}`}>
                            <DominoTile tile={tile} size="sm" horizontal={tile[0] !== tile[1]} tileScale={minScale} />
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}

              </View>
            </View>
          </View>

          {/* Hand section — action bar above tiles, player card beside */}
          <View style={styles.handSection}>

            {/* ── Action bar ── */}
            {isMyTurn && (
              <View style={styles.actionBar}>
                {selectedTile && uniqueSides.length === 1 && (
                  <TouchableOpacity style={styles.jogarBtn} onPress={handlePlayImmediate} activeOpacity={0.85}>
                    <Text style={styles.jogarBtnText}>Jogar</Text>
                  </TouchableOpacity>
                )}
                {selectedTile && uniqueSides.length > 1 && uniqueSides.map((side) => (
                  <TouchableOpacity key={side} style={styles.sideBtn} onPress={() => handlePlayTile(side)} activeOpacity={0.8}>
                    <Text style={styles.sideBtnText}>
                      {side === 'left' ? '← Esquerda' : side === 'right' ? 'Direita →' : side === 'top' ? '↑ Cima' : '↓ Baixo'}
                    </Text>
                  </TouchableOpacity>
                ))}
                {!selectedTile && hasBoneyard && (
                  <Animated.View style={{ transform: [{ scale: drawPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
                    <TouchableOpacity style={styles.drawBtn} onPress={handleDraw} activeOpacity={0.9}>
                      <Text style={styles.drawBtnText}>+ Comprar</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
                {!selectedTile && !hasValidMoves && !hasBoneyard && (
                  <TouchableOpacity style={styles.passBtn} onPress={handlePass} activeOpacity={0.8}>
                    <Text style={styles.passBtnText}>Passar vez</Text>
                  </TouchableOpacity>
                )}
                {selectedTile && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedTile(null)}>
                    <IconX size={14} color="#fff" accessibilityLabel="Cancelar" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── Hand tiles + player card ── */}
            <View style={styles.handRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.handScroll}
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
                      <TileHandImage
                        tile={tile}
                        selected={isSelected}
                        playable={!isMyTurn || isPlayable}
                        onPress={() => handleTileSelect(tile, i)}
                      />
                      {isMyTurn && isPlayable && !isSelected && <View style={styles.playIndicator} />}
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.playerCardFxWrap}>
                <MyPlayerCard
                  name={user?.name?.split(' ')[0] || 'Você'}
                  hand={myHand.filter(Boolean).length}
                  isMyTurn={isMyTurn}
                  avatarUri={(user as any)?.avatarUrl ?? (user as any)?.avatar}
                  onSelectEmoji={handleEmoji}
                />
                {renderPlayerFx(myEffectiveUserId, 'bottom')}
              </View>
            </View>

          </View>
        </View>

      </View>


      {/* ── Settings modal (HomeScreen-style card) ── */}
      <Modal visible={settingsVisible} transparent animationType="fade">
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
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={leaveConfirmVisible} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => setLeaveConfirmVisible(false)}
          testID="leave-confirm-overlay"
        >
          <Pressable
            style={styles.confirmCard}
            onPress={() => {}}
            onStartShouldSetResponder={() => true}
            testID="leave-confirm-card"
          >
            <Text style={styles.confirmTitle}>Abandonar partida</Text>
            <Text style={styles.confirmText}>Tem certeza? Você perderá a aposta.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setLeaveConfirmVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmLeaveBtn} onPress={doLeave}>
                <Text style={styles.confirmLeaveText}>Sair</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Result modal ── */}
      <Modal visible={resultModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <ResultCard
            result={gameResult}
            userId={myEffectiveUserId}
            playAgainLoading={playAgainSearching}
            onPlayAgain={handlePlayAgain}
            onExit={() => { setResultModal(false); setPlayAgainSearching(false); clearGame(); navigation.replace('Main'); }}
          />
        </View>
      </Modal>
      </SafeAreaView>
    </ImageBackground>
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
  miniDomino: {
    width: 44,
    height: 64,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  miniHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  miniDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
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
    backgroundColor: '#4ade80',
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

  disconnectBanner: { backgroundColor: colors.warning, paddingVertical: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
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
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
    zIndex: 50,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  gearBtn: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: 'rgba(0,100,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  timerBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2, borderColor: 'rgba(74,222,128,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  timerBadgeUrgent: {
    borderColor: colors.error,
    backgroundColor: 'rgba(248,113,113,0.15)',
  },
  timerText: {
    color: '#fff', fontWeight: '900', fontSize: fonts.sizes.lg,
  },
  timerTextUrgent: { color: colors.error },

  // ── Middle ──
  middle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tableWrap: { flex: 1, position: 'relative' },
  tableArea: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  scoreOverlay: {
    position: 'absolute',
    top: 0,
    left: spacing.sm,
    zIndex: 20,
    transform: [{ translateY: -8 }],
  },
  oppCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    transform: [{ translateY: -24 }],
  },
  tableSideBadgeLeft: {
    position: 'absolute',
    left: 0,
    top: '50%',
    zIndex: 15,
    transform: [{ translateY: -24 }, { translateX: -90 }],
  },
  tableSideBadgeRight: {
    position: 'absolute',
    right: 0,
    top: '50%',
    zIndex: 15,
    transform: [{ translateY: -24 }, { translateX: 90 }],
  },
  tableOuter: {
    width: '78%',
    maxWidth: 820,
    alignSelf: 'center',
    backgroundColor: '#060e06',
    borderRadius: 999,
    padding: 4,
    borderWidth: 8,
    borderColor: '#0d1a0d',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 0 18px 4px rgba(57,255,106,0.22), 0 0 48px 12px rgba(57,255,106,0.10)',
        } as any)
      : {
          shadowColor: '#39ff6a',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 24,
          elevation: 24,
        }),
  },
  tableFelt: {
    flex: 1,
    backgroundColor: '#2C760F',
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
    backgroundColor: 'rgba(74,222,128,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.35)',
  },
  drawBubbleText: { color: '#bbf7d0', fontSize: 14, fontWeight: '900' },

  // ── Hand section ──
  handSection: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'column',
    paddingHorizontal: spacing.sm,
    zIndex: 30,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 48,
  },
  jogarBtn: {
    backgroundColor: '#4ade80',
    borderRadius: radius.full,
    paddingVertical: 11, paddingHorizontal: 32,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 14px rgba(74,222,128,0.65)' } as any)
      : { shadowColor: '#4ade80', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 12, elevation: 10 }),
  },
  jogarBtnText: { color: '#000', fontWeight: '900', fontSize: fonts.sizes.md, letterSpacing: 0.4 },
  sideBtn: {
    backgroundColor: '#16a34a',
    borderRadius: radius.full,
    paddingVertical: 11, paddingHorizontal: 18,
  },
  sideBtnText: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.sm },
  drawBtn: {
    backgroundColor: '#22c55e',
    borderRadius: radius.full,
    paddingVertical: 11, paddingHorizontal: 22,
    borderWidth: 1, borderColor: '#86efac',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 16px rgba(34,197,94,0.55)' } as any)
      : { shadowColor: '#22c55e', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 12, elevation: 10 }),
  },
  drawBtnText: { color: '#052e16', fontWeight: '900', fontSize: fonts.sizes.md, letterSpacing: 0.3 },
  passBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: radius.full,
    paddingVertical: 11, paddingHorizontal: 22,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  passBtnText: { color: '#fca5a5', fontWeight: '700', fontSize: fonts.sizes.sm },
  cancelBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  handRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
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
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingTop: 14,
    paddingBottom: 4,
  },
  handTileWrap: {
    alignItems: 'center',
  },
  handTileSelected: {
    transform: [{ translateY: -12 }],
  },
  playIndicator: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#4ade80',
    alignSelf: 'center', marginTop: 2,
  },

  // Settings modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  settingsCard: {
    width: Platform.OS === 'web' ? 640 : 520,
    backgroundColor: colors.bgCard,
    borderWidth: 3, borderColor: '#BBFF00',
    borderRadius: radius.xl,
    padding: SETTINGS_CARD_PAD,
    gap: SETTINGS_ITEM_GAP,
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
    fontSize: fonts.sizes.xxxl,
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
    paddingVertical: SETTINGS_ITEM_GAP,
    borderRadius: radius.lg,
    borderWidth: 0,
    overflow: 'hidden',
  },
  settingLabel: {
    fontSize: fonts.sizes.xl,
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
  confirmCard: {
    width: Platform.OS === 'web' ? 480 : 340,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.55)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.55)' } as any) : shadows.card),
  },
  confirmTitle: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.xxl, textAlign: 'center' },
  confirmText: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: fonts.sizes.md, textAlign: 'center', marginTop: spacing.sm },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmCancelText: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.md },
  confirmLeaveBtn: {
    flex: 1,
    backgroundColor: '#7f1d1d',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmLeaveText: { color: '#fff', fontWeight: '900', fontSize: fonts.sizes.md },

  // Result modal
  resultCard: {
    backgroundColor: '#0f2e0f', borderRadius: radius.xl, padding: spacing.xxxl,
    alignItems: 'center', gap: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', minWidth: 280,
  },
  resultTitle: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: '#fff' },
  resultPrize: { fontSize: fonts.sizes.xl, fontWeight: '700', color: '#facc15' },
  resultBtn: {
    backgroundColor: '#4ade80', borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: spacing.md,
  },
  resultBtnDisabled: {
    opacity: 0.75,
  },
  resultBtnText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.md },
  resultSecondaryBtn: {
    marginTop: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  resultSecondaryText: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: fonts.sizes.sm },
});
