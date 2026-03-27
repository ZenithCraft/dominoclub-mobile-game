import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ImageBackground, Image,
  TouchableOpacity, Modal, Alert, Animated, Pressable,
  Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Socket } from 'socket.io-client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import {
  IconTrophy, IconDices, IconSettings, IconAlert, IconX, IconFrown,
  IconVolumeUp, IconMusic,
} from '../components/Icons';
import { colors, spacing, fonts, radius, shadows, backgroundCoverFix } from '../theme';
import { connectSocket } from '../services/socket';
import { useGameStore, Tile, GameState, PlacedTile } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { RootStackParamList } from '../navigation';

type PlaySide = 'left' | 'right' | 'top' | 'bottom';
type PlayOption = { side: PlaySide; flipped: boolean };
type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

const SETTINGS_CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const SETTINGS_ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

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

// ─── Game logic (unchanged) ───────────────────────────────────────────────────

function canPlayTile(tile: Tile, game: GameState): PlayOption[] {
  if (!game.firstPlayMade) return [{ side: 'left', flipped: false }];
  const plays: PlayOption[] = [];
  const checkEnd = (open: number, side: PlaySide) => {
    if (open === -1 || open === undefined) return;
    if (tile[0] === open) plays.push({ side, flipped: false });
    if (tile[1] === open && tile[0] !== tile[1]) plays.push({ side, flipped: true });
  };
  checkEnd(game.leftOpen, 'left');
  checkEnd(game.rightOpen, 'right');
  if (game.variant === 'CRUZADA') {
    if (game.topOpen !== undefined) checkEnd(game.topOpen, 'top');
    if (game.bottomOpen !== undefined) checkEnd(game.bottomOpen, 'bottom');
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

// ─── Tile image map (portrait PNGs → landscape in hand) ──────────────────────
// Keys use min-max order so [6,5] and [5,6] map to the same image.
const TILE_IMAGE_MAP: Record<string, any> = {
  '6-6': require('../../assets/Domino Tiles/Frame 14164.png'),
  '5-6': require('../../assets/Domino Tiles/Frame 14165.png'),
  '5-5': require('../../assets/Domino Tiles/Frame 14166.png'),
  '4-6': require('../../assets/Domino Tiles/Frame 14167.png'),
  '4-5': require('../../assets/Domino Tiles/Frame 14168.png'),
  '4-4': require('../../assets/Domino Tiles/Frame 14169.png'),
  '3-6': require('../../assets/Domino Tiles/Frame 14170.png'),
  '3-5': require('../../assets/Domino Tiles/Frame 14171.png'),
  '3-4': require('../../assets/Domino Tiles/Frame 14172.png'),
  '3-3': require('../../assets/Domino Tiles/Frame 14173.png'),
  '2-6': require('../../assets/Domino Tiles/Frame 14174.png'),
  '2-5': require('../../assets/Domino Tiles/Frame 14175.png'),
  '2-4': require('../../assets/Domino Tiles/Frame 14176.png'),
  '2-3': require('../../assets/Domino Tiles/Frame 14177.png'),
  '2-2': require('../../assets/Domino Tiles/Frame 14178.png'),
  '1-6': require('../../assets/Domino Tiles/Frame 14179.png'),
  '1-5': require('../../assets/Domino Tiles/Frame 14180.png'),
  '1-4': require('../../assets/Domino Tiles/Frame 14181.png'),
  '1-3': require('../../assets/Domino Tiles/Frame 14182.png'),
  '1-2': require('../../assets/Domino Tiles/Frame 14183.png'),
  '0-0': require('../../assets/Domino Tiles/Frame 14191.png'),
};

// Portrait tile dimensions for hand display
const HAND_W = 30;
const HAND_H = 50;

function TileHandImage({
  tile, selected, playable, onPress,
}: {
  tile: Tile; selected?: boolean; playable?: boolean; onPress?: () => void;
}) {
  const lo = Math.min(tile[0], tile[1]);
  const hi = Math.max(tile[0], tile[1]);
  const imgSrc = TILE_IMAGE_MAP[`${lo}-${hi}`];

  if (!imgSrc) return null;

  const inner = (
    <View style={[
      handImgStyles.container,
      selected && handImgStyles.selected,
      !playable && handImgStyles.unplayable,
    ]}>
      <Image source={imgSrc} style={handImgStyles.img} resizeMode="stretch" />
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{inner}</TouchableOpacity>
  ) : inner;
}

const handImgStyles = StyleSheet.create({
  container: {
    width: HAND_W,
    height: HAND_H,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  img: { width: '100%', height: '100%' },
  selected: {
    borderColor: '#4ade80',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 10px rgba(74,222,128,0.55)' } as any)
      : {
          shadowColor: '#4ade80',
          shadowOpacity: 0.8,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        }),
  },
  unplayable: { opacity: 0.38 },
});

const BOARD_SHORT = 30;
const BOARD_LONG = 60;

function TileBoardImage({ tile, horizontal, flipped }: { tile: Tile; horizontal?: boolean; flipped?: boolean }) {
  const lo = Math.min(tile[0], tile[1]);
  const hi = Math.max(tile[0], tile[1]);
  const imgSrc = TILE_IMAGE_MAP[`${lo}-${hi}`];

  if (!imgSrc) {
    return <DominoTile tile={tile} size="sm" horizontal={horizontal} />;
  }

  const w = horizontal ? BOARD_LONG : BOARD_SHORT;
  const h = horizontal ? BOARD_SHORT : BOARD_LONG;
  const transforms = [
    horizontal ? ({ rotate: '90deg' } as const) : null,
    flipped ? ({ rotate: '180deg' } as const) : null,
  ].filter(Boolean) as any[];

  return (
    <View style={[boardImgStyles.wrap, { width: w, height: h }]}>
      <Image source={imgSrc} style={[boardImgStyles.img, { transform: transforms }]} resizeMode="contain" />
    </View>
  );
}

const boardImgStyles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.tileBg,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.tileBorder,
  },
  img: { width: '100%', height: '100%' },
});

