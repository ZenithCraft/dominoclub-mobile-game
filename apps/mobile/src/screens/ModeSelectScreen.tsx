import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ImageBackground, ScrollView,
  TouchableOpacity, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius } from '../theme';
import { Button } from '../components/Button';
import { useGameStore } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { connectSocket } from '../services/socket';
import { api } from '../services/api';
import { toast } from '../store/toast.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { mode?: string } };
};

const IS_TORNEIO = (mode?: string) => mode === 'TORNEIO';

// ── Room data for Livre mode ────────────────────────────────────────────────

interface RoomOption {
  id: string;
  buyIn: number | null; // null = Grátis
  prize: number;
  players: number;
  max: number;
}

const LIVRE_1V1: RoomOption[] = [
  { id: 'l1', buyIn: null, prize: 0,    players: 10, max: 21 },
  { id: 'l2', buyIn: 2,    prize: 3.8,  players: 10, max: 21 },
  { id: 'l3', buyIn: 10,   prize: 19,   players: 10, max: 21 },
  { id: 'l4', buyIn: 25,   prize: 47.5, players: 10, max: 21 },
  { id: 'l5', buyIn: 50,   prize: 95,   players: 10, max: 21 },
];

const LIVRE_2V2: RoomOption[] = [
  { id: 'd1', buyIn: null, prize: 0,    players: 10, max: 21 },
  { id: 'd2', buyIn: 2,    prize: 3.8,  players: 10, max: 21 },
  { id: 'd3', buyIn: 10,   prize: 19,   players: 10, max: 21 },
  { id: 'd4', buyIn: 25,   prize: 47.5, players: 10, max: 21 },
  { id: 'd5', buyIn: 50,   prize: 95,   players: 10, max: 21 },
];

// ── Tournament data type ────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  status: string;
  entry_fee: number;
  prize_pool: number;
  max_players: number;
  current_players: number;
  starts_at: string;
}

const fmtBrl = (n: number) =>
  n % 1 === 0
    ? `R$ ${n}`
    : `R$ ${n.toFixed(1).replace('.', ',')}`;

// ── Room Card ───────────────────────────────────────────────────────────────

