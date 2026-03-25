import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Modal, Alert, Animated,
} from 'react-native';
import { Socket } from 'socket.io-client';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { DominoTile } from '../components/DominoTile';
import { Logo } from '../components/Logo';
import { connectSocket } from '../services/socket';
import { useGameStore, Tile, GameState, PlacedTile } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { RootStackParamList } from '../navigation';

type PlaySide = 'left' | 'right' | 'top' | 'bottom';
type PlayOption = { side: PlaySide; flipped: boolean };

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

// ─── Client-side valid move logic (mirrors domino.engine.ts) ──────────────────

function canPlayTile(tile: Tile, game: GameState): PlayOption[] {
  if (!game.firstPlayMade) {
    return [{ side: 'left', flipped: false }];
  }

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

function tileKey(tile: Tile): string {
  return `${tile[0]}-${tile[1]}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GameScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { user } = useAuthStore();
  const { currentGame, selectedTile, setGame, setSelectedTile, setGameResult, clearGame } = useGameStore();

  const [turnTimer, setTurnTimer] = useState(30);
  const [resultModal, setResultModal] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const errorFadeAnim = useRef(new Animated.Value(0)).current;

  // ── Derived state ──────────────────────────────────────────────────────────

  const myPlayerIndex = currentGame?.players.findIndex((p) => p.userId === user?.id) ?? -1;
  const isMyTurn = currentGame?.currentPlayerIndex === myPlayerIndex && currentGame?.status === 'playing';
  const myHand = (currentGame?.players[myPlayerIndex]?.hand || []) as (Tile | null)[];

  const validMovesMap: Map<string, PlayOption[]> = currentGame && isMyTurn
    ? getValidMovesForHand(myHand, currentGame)
    : new Map();

  const hasValidMoves = validMovesMap.size > 0;
  const hasBoneyard = (currentGame?.boneyard.length ?? 0) > 0;

  // Valid plays for the currently selected tile
  const validPlaysForSelected: PlayOption[] = selectedTile
    ? (validMovesMap.get(tileKey(selectedTile)) ?? [])
    : [];

  // Deduplicated sides (a tile may match both ends on the same side)
  const uniqueSides = [...new Set(validPlaysForSelected.map((p) => p.side))];

  // ── Timer ──────────────────────────────────────────────────────────────────

  const resetTurnTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTurnTimer(30);
    timerRef.current = setInterval(() => {
      setTurnTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, []);

  // Auto-pass when timer expires on my turn
  useEffect(() => {
    if (turnTimer === 0 && isMyTurn) {
      handlePass();
    }
  }, [turnTimer, isMyTurn]);

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

  // ── Socket setup ───────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    connectSocket().then((socket) => {
      if (!mounted) return;
      socketRef.current = socket;

      socket.emit('game:join', { gameId });

      const onGameState = (state: GameState) => {
        setGame(state);
        resetTurnTimer();
        // Clear selected tile if it's no longer in hand (was played by server)
        const newHand = state.players.find((p) => p.userId === user?.id)?.hand ?? [];
        const cur = useGameStore.getState().selectedTile;
        if (cur) {
          const stillInHand = newHand.some((t) => t && t[0] === cur[0] && t[1] === cur[1]);
          if (!stillInHand) setSelectedTile(null);
        }
      };

      const onGameEnded = (result: any) => {
        if (timerRef.current) clearInterval(timerRef.current);
        setGameResult(result);
        setResultModal(true);
      };

      const onGameError = ({ message }: { message: string }) => {
        showError(message);
      };

      const onTimeout = ({ userId }: { userId: string }) => {
        if (userId === user?.id) {
          showError('Tempo esgotado — sua vez foi pulada');
        }
      };

      const onDisconnect = () => setDisconnected(true);
      const onReconnect = () => {
        setDisconnected(false);
        // Re-join game room after reconnection
        socket.emit('game:join', { gameId });
      };

      socket.on('game:state', onGameState);
      socket.on('game:ended', onGameEnded);
      socket.on('game:error', onGameError);
      socket.on('game:timeout', onTimeout);
      socket.on('disconnect', onDisconnect);
      socket.on('connect', onReconnect);

      // Cleanup
      return () => {
        socket.off('game:state', onGameState);
        socket.off('game:ended', onGameEnded);
        socket.off('game:error', onGameError);
        socket.off('game:timeout', onTimeout);
        socket.off('disconnect', onDisconnect);
        socket.off('connect', onReconnect);
      };
    });

    return () => {
      mounted = false;
      const socket = socketRef.current;
      if (socket) {
        socket.emit('game:leave', { gameId });
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleTileSelect = (tile: Tile) => {
    if (!isMyTurn) return;
    const plays = validMovesMap.get(tileKey(tile)) ?? [];
    if (plays.length === 0) {
      showError('Esta pedra não pode ser jogada agora');
      return;
    }
    // Deselect if tapping the same tile again
    const isSame = selectedTile?.[0] === tile[0] && selectedTile?.[1] === tile[1];
    setSelectedTile(isSame ? null : tile);
  };

  const handlePlayTile = useCallback(async (side: PlaySide) => {
    if (!selectedTile) return;
    const plays = validPlaysForSelected.filter((p) => p.side === side);
    if (plays.length === 0) return;
    const { flipped } = plays[0];
    const socket = socketRef.current ?? await connectSocket();
    socket.emit('game:move', { gameId, tile: selectedTile, side, flipped });
    setSelectedTile(null);
  }, [selectedTile, validPlaysForSelected, gameId]);

  // When tile has exactly one valid play, play it immediately without asking for side
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

  const handleLeaveGame = () => {
    Alert.alert('Abandonar partida', 'Tem certeza? Você perderá a aposta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair', style: 'destructive',
        onPress: () => {
          clearGame();
          navigation.replace('Main');
        },
      },
    ]);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getPlayerForSeat = (seat: number) => currentGame?.players.find((p) => p.seat === seat);

  // ── Loading / waiting state ────────────────────────────────────────────────

  if (!currentGame) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Logo size="lg" />
        <Text style={styles.loadingText}>Entrando na partida...</Text>
      </View>
    );
  }

  const is4Player = currentGame.players.length === 4;
  const opponentIndex = currentGame.players.findIndex((p) => p.userId !== user?.id);

  return (
    <View style={styles.container}>

      {/* ── Disconnect banner ─────────────────────────────────────────────── */}
      {disconnected && (
        <View style={styles.disconnectBanner}>
          <Text style={styles.disconnectText}>⚠ Reconectando...</Text>
        </View>
      )}

      {/* ── Error toast ───────────────────────────────────────────────────── */}
      {gameError && (
        <Animated.View style={[styles.errorToast, { opacity: errorFadeAnim }]}>
          <Text style={styles.errorToastText}>{gameError}</Text>
        </Animated.View>
      )}

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.playerSlot}>
          {is4Player
            ? <PlayerBadge player={getPlayerForSeat(2)} />
            : <PlayerBadge player={getPlayerForSeat(opponentIndex)} />
          }
        </View>

        <View style={styles.centerInfo}>
          <Logo size="sm" />
          {is4Player && (
            <View style={styles.vsRow}>
              <PlayerBadge player={getPlayerForSeat(3)} compact />
              <Text style={styles.vsText}>VS</Text>
              <PlayerBadge player={getPlayerForSeat(1)} compact />
            </View>
          )}
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLeaveGame}>
            <Text style={styles.iconText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Game table ────────────────────────────────────────────────────── */}
      <View style={styles.tableContainer}>
        <View style={styles.table}>
          <View style={styles.tableFelt}>

            {/* Board tiles */}
            <View style={styles.boardArea}>
              {currentGame.board.length === 0 ? (
                <View style={styles.logoWatermark}>
                  <Logo size="lg" />
                </View>
              ) : (
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
            </View>

            {/* Open ends indicator */}
            {currentGame.firstPlayMade && (
              <View style={styles.openEnds}>
                <OpenEndBadge label="←" value={currentGame.leftOpen} />
                <OpenEndBadge label="→" value={currentGame.rightOpen} />
                {currentGame.topOpen !== undefined && (
                  <OpenEndBadge label="↑" value={currentGame.topOpen} />
                )}
                {currentGame.bottomOpen !== undefined && (
                  <OpenEndBadge label="↓" value={currentGame.bottomOpen} />
                )}
              </View>
            )}

            {/* Turn timer — only shown when it's my turn */}
            {isMyTurn && (
              <View style={[
                styles.timerBadge,
                { backgroundColor: turnTimer <= 10 ? colors.error + 'cc' : colors.overlay50 },
              ]}>
                <Text style={styles.timerText}>{turnTimer}s</Text>
              </View>
            )}

          </View>
        </View>

        {/* Opponent tile counts */}
        <View style={styles.opponentHands}>
          {currentGame.players
            .filter((p) => p.userId !== user?.id)
            .map((p) => (
              <View key={p.userId} style={styles.opponentHand}>
                <Text style={styles.opponentName}>
                  {p.isBot ? '🤖 Bot' : `Jogador ${p.seat + 1}`}
                </Text>
                <View style={styles.faceDownTiles}>
                  {Array.from({ length: Math.min(p.hand.length, 7) }).map((_, i) => (
                    <DominoTile key={i} tile={null} faceDown size="sm" />
                  ))}
                </View>
                <View style={[styles.scoreChip, { backgroundColor: p.team === 1 ? '#16a34a44' : '#7c3aed44' }]}>
                  <Text style={styles.scoreText}>{p.hand.length} pedras</Text>
                </View>
              </View>
            ))}
        </View>
      </View>

      {/* ── Bottom bar: my hand + action controls ─────────────────────────── */}
      <View style={styles.bottomBar}>

        {/* Avatar + turn status */}
        <View style={styles.myInfo}>
          <View style={[styles.avatar, isMyTurn && styles.avatarActive]}>
            <Text style={styles.avatarText}>{user?.name?.[0] || '?'}</Text>
          </View>
          <Text style={styles.myName}>{user?.name || 'Eu'}</Text>
          <Text style={[styles.turnText, isMyTurn && styles.turnTextActive]}>
            {isMyTurn ? '● Sua vez' : '○ Aguardando'}
          </Text>
        </View>

        {/* Hand tiles */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.handScroll}
          contentContainerStyle={styles.hand}
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
                {isMyTurn && isPlayable && !isSelected && (
                  <View style={styles.playableIndicator} />
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.actions}>

          {/* Side selection — shown when tile is selected */}
          {selectedTile && validPlaysForSelected.length > 0 && (
            <View style={styles.playOptions}>
              {/* If only one play option, show a single "Jogar" button */}
              {uniqueSides.length === 1 ? (
                <TouchableOpacity style={styles.playBtnPrimary} onPress={handlePlayImmediate}>
                  <Text style={styles.playBtnText}>Jogar</Text>
                </TouchableOpacity>
              ) : (
                uniqueSides.map((side) => (
                  <TouchableOpacity
                    key={side}
                    style={styles.playBtn}
                    onPress={() => handlePlayTile(side)}
                  >
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

          {/* Selected tile has no valid plays */}
          {selectedTile && validPlaysForSelected.length === 0 && (
            <Text style={styles.noPlaysText}>Sem jogadas válidas</Text>
          )}

          {/* Draw / Pass — only shown when no tile is selected and it's my turn */}
          {!selectedTile && isMyTurn && (
            <View style={styles.passDrawOptions}>
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

          <Text style={styles.boneyardCount}>
            {currentGame.boneyard.length} no estoque
          </Text>
        </View>
      </View>

      {/* ── Result Modal ──────────────────────────────────────────────────── */}
      <Modal visible={resultModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ResultCard
            result={useGameStore.getState().gameResult}
            userId={user?.id}
            onClose={() => {
              setResultModal(false);
              clearGame();
              navigation.replace('Main');
            }}
          />
        </View>
      </Modal>

    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerBadge({ player, compact }: { player: any; compact?: boolean }) {
  if (!player) return null;
  const name = player.isBot ? '🤖 Bot' : `P${player.seat + 1}`;
  const isActive = false; // could wire to currentPlayerIndex later
  return (
    <View style={[badgeStyles.container, compact && badgeStyles.compact]}>
      <View style={[
        badgeStyles.avatar,
        { backgroundColor: player.team === 1 ? colors.primary : '#7c3aed' },
        isActive && badgeStyles.avatarActive,
      ]}>
        <Text style={badgeStyles.avatarText}>{name[0]}</Text>
      </View>
      {!compact && <Text style={badgeStyles.name}>{name}</Text>}
    </View>
  );
}

function OpenEndBadge({ label, value }: { label: string; value: number }) {
  return (
    <View style={openEndStyles.badge}>
      <Text style={openEndStyles.label}>{label}</Text>
      <Text style={openEndStyles.value}>{value}</Text>
    </View>
  );
}

function ResultCard({ result, userId, onClose }: { result: any; userId?: string; onClose: () => void }) {
  const isWinner = result?.winnerId === userId;
  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultEmoji}>{isWinner ? '🏆' : '😔'}</Text>
      <Text style={styles.resultTitle}>{isWinner ? 'Você ganhou!' : 'Fim de jogo'}</Text>
      {result?.prizePerWinner > 0 && (
        <Text style={styles.resultPrize}>
          Prêmio: R$ {result.prizePerWinner.toFixed(2)}
        </Text>
      )}
      <TouchableOpacity style={styles.resultBtn} onPress={onClose}>
        <Text style={styles.resultBtnText}>Jogar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const badgeStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compact: { flexDirection: 'column', gap: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarActive: { borderWidth: 2, borderColor: colors.primary },
  avatarText: { color: '#000', fontWeight: '700', fontSize: 14 },
  name: { color: colors.textPrimary, fontSize: fonts.sizes.sm, fontWeight: '600' },
});

const openEndStyles = StyleSheet.create({
  badge: {
    backgroundColor: colors.overlay50,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: 'center',
  },
  label: { color: colors.textMuted, fontSize: 9 },
  value: { color: colors.textPrimary, fontWeight: '700', fontSize: fonts.sizes.sm },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  loadingText: { color: colors.textMuted, fontSize: fonts.sizes.lg },

  disconnectBanner: {
    backgroundColor: colors.warning,
    paddingVertical: 6,
    alignItems: 'center',
  },
  disconnectText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },

  errorToast: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: colors.error,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    zIndex: 100,
    ...shadows.card,
  },
  errorToastText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bgOverlay,
  },
  playerSlot: { flex: 1 },
  centerInfo: { flex: 2, alignItems: 'center', gap: spacing.xs },
  vsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  vsText: { color: colors.textMuted, fontWeight: '700', fontSize: fonts.sizes.sm },
  topActions: { flex: 1, alignItems: 'flex-end' },
  iconBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { color: colors.textMuted, fontWeight: '700' },

  tableContainer: { flex: 1, padding: spacing.md, gap: spacing.sm },
  table: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tableFelt: {
    width: '85%', aspectRatio: 2.2,
    backgroundColor: colors.bgTable,
    borderRadius: 200,
    borderWidth: 4, borderColor: colors.bgTableBorder,
    alignItems: 'center', justifyContent: 'center',
    ...shadows.card,
  },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: spacing.xl },
  boardTiles: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md },
  logoWatermark: { opacity: 0.15 },
  openEnds: { position: 'absolute', bottom: 8, flexDirection: 'row', gap: spacing.sm },
  timerBadge: { position: 'absolute', top: 8, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  timerText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },

  opponentHands: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.md },
  opponentHand: { alignItems: 'center', gap: 4 },
  opponentName: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  faceDownTiles: { flexDirection: 'row', gap: 2 },
  scoreChip: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  scoreText: { color: colors.textSecondary, fontSize: fonts.sizes.xs, fontWeight: '600' },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, paddingBottom: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bgOverlay, gap: spacing.md,
  },
  myInfo: { alignItems: 'center', gap: 2, width: 72 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarActive: { borderWidth: 2, borderColor: colors.primary },
  avatarText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.md },
  myName: { color: colors.textPrimary, fontSize: fonts.sizes.xs, fontWeight: '600', textAlign: 'center' },
  turnText: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  turnTextActive: { color: colors.primary },

  handScroll: { flex: 1 },
  hand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  tileUnplayable: { opacity: 0.4 },
  playableIndicator: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.primary,
    alignSelf: 'center',
    marginTop: 2,
  },

  actions: { alignItems: 'center', gap: spacing.xs, minWidth: 110 },
  playOptions: { alignItems: 'center', gap: spacing.xs },
  playBtnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 8, paddingHorizontal: 20,
  },
  playBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.xs },
  cancelText: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  noPlaysText: { color: colors.textMuted, fontSize: fonts.sizes.xs, textAlign: 'center' },

  passDrawOptions: { gap: spacing.xs, alignItems: 'center' },
  drawBtn: {
    backgroundColor: colors.bgCard, borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  drawBtnText: { color: colors.textPrimary, fontSize: fonts.sizes.xs },
  passBtn: {
    backgroundColor: colors.bgCard, borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  passBtnText: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  boneyardCount: { color: colors.textMuted, fontSize: 10 },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay80, alignItems: 'center', justifyContent: 'center' },
  resultCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl, padding: spacing.xxxl,
    alignItems: 'center', gap: spacing.lg,
    borderWidth: 1, borderColor: colors.border, minWidth: 280,
  },
  resultEmoji: { fontSize: 56 },
  resultTitle: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.textPrimary },
  resultPrize: { fontSize: fonts.sizes.xl, fontWeight: '700', color: colors.gold },
  resultBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: spacing.md,
  },
  resultBtnText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.md },
});