type DominoTileSize = 'sm' | 'md';
type DominoTileProps = {
  tile: Tile;
  size?: DominoTileSize;
  horizontal?: boolean;
  selected?: boolean;
  onPress?: () => void;
  style?: any;
};

const PIP_POS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

function DominoTile({ tile, size = 'md', horizontal, selected, onPress, style }: DominoTileProps) {
  const dims = size === 'sm'
    ? { short: 30, long: 60, dot: 4, pad: 4 }
    : { short: 42, long: 84, dot: 6, pad: 6 };

  const w = horizontal ? dims.long : dims.short;
  const h = horizontal ? dims.short : dims.long;

  const borderColor = selected ? colors.primary : colors.tileBorder;
  const borderWidth = selected ? 2 : 1;

  const wrapStyle = [
    tileStyles.wrap,
    {
      width: w,
      height: h,
      borderColor,
      borderWidth,
      flexDirection: horizontal ? 'row' : 'column',
    },
    style,
  ];

  const halfStyle = horizontal
    ? [{ width: w / 2, height: h }]
    : [{ width: w, height: h / 2 }];

  const dividerStyle = horizontal ? tileStyles.dividerV : tileStyles.dividerH;

  const content = (
    <View style={wrapStyle}>
      <View style={[tileStyles.half, ...halfStyle]}>
        <Pips value={tile[0]} dot={dims.dot} pad={dims.pad} />
      </View>
      <View style={dividerStyle} />
      <View style={[tileStyles.half, ...halfStyle]}>
        <Pips value={tile[1]} dot={dims.dot} pad={dims.pad} />
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ borderRadius: radius.md }}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

function Pips({ value, dot, pad }: { value: number; dot: number; pad: number }) {
  const spots = PIP_POS[value] ?? [];
  return (
    <View style={[tileStyles.pips, { padding: pad }]}>
      {spots.map(([r, c], idx) => (
        <View
          key={idx}
          style={[
            tileStyles.pip,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              top: `${(r / 2) * 100}%`,
              left: `${(c / 2) * 100}%`,
            },
          ]}
        />
      ))}
    </View>
  );
}

const tileStyles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.tileBg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  half: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerH: {
    height: 1,
    backgroundColor: colors.tileBorder,
  },
  dividerV: {
    width: 1,
    backgroundColor: colors.tileBorder,
  },
  pips: {
    flex: 1,
    alignSelf: 'stretch',
    position: 'relative',
  },
  pip: {
    position: 'absolute',
    backgroundColor: colors.tilePip,
    transform: [{ translateX: -0.5 }, { translateY: -0.5 }],
  },
});

// ─── Emoji panel ──────────────────────────────────────────────────────────────

const EMOJIS = [
  { id: 'smile',   char: '😄' },
  { id: 'laugh',   char: '😂' },
  { id: 'love',    char: '😍' },
  { id: 'wow',     char: '🤩' },
  { id: 'sad',     char: '😢' },
  { id: 'angry',   char: '😡' },
];