function RoomCard({ room, onJoin }: { room: RoomOption; onJoin: () => void }) {
  const isFree = room.buyIn === null;
  return (
    <TouchableOpacity
      style={[styles.roomCard, isFree ? styles.roomCardFree : styles.roomCardPaid]}
      activeOpacity={0.85}
      onPress={onJoin}
    >
      <View style={styles.roomRow}>
        <Text style={styles.roomIcon}>👤</Text>
        <Text style={styles.roomCount}>Jogadores</Text>
      </View>
      <Text style={styles.roomPlayers}>{room.players}/{room.max}</Text>

      <Text style={styles.roomFieldLabel}>Buy in</Text>
      <View style={[styles.pill, styles.pillGray]}>
        <Text style={styles.pillText}>{isFree ? 'Grátis' : `R$ ${room.buyIn}`}</Text>
      </View>

      <Text style={styles.roomFieldLabel}>Prêmio</Text>
      <View style={[styles.pill, room.prize > 0 ? styles.pillGold : styles.pillGray]}>
        <Text style={[styles.pillText, room.prize > 0 && styles.pillTextGold]}>
          {fmtBrl(room.prize)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Tournament Card ─────────────────────────────────────────────────────────

function TournamentCard({ t, onJoin }: { t: Tournament; onJoin: () => void }) {
  const mins = Math.max(0, Math.round((new Date(t.starts_at).getTime() - Date.now()) / 60000));
  const timerStr = mins > 60
    ? `${Math.floor(mins / 60)}h${mins % 60}m`
    : `00:${String(mins).padStart(2, '0')}:20`;

  const isExpiring = mins < 15;

  return (
    <View style={styles.tourCard}>
      <View style={[styles.tourTimer, isExpiring ? styles.tourTimerRed : styles.tourTimerGreen]}>
        <Text style={styles.tourTimerText}>{timerStr}</Text>
      </View>
      <Text style={styles.tourName}>{t.name}</Text>

      <View style={styles.roomRow}>
        <Text style={styles.roomIcon}>👤</Text>
        <Text style={styles.tourPlayers}>Jogadores {t.current_players}/{t.max_players}</Text>
      </View>

      <Text style={styles.roomFieldLabel}>Inscrição</Text>
      <View style={[styles.pill, styles.pillGray]}>
        <Text style={styles.pillText}>R${t.entry_fee}</Text>
      </View>

      <Text style={styles.roomFieldLabel}>Prêmio</Text>
      <View style={[styles.pill, styles.pillGold]}>
        <Text style={[styles.pillText, styles.pillTextGold]}>R${t.prize_pool.toLocaleString('pt-BR')}</Text>
      </View>

      <TouchableOpacity style={styles.joinBtn} onPress={onJoin}>
        <Text style={styles.joinBtnText}>Entrar</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export function ModeSelectScreen({ navigation, route }: Props) {
  const mode = route.params?.mode ?? 'LIVRE';
  const isTorneio = IS_TORNEIO(mode);

  const { user, refreshUser } = useAuthStore();
  const { setQueueStatus } = useGameStore();
  const [onlineCount, setOnlineCount]   = useState(6654);
  const [tournaments, setTournaments]   = useState<Tournament[]>([]);
  const [tourLoading, setTourLoading]   = useState(false);
  const [tourRefreshing, setTourRefreshing] = useState(false);
  const [confirmTour, setConfirmTour]   = useState<Tournament | null>(null);
  const [joining, setJoining]           = useState(false);
  const [searching, setSearching]       = useState(false);

  useEffect(() => {
    connectSocket().then((s) => {
      s.on('online:count', ({ count }: { count: number }) => setOnlineCount(count));
    });
    if (isTorneio) fetchTournaments();
  }, []);

  const fetchTournaments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setTourRefreshing(true); else setTourLoading(true);
    try {
      const { data } = await api.get('/game/tournaments');
      setTournaments(data.tournaments ?? []);
    } finally {
      setTourLoading(false); setTourRefreshing(false);
    }
  }, []);

  const handleJoinRoom = async (room: RoomOption) => {
    setSearching(true);
    setQueueStatus('queuing');
    const gameMode = room.id.startsWith('d') ? 'RECREATIONAL_2V2' : 'ARENA_1V1';
    const socket = await connectSocket();
    socket.emit('queue:join', { mode: gameMode, betAmount: room.buyIn ?? 0 });
    socket.once('game:found', ({ gameId }: { gameId: string }) => {
      setQueueStatus('found');
      navigation.replace('Game', { gameId });
    });
    socket.once('queue:error', ({ message }: { message: string }) => {
      setSearching(false); setQueueStatus('idle'); toast.error(message);
    });
  };

  const handleJoinTournament = async () => {
    if (!confirmTour) return;
    setJoining(true);
    try {
      await api.post(`/game/tournaments/${confirmTour.id}/join`);
      await refreshUser();
      toast.success('Inscrição confirmada!');
      fetchTournaments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao entrar no torneio');
    } finally {
      setJoining(false); setConfirmTour(null);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={styles.root}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.onlineRow}>
          <Text style={styles.onlineIcon}>👥</Text>
          <Text style={styles.onlineText}>Jogadores online {onlineCount.toLocaleString('pt-BR')}</Text>
        </View>

        <View style={styles.topRight}>
          <View style={styles.balancePill}>
            <Text style={styles.balanceText}>
              R$ {(user?.wallet?.real_balance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn}>
            <Text style={styles.addText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.iconText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.replace('Main')}>
            <Text style={styles.iconText}>⊣</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isTorneio
            ? <RefreshControl refreshing={tourRefreshing} onRefresh={() => fetchTournaments(true)} tintColor="#4ade80" />
            : undefined
        }
      >
        {/* ── Livre mode ── */}
        {!isTorneio && (
          <>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Jogos individuais (1x1)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
                {LIVRE_1V1.map((r) => (
                  <RoomCard key={r.id} room={r} onJoin={() => handleJoinRoom(r)} />
                ))}
              </ScrollView>
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Jogos em duplas (2x2) com parceiro aleatório</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
                {LIVRE_2V2.map((r) => (
                  <RoomCard key={r.id} room={r} onJoin={() => handleJoinRoom(r)} />
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {/* ── Torneio mode ── */}
        {isTorneio && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Torneios individuais (1x1)</Text>
            {tourLoading ? (
              <ActivityIndicator color="#4ade80" style={{ marginTop: spacing.xl }} />
            ) : tournaments.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum torneio disponível agora</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
                {tournaments.map((t) => (
                  <TournamentCard key={t.id} t={t} onJoin={() => setConfirmTour(t)} />
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </ScrollView>

      {/* Searching overlay */}
      {searching && (
        <View style={styles.searchingOverlay}>
          <ActivityIndicator color="#4ade80" size="large" />
          <Text style={styles.searchingText}>Procurando partida...</Text>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={async () => {
              const s = await connectSocket();
              s.emit('queue:leave');
              setSearching(false);
              setQueueStatus('idle');
            }}
          >
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tournament confirm modal */}
      <Modal visible={!!confirmTour} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !joining && setConfirmTour(null)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Confirmar inscrição</Text>
            {confirmTour && (
              <>
                <Text style={styles.modalTourName}>{confirmTour.name}</Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Taxa de entrada</Text>
                  <Text style={styles.modalValue}>R$ {confirmTour.entry_fee}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Prêmio</Text>
                  <Text style={[styles.modalValue, { color: '#fbbf24' }]}>R$ {confirmTour.prize_pool.toLocaleString('pt-BR')}</Text>
                </View>
                <View style={styles.modalActions}>
                  <Button title="Cancelar" onPress={() => setConfirmTour(null)} variant="ghost" style={{ flex: 1 }} disabled={joining} />
                  <Button title="Confirmar" onPress={handleJoinTournament} loading={joining} style={{ flex: 1 }} />
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

const LIME = '#4ade80';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,222,128,0.15)',
  },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  onlineIcon: { fontSize: 16 },
  onlineText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },
  topRight:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balancePill: {
    backgroundColor: LIME, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  balanceText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },
  addBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center', justifyContent: 'center',
  },
  addText: { color: '#fff', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  iconBtn: {
    width: 34, height: 34, borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { color: '#fff', fontSize: 16 },

  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xl },

  section: { gap: spacing.md },
  sectionContainer: {
    backgroundColor: 'rgba(8, 20, 8, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.18)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md,
  },
  cardsRow: { gap: spacing.md, paddingBottom: spacing.xs },

  // Room card
  roomCard: {
    width: 140,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
  },
  roomCardFree: {
    backgroundColor: 'rgba(220,220,220,0.10)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  roomCardPaid: {
    backgroundColor: 'rgba(8, 28, 8, 0.90)',
    borderColor: 'rgba(74,222,128,0.30)',
  },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roomIcon: { fontSize: 12 },
  roomCount: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  roomPlayers: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  roomFieldLabel: { color: colors.textMuted, fontSize: fonts.sizes.xs, marginTop: spacing.xs },

  pill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  pillGray: { backgroundColor: 'rgba(255,255,255,0.12)' },
  pillGold: { backgroundColor: '#fbbf24' },
  pillText: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.xs },
  pillTextGold: { color: '#000' },

  // Tournament card
  tourCard: {
    width: 170,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(8, 28, 8, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.30)',
    padding: spacing.md,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  tourTimer: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  tourTimerRed:   { backgroundColor: '#dc2626' },
  tourTimerGreen: { backgroundColor: '#16a34a' },
  tourTimerText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.xs },
  tourName: { color: '#fff', fontWeight: '600', fontSize: fonts.sizes.sm },
  tourPlayers: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  joinBtn: {
    backgroundColor: LIME,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  joinBtnText: { color: '#000', fontWeight: '700', fontSize: fonts.sizes.sm },

  emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },

  // Searching overlay
  searchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  searchingText: { color: '#fff', fontSize: fonts.sizes.lg, fontWeight: '600' },
  cancelBtn: {
    borderWidth: 1, borderColor: LIME, borderRadius: radius.md,
    paddingVertical: 10, paddingHorizontal: 32,
  },
  cancelBtnText: { color: LIME, fontWeight: '700' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: 320,
    backgroundColor: 'rgba(8,30,8,0.98)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.xl, textAlign: 'center' },
  modalTourName: { color: colors.textMuted, fontSize: fonts.sizes.sm, textAlign: 'center' },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalLabel: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  modalValue: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
