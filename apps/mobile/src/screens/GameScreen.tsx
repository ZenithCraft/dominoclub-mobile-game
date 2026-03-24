import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { DominoTile } from '../components/DominoTile';
import { Logo } from '../components/Logo';
import { connectSocket } from '../services/socket';
import { useGameStore, Tile, GameState, PlacedTile } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params: { gameId: string } };
};

const { width: SW, height: SH } = Dimensions.get('window');

export function GameScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { user } = useAuthStore();
  const { currentGame, selectedTile, setGame, setSelectedTile, setGameResult, clearGame } = useGameStore();
  const [turnTimer, setTurnTimer] = useState(30);
  const [resultModal, setResultModal] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    connectSocket().then((socket) => {
      socket.emit('game:join', { gameId });

      socket.on('game:state', (state: GameState) => {
        setGame(state);
        resetTurnTimer();
      });

      socket.on('game:ended', (result: any) => {
        setGameResult(result);
        setResultModal(true);
      });

      socket.on('game:timeout', ({ userId }: { userId: string }) => {
        if (userId !== user?.id) {
          // visual feedback that opponent timed out
        }
      });

      return () => {
        socket.off('game:state');
        socket.off('game:ended');
        socket.off('game:timeout');
        socket.emit('game:leave', { gameId });
      };
    });
  }, [gameId]);

  const resetTurnTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTurnTimer(30);
    timerRef.current = setInterval(() => {
      setTurnTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const myPlayerIndex = currentGame?.players.findIndex((p) => p.userId === user?.id) ?? -1;
  const isMyTurn = currentGame?.currentPlayerIndex === myPlayerIndex;
  const myHand = (currentGame?.players[myPlayerIndex]?.hand || []) as (Tile | null)[];

  const handleTileSelect = (tile: Tile) => {
    if (!isMyTurn) return;
    setSelectedTile(selectedTile?.[0] === tile[0] && selectedTile?.[1] === tile[1] ? null : tile);
  };

  const handlePlayTile = async (side: 'left' | 'right') => {
    if (!selectedTile) return;
    const socket = await connectSocket();
    socket.emit('game:move', { gameId, tile: selectedTile, side, flipped: false });
    setSelectedTile(null);
  };

  const handlePass = async () => {
    const socket = await connectSocket();
    socket.emit('game:pass', { gameId });
  };

  const handleDraw = async () => {
    const socket = await connectSocket();
    socket.emit('game:draw', { gameId });
  };

  const handleLeaveGame = () => {
    Alert.alert('Abandonar partida', 'Tem certeza? Você perderá a aposta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair', style: 'destructive',
        onPress: () => {
          clearGame();
          navigation.replace('Home');
        }
      },
    ]);
  };

  const getPlayerForSeat = (seat: number) => currentGame?.players.find((p) => p.seat === seat);

  if (!currentGame) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.textPrimary, fontSize: fonts.sizes.lg }}>Carregando...</Text>
      </View>
    );
  }

  const is4Player = currentGame.players.length === 4;

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.playerSlot}>
          {is4Player ? (
            <PlayerBadge player={getPlayerForSeat(2)} />
          ) : (
            <PlayerBadge player={getPlayerForSeat(currentGame.players.findIndex((p) => p.userId !== user?.id))} />
          )}
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

      {/* Game table */}
      <View style={styles.tableContainer}>
        {/* Oval felt table */}
        <View style={styles.table}>
          <View style={styles.tableFelt}>
            {/* Board tiles */}
            <View style={styles.boardArea}>
              {currentGame.board.length === 0 ? (
                <View style={styles.logoWatermark}>
                  <Logo size="lg" />
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardTiles}>
                  {currentGame.board.map((pt, i) => (
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
                <View style={styles.openEndBadge}>
                  <Text style={styles.openEndText}>{currentGame.leftOpen}</Text>
                </View>
                <View style={styles.openEndBadge}>
                  <Text style={styles.openEndText}>{currentGame.rightOpen}</Text>
                </View>
              </View>
            )}

            {/* Turn timer */}
            {isMyTurn && (
              <View style={[styles.timerBadge, { backgroundColor: turnTimer <= 10 ? colors.error + 'cc' : colors.overlay50 }]}>
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
                <Text style={styles.opponentName}>{p.userId.startsWith('bot_') ? '🤖 Bot' : `Jogador ${p.seat + 1}`}</Text>
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

      {/* My hand + controls */}
      <View style={styles.bottomBar}>
        <View style={styles.myInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0] || '?'}</Text>
          </View>
          <View>
            <Text style={styles.myName}>{user?.name || 'Eu'}</Text>
            <Text style={[styles.turnText, isMyTurn && styles.turnTextActive]}>
              {isMyTurn ? '● Sua vez' : '○ Aguardando'}
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.handScroll} contentContainerStyle={styles.hand}>
          {myHand.map((tile, i) =>
            tile ? (
              <DominoTile
                key={`${tile[0]}-${tile[1]}-${i}`}
                tile={tile}
                selected={selectedTile?.[0] === tile[0] && selectedTile?.[1] === tile[1]}
                onPress={() => handleTileSelect(tile)}
                size="md"
              />
            ) : null
          )}
        </ScrollView>

        <View style={styles.actions}>
          {selectedTile && (
            <View style={styles.playOptions}>
              <TouchableOpacity style={styles.playBtn} onPress={() => handlePlayTile('left')}>
                <Text style={styles.playBtnText}>← Esquerda</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.playBtn} onPress={() => handlePlayTile('right')}>
                <Text style={styles.playBtnText}>Direita →</Text>
              </TouchableOpacity>
            </View>
          )}
          {isMyTurn && !selectedTile && (
            <View style={styles.passDrawOptions}>
              <TouchableOpacity style={styles.drawBtn} onPress={handleDraw}>
                <Text style={styles.drawBtnText}>🎲 Comprar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.passBtn} onPress={handlePass}>
                <Text style={styles.passBtnText}>Passar</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.boneyardCount}>
            {currentGame.boneyard.length} no estoque
          </Text>
        </View>
      </View>

      {/* Result Modal */}
      <Modal visible={resultModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultEmoji}>
              {useGameStore.getState().gameResult?.winnerId === user?.id ? '🏆' : '😔'}
            </Text>
            <Text style={styles.resultTitle}>
              {useGameStore.getState().gameResult?.winnerId === user?.id ? 'Você ganhou!' : 'Fim de jogo'}
            </Text>
            <Text style={styles.resultPrize}>
              Prêmio: R$ {useGameStore.getState().gameResult?.prizePerWinner?.toFixed(2) || '0.00'}
            </Text>
            <TouchableOpacity
              style={styles.resultBtn}
              onPress={() => {
                setResultModal(false);
                clearGame();
                navigation.replace('Home');
              }}
            >
              <Text style={styles.resultBtnText}>Jogar novamente</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PlayerBadge({ player, compact }: { player: any; compact?: boolean }) {
  if (!player) return null;
  const name = player.isBot ? '🤖 Bot' : `P${player.seat + 1}`;
  return (
    <View style={[badgeStyles.container, compact && badgeStyles.compact]}>
      <View style={[badgeStyles.avatar, { backgroundColor: player.team === 1 ? colors.primary : '#7c3aed' }]}>
        <Text style={badgeStyles.avatarText}>{name[0]}</Text>
      </View>
      {!compact && <Text style={badgeStyles.name}>{name}</Text>}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compact: { flexDirection: 'column', gap: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#000', fontWeight: '700', fontSize: 14 },
  name: { color: colors.textPrimary, fontSize: fonts.sizes.sm, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  iconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
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
  openEnds: { position: 'absolute', bottom: 8, flexDirection: 'row', gap: spacing.lg },
  openEndBadge: { backgroundColor: colors.overlay50, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  openEndText: { color: colors.textPrimary, fontWeight: '700', fontSize: fonts.sizes.sm },
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
  myInfo: { alignItems: 'center', gap: 4, width: 80 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.md },
  myName: { color: colors.textPrimary, fontSize: fonts.sizes.xs, fontWeight: '600', textAlign: 'center' },
  turnText: { color: colors.textMuted, fontSize: fonts.sizes.xs, textAlign: 'center' },
  turnTextActive: { color: colors.primary },
  handScroll: { flex: 1 },
  hand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  actions: { alignItems: 'center', gap: spacing.xs, minWidth: 120 },
  playOptions: { gap: spacing.xs },
  playBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 12 },
  playBtnText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.xs },
  passDrawOptions: { flexDirection: 'row', gap: spacing.xs },
  drawBtn: { backgroundColor: colors.bgCard, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
  drawBtnText: { color: colors.textPrimary, fontSize: fonts.sizes.xs },
  passBtn: { backgroundColor: colors.bgCard, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
  passBtnText: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  boneyardCount: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay80, alignItems: 'center', justifyContent: 'center' },
  resultCard: { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.xxxl, alignItems: 'center', gap: spacing.lg, borderWidth: 1, borderColor: colors.border, minWidth: 280 },
  resultEmoji: { fontSize: 56 },
  resultTitle: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.textPrimary },
  resultPrize: { fontSize: fonts.sizes.xl, fontWeight: '700', color: colors.gold },
  resultBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 32, marginTop: spacing.md },
  resultBtnText: { color: '#000', fontWeight: '800', fontSize: fonts.sizes.md },
});
