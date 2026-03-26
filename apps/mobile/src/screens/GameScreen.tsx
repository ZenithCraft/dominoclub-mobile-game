import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Modal, Alert, Animated,
} from 'react-native';
import { Socket } from 'socket.io-client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { DominoTile } from '../components/DominoTile';
import { connectSocket } from '../services/socket';
import { useGameStore, Tile, GameState, PlacedTile } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { RootStackParamList } from '../navigation';

type PlaySide = 'left' | 'right' | 'top' | 'bottom';
type PlayOption = { side: PlaySide; flipped: boolean };
type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

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

// ─── Emoji panel ──────────────────────────────────────────────────────────────

const EMOJIS = ['😂', '😍', '😅', '😔', '😤', '🤔'];

function EmojiPanel({ onEmoji }: { onEmoji: (e: string) => void }) {
  return (
    <View style={emojiStyles.grid}>
      {EMOJIS.map((e, i) => (
        <TouchableOpacity key={i} style={emojiStyles.btn} onPress={() => onEmoji(e)}>
          <Text style={emojiStyles.emoji}>{e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const emojiStyles = StyleSheet.create({
  grid: {
    width: 110,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.lg,
    alignContent: 'flex-start',
  },
  btn: {
    width: 46, height: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
});

// ─── Score box ────────────────────────────────────────────────────────────────

function ScoreBox({ is4Player, myScore, oppScore }: { is4Player: boolean; myScore: number; oppScore: number }) {
  return (
    <View style={scoreStyles.box}>
      <Text style={scoreStyles.line}>
        {is4Player ? 'Vocês' : 'Você'}:{' '}
        <Text style={scoreStyles.num}>{myScore}</Text>
      </Text>
      <Text style={scoreStyles.line}>
        {is4Player ? 'Eles' : 'Ele'}:{' '}
        <Text style={scoreStyles.num}>{oppScore}</Text>
      </Text>
    </View>
  );
}
const scoreStyles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 2,
  },
  line: { color: '#222', fontSize: fonts.sizes.sm, fontWeight: '600' },
  num:  { fontWeight: '800' },
});

// ─── Opponent card (top centre) ───────────────────────────────────────────────

function OpponentCard({ player, tileCount }: { player: any; tileCount: number }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  return (
    <View style={oppStyles.card}>
      <View style={oppStyles.row}>
        <View style={oppStyles.countBadge}>
          <Text style={oppStyles.countText}>{tileCount}</Text>
        </View>
        <View>
          <Text style={oppStyles.name}>{name}</Text>
          <Text style={oppStyles.sub}>{tileCount}/7</Text>
        </View>
        <View style={oppStyles.avatar}>
          <Text style={oppStyles.avatarText}>{name[0]}</Text>
        </View>
      </View>
    </View>
  );
}
const oppStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radius.sm,
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { color: '#111', fontWeight: '800', fontSize: fonts.sizes.sm },
  name: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  sub:  { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#4a7c4a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#4ade80',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
});

// ─── Side player card (4p left/right) ────────────────────────────────────────

function SidePlayerCard({ player, tileCount }: { player: any; tileCount: number }) {
  if (!player) return null;
  const name = player.isBot ? 'Bot' : (player.name || `P${player.seat + 1}`);
  return (
    <View style={sideStyles.card}>
      <View style={sideStyles.avatar}>
        <Text style={sideStyles.avatarText}>{name[0]}</Text>
      </View>
      <View style={sideStyles.countBadge}>
        <Text style={sideStyles.countText}>{tileCount}</Text>
      </View>
      <Text style={sideStyles.name} numberOfLines={1}>{name}</Text>
      <Text style={sideStyles.sub}>{tileCount}/7</Text>
    </View>
  );
}
const sideStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: spacing.sm,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#4a7c4a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#4ade80',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countText: { color: '#111', fontWeight: '800', fontSize: fonts.sizes.sm },
  name: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.xs, maxWidth: 64 },
  sub:  { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
});

// ─── Player badge (bottom right) ──────────────────────────────────────────────

function MyBadge({ name, hand }: { name: string; hand: number }) {
  return (
    <View style={myBadgeStyles.badge}>
      <Text style={myBadgeStyles.text}>{name}  {hand}/7</Text>
    </View>
  );
}
const myBadgeStyles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(30,30,30,0.9)',
    borderRadius: radius.sm,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  text: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
});

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ result, userId, onClose }: { result: any; userId?: string; onClose: () => void }) {
  const isWinner = result?.winnerId === userId;
  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultEmoji}>{isWinner ? '🏆' : '😔'}</Text>
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

  const [turnTimer, setTurnTimer]       = useState(30);
  const [resultModal, setResultModal]   = useState(false);
  const [gameError, setGameError]       = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef      = useRef<Socket | null>(null);
  const errorFadeAnim  = useRef(new Animated.Value(0)).current;

  // ── Derived ────────────────────────────────────────────────────────────────
  const myPlayerIndex = currentGame?.players.findIndex((p) => p.userId === user?.id) ?? -1;
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

  const is4Player = (currentGame?.players.length ?? 0) === 4;

  // Opponents (all players that are not me)
  const opponents = currentGame?.players.filter((p) => p.userId !== user?.id) ?? [];

  // For 2-player: one opponent at top centre
  // For 4-player: top=seat 2, left=seat 1, right=seat 3 (relative to my seat 0)
  const topOpponent   = is4Player
    ? currentGame?.players.find((p) => p.seat === (myPlayerIndex + 2) % 4)
    : opponents[0];
  const leftOpponent  = is4Player
    ? currentGame?.players.find((p) => p.seat === (myPlayerIndex + 3) % 4)
    : null;
  const rightOpponent = is4Player
    ? currentGame?.players.find((p) => p.seat === (myPlayerIndex + 1) % 4)
    : null;

  // Scores (tile counts per team)
  const myTeam  = currentGame?.players[myPlayerIndex]?.team;
  const myTeamTiles  = currentGame?.players.filter((p) => p.team === myTeam)
    .reduce((s, p) => s + p.hand.length, 0) ?? 0;
  const oppTeamTiles = currentGame?.players.filter((p) => p.team !== myTeam)
    .reduce((s, p) => s + p.hand.length, 0) ?? 0;

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
        setGame(state);
        resetTurnTimer();
        const newHand = state.players.find((p) => p.userId === user?.id)?.hand ?? [];
        const cur = useGameStore.getState().selectedTile;
        if (cur) {
          const stillInHand = newHand.some((t) => t && t[0] === cur[0] && t[1] === cur[1]);
          if (!stillInHand) setSelectedTile(null);
        }
      };

      socket.on('game:state',   onGameState);
      socket.on('game:ended',   (result: any) => { if (timerRef.current) clearInterval(timerRef.current); setGameResult(result); setResultModal(true); });
      socket.on('game:error',   ({ message }: { message: string }) => showError(message));
      socket.on('game:timeout', ({ userId }: { userId: string }) => { if (userId === user?.id) showError('Tempo esgotado — sua vez foi pulada'); });
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
  }, [gameId]);

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

  const handleLeaveGame = () => {
    Alert.alert('Abandonar partida', 'Tem certeza? Você perderá a aposta.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => { clearGame(); navigation.replace('Main'); } },
    ]);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!currentGame) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Entrando na partida...</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Disconnect banner */}
      {disconnected && (
        <View style={styles.disconnectBanner}>
          <Text style={styles.disconnectText}>⚠ Reconectando...</Text>
        </View>
      )}

      {/* Error toast */}
      {gameError && (
        <Animated.View style={[styles.errorToast, { opacity: errorFadeAnim }]}>
          <Text style={styles.errorToastText}>{gameError}</Text>
        </Animated.View>
      )}

      {/* ── Top bar: Score | Opponent | Gear ── */}
      <View style={styles.topBar}>
        <ScoreBox is4Player={is4Player} myScore={myTeamTiles} oppScore={oppTeamTiles} />

        <View style={styles.topCenter}>
          {topOpponent && (
            <OpponentCard
              player={topOpponent}
              tileCount={topOpponent.hand.length}
            />
          )}
        </View>

        <TouchableOpacity style={styles.gearBtn} onPress={() => setSettingsVisible(true)}>
          <Text style={styles.gearText}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* ── Middle: [left player] [table] [emoji] [right player] ── */}
      <View style={styles.middle}>
        {is4Player && leftOpponent && (
          <SidePlayerCard player={leftOpponent} tileCount={leftOpponent.hand.length} />
        )}

        {/* Table */}
        <View style={styles.tableWrap}>
          <View style={styles.tableOuter}>
            <View style={styles.tableFelt}>
              {/* Watermark */}
              {currentGame.board.length === 0 && (
                <View style={styles.watermark}>
                  <Text style={styles.watermarkText1}>DOMINO</Text>
                  <Text style={styles.watermarkText2}>CLUB</Text>
                </View>
              )}

              {/* Board tiles */}
              {currentGame.board.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.boardTiles}
                >
                  {currentGame.board.map((pt: PlacedTile, i: number) => (
                    <DominoTile
                      key={i}
                      tile={pt.tile}
                      horizontal={pt.side === 'left' || pt.side === 'right'}
                      size="sm"
                    />
                  ))}
                </ScrollView>
              )}

              {/* Turn timer */}
              {isMyTurn && (
                <View style={[
                  styles.timerBadge,
                  { backgroundColor: turnTimer <= 10 ? '#dc2626cc' : 'rgba(0,0,0,0.5)' },
                ]}>
                  <Text style={styles.timerText}>{turnTimer}s</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Emoji panel */}
        <View style={styles.emojiWrap}>
          <EmojiPanel onEmoji={handleEmoji} />
        </View>

        {is4Player && rightOpponent && (
          <SidePlayerCard player={rightOpponent} tileCount={rightOpponent.hand.length} />
        )}
      </View>

      {/* ── Bottom: hand tiles + player badge ── */}
      <View style={styles.bottomBar}>
        {/* Hand */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.handScroll}
          contentContainerStyle={styles.handContent}
        >
          {myHand.map((tile, i) => {
            if (!tile) return null;
            const key = tileKey(tile);
            const isPlayable = isMyTurn && validMovesMap.has(key);
            const isSelected = selectedTile?.[0] === tile[0] && selectedTile?.[1] === tile[1];
            return (
              <View key={`${key}-${i}`}>
                <DominoTile
                  tile={tile}
                  selected={isSelected}
                  onPress={() => handleTileSelect(tile)}
                  size="md"
                  style={isMyTurn && !isPlayable ? styles.tileUnplayable : undefined}
                />
                {isMyTurn && isPlayable && !isSelected && <View style={styles.playIndicator} />}
              </View>
            );
          })}
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.actions}>
          {selectedTile && validPlaysForSelected.length > 0 && (
            <View style={styles.playOptions}>
              {uniqueSides.length === 1 ? (
                <TouchableOpacity style={styles.playBtnPrimary} onPress={handlePlayImmediate}>
                  <Text style={styles.playBtnText}>Jogar</Text>
                </TouchableOpacity>
              ) : (
                uniqueSides.map((side) => (
                  <TouchableOpacity key={side} style={styles.playBtn} onPress={() => handlePlayTile(side)}>
                    <Text style={styles.playBtnText}>
                      {side === 'left' ? '← Esq' : side === 'right' ? 'Dir →' : side === 'top' ? '↑ Cima' : '↓ Baixo'}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity onPress={() => setSelectedTile(null)}>
                <Text style={styles.cancelText}>cancelar</Text>
              </TouchableOpacity>
            </View>
          )}
          {selectedTile && validPlaysForSelected.length === 0 && (
            <Text style={styles.noPlaysText}>Sem jogadas</Text>
          )}
          {!selectedTile && isMyTurn && (
            <View style={styles.passDrawRow}>
              {hasBoneyard && (
                <TouchableOpacity style={styles.drawBtn} onPress={handleDraw}>
                  <Text style={styles.drawBtnText}>🎲 Comprar</Text>
                </TouchableOpacity>
              )}
              {!hasValidMoves && !hasBoneyard && (
                <TouchableOpacity style={styles.passBtn} onPress={handlePass}>
                  <Text style={styles.passBtnText}>Passar</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <Text style={styles.boneyardCount}>{currentGame.boneyard.length} no estoque</Text>
        </View>

        {/* Player badge */}
        <MyBadge
          name={user?.name?.split(' ')[0] || 'Você'}
          hand={myHand.filter(Boolean).length}
        />
      </View>

      {/* ── Settings modal ── */}
      <Modal visible={settingsVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setSettingsVisible(false)}
        >
          <View style={styles.settingsCard} onStartShouldSetResponder={() => true}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Configurações</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Text style={styles.settingsClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Som:</Text>
              <View style={[styles.toggle, { backgroundColor: '#f97316' }]}>
                <Text style={styles.toggleLabel}>Off</Text>
              </View>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Música:</Text>
              <View style={[styles.toggle, { backgroundColor: '#4ade80' }]}>
                <Text style={[styles.toggleLabel, { color: '#000' }]}>On</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveGame}>
              <Text style={styles.leaveBtnText}>Abandonar partida</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080e08' },
  centered:  { alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textMuted, fontSize: fonts.sizes.lg },

  disconnectBanner: { backgroundColor: colors.warning, paddingVertical: 6, alignItems: 'center' },
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
    paddingVertical: spacing.sm,
    gap: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topCenter: { flex: 1, alignItems: 'center' },
  gearBtn: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: 'rgba(0,100,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  gearText: { color: '#4ade80', fontSize: 18 },

  // ── Middle ──
  middle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tableWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tableOuter: {
    width: '100%', aspectRatio: 2.4,
    backgroundColor: '#0d3d0d',
    borderRadius: 999,
    padding: 6,
    ...shadows.card,
  },
  tableFelt: {
    flex: 1,
    backgroundColor: '#1e6b1e',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  watermark: { alignItems: 'center', opacity: 0.18 },
  watermarkText1: { color: '#fff', fontWeight: '800', fontSize: 22, letterSpacing: 4 },
  watermarkText2: { color: '#4ade80', fontWeight: '800', fontSize: 22, letterSpacing: 4 },
  boardTiles: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.lg },
  timerBadge: {
    position: 'absolute', top: 8,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4,
  },
  timerText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },

  emojiWrap: { justifyContent: 'center' },

  // ── Bottom bar ──
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: spacing.sm,
  },
  handScroll: { flex: 1 },
  handContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  tileUnplayable: { opacity: 0.38 },
  playIndicator: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#4ade80',
    alignSelf: 'center', marginTop: 2,
  },

  // Action buttons
  actions: { alignItems: 'center', gap: 4, minWidth: 100 },
  playOptions: { alignItems: 'center', gap: 4 },
  playBtnPrimary: {
    backgroundColor: '#4ade80', borderRadius: radius.sm,
    paddingVertical: 8, paddingHorizontal: 20,
  },
  playBtn: {
    backgroundColor: '#16a34a', borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  playBtnText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.xs },
  cancelText:  { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  noPlaysText: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  passDrawRow: { gap: 4, alignItems: 'center' },
  drawBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  drawBtnText: { color: '#fff', fontSize: fonts.sizes.xs },
  passBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  passBtnText:  { color: colors.textMuted, fontSize: fonts.sizes.xs },
  boneyardCount: { color: colors.textMuted, fontSize: 9 },

  // Settings modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  settingsCard: {
    width: 320,
    backgroundColor: 'rgba(8,30,8,0.98)',
    borderWidth: 2, borderColor: '#4ade80',
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.lg },
  settingsClose: { color: colors.textMuted, fontSize: fonts.sizes.lg, fontWeight: '700' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { color: '#fff', fontSize: fonts.sizes.md },
  toggle: {
    borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 12,
  },
  toggleLabel: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.xs },
  leaveBtn: {
    marginTop: spacing.sm, borderWidth: 1, borderColor: colors.error,
    borderRadius: radius.md, paddingVertical: 10, alignItems: 'center',
  },
  leaveBtnText: { color: colors.error, fontWeight: '600' },

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