function EmojiPanel({ onEmoji }: { onEmoji: (e: string) => void }) {
  return (
    <View style={emojiStyles.grid}>
      {EMOJIS.map((e) => (
        <TouchableOpacity
          key={e.id}
          style={emojiStyles.btn}
          onPress={() => onEmoji(e.id)}
          accessibilityLabel={`Reação ${e.id}`}
          activeOpacity={0.65}
        >
          <Text style={emojiStyles.emoji}>{e.char}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const emojiStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 90,
    gap: 6,
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.40)',
    borderRadius: radius.lg,
  },
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

function OpponentCard({ player, tileCount }: { player: any; tileCount: number }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  const avatarUri: string | undefined = player?.avatarUrl ?? player?.avatar;
  return (
    <LinearGradient
      colors={['rgba(8,38,14,0.97)', 'rgba(32,100,22,0.93)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={oppStyles.card}
    >
      <View style={oppStyles.sideSlot}>
        <Image
          source={require('../../assets/Domino Tiles/Frame 14183.png')}
          style={oppStyles.tileIcon}
          resizeMode="contain"
        />
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

function SidePlayerCard({ player, tileCount }: { player: any; tileCount: number }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  const avatarUri: string | undefined = player?.avatarUrl ?? player?.avatar;
  return (
    <LinearGradient
      colors={['rgba(8,38,14,0.97)', 'rgba(32,100,22,0.93)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={sideStyles.card}
    >
      <View style={sideStyles.sideSlot}>
        <Image
          source={require('../../assets/Domino Tiles/Frame 14183.png')}
          style={sideStyles.tileIcon}
          resizeMode="contain"
        />
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

function MyPlayerCard({ name, hand, isMyTurn, avatarUri }: {
  name: string; hand: number; isMyTurn: boolean; avatarUri?: string;
}) {
  return (
    <LinearGradient
      colors={['rgba(32,100,22,0.93)', 'rgba(8,38,14,0.97)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[myCardStyles.card, isMyTurn && myCardStyles.cardMyTurn]}
    >
      <View style={myCardStyles.sideSlot}>
        <Image
          source={require('../../assets/Domino Tiles/Frame 14183.png')}
          style={myCardStyles.tileIcon}
          resizeMode="contain"
        />
        <Text style={myCardStyles.tileCount}>{hand}</Text>
      </View>

      <View style={myCardStyles.nameWrap}>
        <Text style={myCardStyles.name} numberOfLines={1}>{name}</Text>
        <Text style={myCardStyles.sub}>{hand}/7</Text>
      </View>

      <View style={[myCardStyles.sideSlot, myCardStyles.sideSlotRight]}>
        <View style={myCardStyles.avatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={myCardStyles.avatarImg} />
          ) : (
            <Text style={myCardStyles.avatarText}>{name[0]?.toUpperCase?.() ?? '?'}</Text>
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

function ResultCard({ result, userId, onClose }: { result: any; userId?: string; onClose: () => void }) {
  const isWinner = result?.winnerId === userId;
  return (
    <View style={styles.resultCard}>
      {isWinner ? (
        <IconTrophy size={48} color={colors.gold} accessibilityLabel="Troféu" />
      ) : (
        <IconFrown size={48} color={colors.textSecondary} accessibilityLabel="Rosto triste" />
      )}
      <Text style={styles.resultTitle}>{isWinner ? 'Você ganhou!' : 'Fim de jogo'}</Text>
      {result?.prizePerWinner > 0 && (
        <Text style={styles.resultPrize}>Prêmio: R$ {result.prizePerWinner.toFixed(2)}</Text>
      )}
      <TouchableOpacity style={styles.resultBtn} onPress={onClose}>
        <Text style={styles.resultBtnText}>Jogar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GameScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { user } = useAuthStore();
  const { currentGame, selectedTile, setGame, setSelectedTile, setGameResult, clearGame } = useGameStore();

  const { width: viewportWidth } = useWindowDimensions();

  const [turnTimer, setTurnTimer]       = useState(30);
  const [resultModal, setResultModal]   = useState(false);
  const [gameError, setGameError]       = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef      = useRef<Socket | null>(null);
  const errorFadeAnim  = useRef(new Animated.Value(0)).current;

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
  const myHand        = (currentGame?.players[myPlayerIndex]?.hand || []) as (Tile | null)[];

  const validMovesMap: Map<string, PlayOption[]> = currentGame && isMyTurn
    ? getValidMovesForHand(myHand, currentGame)
    : new Map();

  const hasValidMoves = validMovesMap.size > 0;
  const hasBoneyard   = (currentGame?.boneyard.length ?? 0) > 0;

  const validPlaysForSelected: PlayOption[] = selectedTile
    ? (validMovesMap.get(tileKey(selectedTile)) ?? [])
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

  // ── Socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    connectSocket().then((socket) => {
      if (!mounted) return;
      socketRef.current = socket;
      socket.emit('game:join', { gameId });

      const onGameState = (state: GameState) => {
        const normalized = normalizeGameState(state);
        setGame(normalized);
        resetTurnTimer();
        const me = normalized.players.find((p) => p.userId === myUserId) ?? normalized.players.find((p) => p.seat === 0);
        const newHand = me?.hand ?? [];
        const cur = useGameStore.getState().selectedTile;
        if (cur) {
          const stillInHand = newHand.some((t) => t && t[0] === cur[0] && t[1] === cur[1]);
          if (!stillInHand) setSelectedTile(null);
        }
      };

      socket.on('game:state',   onGameState);
      socket.on('game:ended',   (result: any) => { if (timerRef.current) clearInterval(timerRef.current); setGameResult(result); setResultModal(true); });
      socket.on('game:error',   ({ message }: { message: string }) => showError(message));
      socket.on('game:timeout', ({ userId }: { userId: string }) => { if (String(userId) === myUserId) showError('Tempo esgotado — sua vez foi pulada'); });
      socket.on('disconnect',   () => setDisconnected(true));
      socket.on('connect',      () => { setDisconnected(false); socket.emit('game:join', { gameId }); });

      return () => {
        socket.off('game:state'); socket.off('game:ended');
        socket.off('game:error'); socket.off('game:timeout');
        socket.off('disconnect'); socket.off('connect');
      };
    });
    return () => {
      mounted = false;
      socketRef.current?.emit('game:leave', { gameId });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameId, myUserId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleTileSelect = (tile: Tile) => {
    if (!isMyTurn) return;
    if ((validMovesMap.get(tileKey(tile)) ?? []).length === 0) { showError('Esta pedra não pode ser jogada agora'); return; }
    const isSame = selectedTile?.[0] === tile[0] && selectedTile?.[1] === tile[1];
    setSelectedTile(isSame ? null : tile);
  };

  const handlePlayTile = useCallback(async (side: PlaySide) => {
    if (!selectedTile) return;
    const plays = validPlaysForSelected.filter((p) => p.side === side);
    if (!plays.length) return;
    const socket = socketRef.current ?? await connectSocket();
    socket.emit('game:move', { gameId, tile: selectedTile, side, flipped: plays[0].flipped });
    setSelectedTile(null);
  }, [selectedTile, validPlaysForSelected, gameId]);

  const handlePlayImmediate = useCallback(async () => {
    if (!selectedTile || validPlaysForSelected.length !== 1) return;
    const { side, flipped } = validPlaysForSelected[0];
    const socket = socketRef.current ?? await connectSocket();
    socket.emit('game:move', { gameId, tile: selectedTile, side, flipped });
    setSelectedTile(null);
  }, [selectedTile, validPlaysForSelected, gameId]);

  const handlePass = useCallback(async () => {
    const socket = socketRef.current ?? await connectSocket();
    socket.emit('game:pass', { gameId });
  }, [gameId]);

  const handleDraw = useCallback(async () => {
    const socket = socketRef.current ?? await connectSocket();
    socket.emit('game:draw', { gameId });
  }, [gameId]);

  const handleEmoji = useCallback(async (emoji: string) => {
    const socket = socketRef.current ?? await connectSocket();
    socket.emit('game:emoji', { gameId, emoji });
  }, [gameId]);

  const doLeave = () => {
    setLeaveConfirmVisible(false);
    setSettingsVisible(false);
    clearGame();
    navigation.replace('Main');
  };

  const handleLeaveGame = () => {
    setLeaveConfirmVisible(true);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!currentGame) {
    return (
      <ImageBackground
        source={require('../../assets/background.png')}
        style={[styles.bg, backgroundCoverFix]}
        resizeMode="cover"
      >
        <View style={styles.bgOverlay} />
        <SafeAreaView style={[styles.container, styles.centered]}>
          <Text style={styles.loadingText}>Entrando na partida...</Text>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
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

      {/* ── Top bar: settings only (score moved near table) ── */}
      <View style={styles.topBar}>
        <View style={styles.topCenter} />
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
                  <OpponentCard player={topOpponent} tileCount={topOpponent.hand.length} />
                </View>
              )}

              {/* Side player cards — centred on the oval's left/right rims */}
              {is4Player && leftOpponent && (
                <View style={styles.tableSideBadgeLeft}>
                  <SidePlayerCard player={leftOpponent} tileCount={leftOpponent.hand.length} />
                </View>
              )}
              {is4Player && rightOpponent && (
                <View style={styles.tableSideBadgeRight}>
                  <SidePlayerCard player={rightOpponent} tileCount={rightOpponent.hand.length} />
                </View>
              )}

              <View style={styles.tableFelt}>
                {/* Watermark */}
                {currentGame.board.length === 0 && (
                  <Image
                    source={require('../../assets/b9e1ca54722e75c0419489ace1bdc6e4b752369c.png')}
                    style={styles.watermarkImage}
                    resizeMode="contain"
                  />
                )}

                {/* Board tiles */}
                {currentGame.board.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.boardTiles}
                  >
                    {currentGame.board.map((pt: PlacedTile, i: number) => (
                      <TileBoardImage
                        key={i}
                        tile={pt.tile}
                        horizontal={pt.side === 'left' || pt.side === 'right'}
                        flipped={pt.flipped}
                      />
                    ))}
                  </ScrollView>
                )}

              </View>
            </View>
          </View>

          {/* Hand section below oval — outside overflow:hidden so tiles are always visible */}
          <View style={styles.handSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.handScroll}
              contentContainerStyle={styles.handContent}
            >
              {myHand.map((tile, i) => {
                if (!tile) return null;
                const lo = Math.min(tile[0], tile[1]);
                const hi = Math.max(tile[0], tile[1]);
                if (!TILE_IMAGE_MAP[`${lo}-${hi}`]) return null;
                const key = tileKey(tile);
                const isPlayable = isMyTurn && validMovesMap.has(key);
                const isSelected = selectedTile?.[0] === tile[0] && selectedTile?.[1] === tile[1];
                return (
                  <View key={`${key}-${i}`} style={{ alignItems: 'center' }}>
                    <TileHandImage
                      tile={tile}
                      selected={isSelected}
                      playable={!isMyTurn || isPlayable}
                      onPress={() => handleTileSelect(tile)}
                    />
                    {isMyTurn && isPlayable && !isSelected && <View style={styles.playIndicator} />}
                  </View>
                );
              })}
              {/* Draw button inline with tiles — identical structure to hand tiles */}
              {isMyTurn && !selectedTile && hasBoneyard && (
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity onPress={handleDraw} activeOpacity={0.85}>
                    <View style={handImgStyles.container}>
                      <Image
                        source={require('../../assets/Domino Tiles/Frame 14183.png')}
                        style={handImgStyles.img}
                        resizeMode="stretch"
                      />
                    </View>
                  </TouchableOpacity>
                  <View style={styles.playIndicator} />
                </View>
              )}
            </ScrollView>
            <View style={styles.myBottomArea}>
              {isMyTurn && (
                <>
                  {selectedTile && uniqueSides.length > 1 && uniqueSides.map((side) => (
                    <TouchableOpacity key={side} style={styles.tablePlayBtn} onPress={() => handlePlayTile(side)}>
                      <Text style={styles.tablePlayBtnText}>
                        {side === 'left' ? '←' : side === 'right' ? '→' : side === 'top' ? '↑' : '↓'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {selectedTile && uniqueSides.length === 1 && (
                    <TouchableOpacity style={styles.tablePlayBtnPrimary} onPress={handlePlayImmediate}>
                      <Text style={styles.tablePlayBtnText}>Jogar</Text>
                    </TouchableOpacity>
                  )}
                  {!selectedTile && !hasValidMoves && !hasBoneyard && (
                    <TouchableOpacity style={styles.tablePassBtn} onPress={handlePass}>
                      <Text style={styles.tablePassText}>Passar</Text>
                    </TouchableOpacity>
                  )}
                  {selectedTile && (
                    <TouchableOpacity style={styles.tableCancelBtn} onPress={() => setSelectedTile(null)}>
                      <Text style={styles.tableCancelText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              <MyPlayerCard
                name={user?.name?.split(' ')[0] || 'Você'}
                hand={myHand.filter(Boolean).length}
                isMyTurn={isMyTurn}
                avatarUri={(user as any)?.avatarUrl ?? (user as any)?.avatar}
              />
            </View>
          </View>
        </View>

        {/* Right column: emoji + my player card */}
        <View style={[styles.rightColumn, Platform.OS !== 'web' && styles.rightColumnMobile]}>
          <EmojiPanel onEmoji={handleEmoji} />
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

            <View style={styles.settingsHeader}>
              <View style={{ width: 26 }} />
              <Text style={styles.settingsTitle}>Configurações</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
              </TouchableOpacity>
            </View>
            {/* Sound */}
            <View style={styles.settingRow}>
              <View style={styles.settingLabelRow}>
                <IconVolumeUp size={20} color="#fff" accessibilityLabel="Som" />
                <Text style={styles.settingLabel}>Som</Text>
              </View>
              <TouchableOpacity
                style={[styles.togglePill, { backgroundColor: soundOn ? '#4ade80' : 'rgba(255,255,255,0.12)' }]}
                onPress={() => setSoundOn(v => !v)}
              >
                <Text style={[styles.togglePillText, { color: soundOn ? '#000' : '#fff' }]}>
                  {soundOn ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            {/* Music */}
            <View style={styles.settingRow}>
              <View style={styles.settingLabelRow}>
                <IconMusic size={20} color="#fff" accessibilityLabel="Música" />
                <Text style={styles.settingLabel}>Música</Text>
              </View>
              <TouchableOpacity
                style={[styles.togglePill, { backgroundColor: musicOn ? '#4ade80' : 'rgba(255,255,255,0.12)' }]}
                onPress={() => setMusicOn(v => !v)}
              >
                <Text style={[styles.togglePillText, { color: musicOn ? '#000' : '#fff' }]}>
                  {musicOn ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
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
            result={useGameStore.getState().gameResult}
            userId={user?.id}
            onClose={() => { setResultModal(false); clearGame(); navigation.replace('Main'); }}
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
  tableBottomCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 5,
    transform: [{ translateY: 30 }],
  },
  watermarkImage: {
    width: 130,
    height: 80,
    opacity: 0.1,
  },
  boardTiles: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.lg },
  emojiWrap: { justifyContent: 'center' },
  rightColumn: {
    position: 'absolute',
    right: spacing.sm,
    bottom: 12,
    zIndex: 15,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  rightColumnMobile: {
    position: 'absolute',
    right: spacing.sm,
    bottom: 12,
    zIndex: 15,
  },

  // ── In-table floating action controls ──
  tableActions: {
    position: 'absolute',
    top: 6,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 5,
  },
  tablePlayBtnPrimary: {
    backgroundColor: '#4ade80',
    borderRadius: radius.sm,
    paddingVertical: 5, paddingHorizontal: 12,
  },
  tablePlayBtn: {
    backgroundColor: '#16a34a',
    borderRadius: radius.sm,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  tablePlayBtnText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.xs },
  tableCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  tableCancelText: { color: '#fff', fontSize: 12 },
  tablePassBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm,
    paddingVertical: 5, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  tablePassText: { color: colors.textMuted, fontSize: fonts.sizes.xs },

  // ── Hand section (below oval) ──
  handSection: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 2,
    zIndex: 30,
  },
  handScroll: {
    flexGrow: 0,
    flexShrink: 1,
    zIndex: 10,
    ...(Platform.OS === 'web' ? ({ minWidth: 0, maxWidth: '62%' } as any) : ({ maxWidth: '58%' } as any)),
  },
  myBottomArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: 2,
    zIndex: 40,
    ...(Platform.OS !== 'web' ? { elevation: 8 } : null),
  },
  handActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingBottom: 2,
  },
  handContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  tileUnplayable: { opacity: 0.38 },
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
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsTitle: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SETTINGS_CARD_PAD,
    paddingVertical: SETTINGS_ITEM_GAP,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  settingLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, flex: 1 },
  settingLabel: {
    fontSize: fonts.sizes.xl,
    color: '#fff',
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  togglePill: {
    borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 20,
    minWidth: 64, alignItems: 'center',
  },
  togglePillText: { fontWeight: '800', fontSize: fonts.sizes.sm },
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
  resultEmoji: { fontSize: 56 },
  resultTitle: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: '#fff' },
  resultPrize: { fontSize: fonts.sizes.xl, fontWeight: '700', color: '#facc15' },
  resultBtn: {
    backgroundColor: '#4ade80', borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: spacing.md,
  },
  resultBtnText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.md },
});
