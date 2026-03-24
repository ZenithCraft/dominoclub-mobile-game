import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
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

type Tab = 'quickmatch' | 'tournaments';

interface Tournament {
  id: string;
  name: string;
  mode: string;
  variant: string;
  status: string;
  entry_fee: number;
  prize_pool: number;
  max_players: number;
  current_players: number;
  current_round: number;
  starts_at: string;
}

const BET_OPTIONS = [5, 10, 20, 50, 100, 200];

const MODE_OPTIONS = [
  { id: 'ARENA_1V1',        label: '1 vs 1',       icon: '⚔️', desc: 'Partida rápida' },
  { id: 'RECREATIONAL_2V2', label: '2 vs 2',        icon: '👥', desc: 'Equipes aleatórias' },
  { id: 'CUP_1V1',          label: 'Copa 1v1',      icon: '🏆', desc: 'Formato eliminatório' },
];

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberto',
  FULL: 'Lotado',
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: colors.success,
  FULL: colors.warning,
  IN_PROGRESS: colors.info,
  FINISHED: colors.textMuted,
  CANCELLED: colors.error,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ModeSelectScreen({ navigation, route }: Props) {
  const isTournamentMode = route.params?.mode === 'TOURNAMENT_2V2';
  const [tab, setTab] = useState<Tab>(isTournamentMode ? 'tournaments' : 'quickmatch');

  // ── Quick match state ────────────────────────────────────────────────────────
  const [selectedMode, setSelectedMode] = useState<string>(
    route.params?.mode && route.params.mode !== 'TOURNAMENT_2V2'
      ? route.params.mode
      : 'ARENA_1V1'
  );
  const [betAmount, setBetAmount] = useState<number>(10);
  const [searching, setSearching] = useState(false);
  const { setQueueStatus } = useGameStore();

  // ── Tournament state ─────────────────────────────────────────────────────────
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [tourRefreshing, setTourRefreshing] = useState(false);
  const [confirmTour, setConfirmTour] = useState<Tournament | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinedTourId, setJoinedTourId] = useState<string | null>(null);

  const { user, refreshUser } = useAuthStore();
  const balance = user?.wallet?.real_balance ?? 0;

  // ── Fetch tournaments ────────────────────────────────────────────────────────
  const fetchTournaments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setTourRefreshing(true);
    else setTourLoading(true);
    try {
      const { data } = await api.get('/game/tournaments');
      setTournaments(data.tournaments ?? []);
    } finally {
      setTourLoading(false);
      setTourRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'tournaments') fetchTournaments();
  }, [tab]);

  // ── Quick match handlers ─────────────────────────────────────────────────────
  const handleSearch = async () => {
    setSearching(true);
    setQueueStatus('queuing');

    const socket = await connectSocket();
    socket.emit('queue:join', { mode: selectedMode, betAmount });

    socket.once('game:found', ({ gameId }: { gameId: string }) => {
      setQueueStatus('found');
      navigation.replace('Game', { gameId });
    });

    socket.once('queue:error', ({ message }: { message: string }) => {
      setSearching(false);
      setQueueStatus('idle');
      toast.error(message);
    });
  };

  const handleCancel = async () => {
    const socket = await connectSocket();
    socket.emit('queue:leave');
    setSearching(false);
    setQueueStatus('idle');
  };

  // ── Tournament handlers ──────────────────────────────────────────────────────
  const handleJoinConfirm = async () => {
    if (!confirmTour) return;
    setJoining(true);
    try {
      await api.post(`/game/tournaments/${confirmTour.id}/join`);
      await refreshUser();
      setJoinedTourId(confirmTour.id);
      toast.success('Inscrição confirmada!');
      fetchTournaments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao entrar no torneio');
    } finally {
      setJoining(false);
      setConfirmTour(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.bgPattern} pointerEvents="none">
        {Array.from({ length: 40 }).map((_, i) => <View key={i} style={styles.bgTile} />)}
      </View>

      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Jogar</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'quickmatch' && styles.tabActive]}
            onPress={() => setTab('quickmatch')}
          >
            <Text style={[styles.tabText, tab === 'quickmatch' && styles.tabTextActive]}>
              Partida Rápida
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'tournaments' && styles.tabActive]}
            onPress={() => setTab('tournaments')}
          >
            <Text style={[styles.tabText, tab === 'tournaments' && styles.tabTextActive]}>
              Torneios
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick Match Tab ── */}
        {tab === 'quickmatch' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>Modo</Text>
            <View style={styles.modeRow}>
              {MODE_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modeBtn, selectedMode === m.id && styles.modeBtnActive]}
                  onPress={() => setSelectedMode(m.id)}
                >
                  <Text style={styles.modeBtnIcon}>{m.icon}</Text>
                  <Text style={[styles.modeBtnText, selectedMode === m.id && styles.modeBtnTextActive]}>
                    {m.label}
                  </Text>
                  <Text style={styles.modeBtnDesc}>{m.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Aposta</Text>
            <View style={styles.betGrid}>
              {BET_OPTIONS.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[styles.betBtn, betAmount === amount && styles.betBtnActive]}
                  onPress={() => setBetAmount(amount)}
                >
                  <Text style={[styles.betBtnText, betAmount === amount && styles.betBtnTextActive]}>
                    R${amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {balance < betAmount && (
              <Text style={styles.balanceWarn}>
                Saldo insuficiente (R$ {balance.toFixed(2)})
              </Text>
            )}

            {searching ? (
              <View style={styles.searchingBox}>
                <View style={styles.searchingDots}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={[styles.dot, { opacity: 0.3 + i * 0.3 }]} />
                  ))}
                </View>
                <Text style={styles.searchingText}>Procurando oponente...</Text>
                <Button title="Cancelar" onPress={handleCancel} variant="ghost" size="sm" />
              </View>
            ) : (
              <Button
                title="Buscar partida"
                onPress={handleSearch}
                disabled={balance < betAmount}
                style={styles.actionBtn}
              />
            )}
          </View>
        )}

        {/* ── Tournaments Tab ── */}
        {tab === 'tournaments' && (
          <ScrollView
            style={styles.tourScroll}
            contentContainerStyle={styles.tourContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={tourRefreshing}
                onRefresh={() => fetchTournaments(true)}
                tintColor={colors.primary}
              />
            }
          >
            {tourLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : tournaments.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>🏆</Text>
                <Text style={styles.emptyText}>Nenhum torneio disponível no momento</Text>
                <Text style={styles.emptySubtext}>Puxe para baixo para atualizar</Text>
              </View>
            ) : (
              tournaments.map((t) => (
                <TournamentCard
                  key={t.id}
                  tournament={t}
                  balance={balance}
                  joined={joinedTourId === t.id}
                  onJoin={() => setConfirmTour(t)}
                />
              ))
            )}
          </ScrollView>
        )}
      </View>

      {/* ── Enroll Confirmation Modal ── */}
      <Modal visible={!!confirmTour} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => !joining && setConfirmTour(null)}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Confirmar inscrição</Text>

            {confirmTour && (
              <>
                <Text style={styles.modalTourName}>{confirmTour.name}</Text>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Taxa de entrada</Text>
                  <Text style={styles.modalValue}>R$ {confirmTour.entry_fee.toFixed(2)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Prêmio acumulado</Text>
                  <Text style={[styles.modalValue, styles.modalPrize]}>
                    R$ {confirmTour.prize_pool.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Seu saldo após</Text>
                  <Text style={[
                    styles.modalValue,
                    balance - confirmTour.entry_fee < 0 && { color: colors.error },
                  ]}>
                    R$ {(balance - confirmTour.entry_fee).toFixed(2)}
                  </Text>
                </View>

                {balance < confirmTour.entry_fee ? (
                  <Text style={styles.modalError}>Saldo insuficiente para entrar neste torneio.</Text>
                ) : (
                  <Text style={styles.modalNote}>
                    O valor será debitado do seu saldo imediatamente. O torneio começa assim que todas
                    as vagas forem preenchidas.
                  </Text>
                )}

                <View style={styles.modalActions}>
                  <Button
                    title="Cancelar"
                    onPress={() => setConfirmTour(null)}
                    variant="ghost"
                    style={styles.modalBtn}
                    disabled={joining}
                  />
                  <Button
                    title="Confirmar"
                    onPress={handleJoinConfirm}
                    loading={joining}
                    disabled={balance < confirmTour.entry_fee}
                    style={styles.modalBtn}
                  />
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Tournament Card ──────────────────────────────────────────────────────────

function TournamentCard({
  tournament: t,
  balance,
  joined,
  onJoin,
}: {
  tournament: Tournament;
  balance: number;
  joined: boolean;
  onJoin: () => void;
}) {
  const filledPct = Math.min(1, t.current_players / t.max_players);
  const canJoin = (t.status === 'OPEN') && !joined && balance >= t.entry_fee;
  const statusColor = STATUS_COLOR[t.status] ?? colors.textMuted;

  return (
    <View style={styles.tourCard}>
      <View style={styles.tourCardHeader}>
        <View style={styles.tourCardLeft}>
          <Text style={styles.tourCardName}>{t.name}</Text>
          <Text style={styles.tourCardMeta}>
            {t.variant} · {formatDate(t.starts_at)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[t.status] ?? t.status}</Text>
        </View>
      </View>

      <View style={styles.tourCardStats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Entrada</Text>
          <Text style={styles.statValue}>R$ {t.entry_fee.toFixed(2)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Prêmio</Text>
          <Text style={[styles.statValue, styles.statGold]}>R$ {t.prize_pool.toFixed(2)}</Text>
        </View>
        {t.status === 'IN_PROGRESS' && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Rodada</Text>
            <Text style={styles.statValue}>{t.current_round}</Text>
          </View>
        )}
      </View>

      {/* Fill bar */}
      <View style={styles.fillBarWrap}>
        <View style={styles.fillBarBg}>
          <View style={[styles.fillBar, { width: `${filledPct * 100}%` as any }]} />
        </View>
        <Text style={styles.fillLabel}>
          {t.current_players}/{t.max_players} jogadores
        </Text>
      </View>

      {joined ? (
        <View style={styles.joinedBadge}>
          <Text style={styles.joinedText}>Inscrito — aguardando início</Text>
        </View>
      ) : (
        <Button
          title={
            t.status === 'OPEN'
              ? balance < t.entry_fee
                ? 'Saldo insuficiente'
                : 'Entrar no torneio'
              : STATUS_LABEL[t.status]
          }
          onPress={onJoin}
          disabled={!canJoin}
          size="sm"
          style={styles.joinBtn}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  bgPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  bgTile: { width: 60, height: 32, borderWidth: 1, borderColor: colors.primary, margin: 10, borderRadius: 3, opacity: 0.06 },

  card: {
    width: 440,
    maxHeight: '90%',
    backgroundColor: 'rgba(10,31,10,0.97)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  backArrow: { color: colors.textMuted, fontSize: fonts.sizes.xl, fontWeight: '600' },
  title: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.textMuted, fontWeight: '600', fontSize: fonts.sizes.sm },
  tabTextActive: { color: colors.primary },

  // ── Quick Match ──
  tabContent: { padding: spacing.xl, gap: spacing.md },
  sectionLabel: { fontSize: fonts.sizes.sm, fontWeight: '600', color: colors.textSecondary },

  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', gap: 4, backgroundColor: colors.bgCard,
  },
  modeBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(74,222,128,0.12)' },
  modeBtnIcon: { fontSize: 22 },
  modeBtnText: { fontSize: fonts.sizes.sm, fontWeight: '700', color: colors.textMuted },
  modeBtnTextActive: { color: colors.primary },
  modeBtnDesc: { fontSize: fonts.sizes.xs, color: colors.textMuted },

  betGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  betBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  betBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(74,222,128,0.15)' },
  betBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: fonts.sizes.sm },
  betBtnTextActive: { color: colors.primary },

  balanceWarn: { color: colors.error, fontSize: fonts.sizes.xs, textAlign: 'center' },
  actionBtn: { width: '100%', marginTop: spacing.xs },

  searchingBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  searchingDots: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  searchingText: { color: colors.textSecondary, fontSize: fonts.sizes.md },

  // ── Tournaments ──
  tourScroll: { maxHeight: 460 },
  tourContent: { padding: spacing.xl, gap: spacing.md },

  emptyBox: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: colors.textSecondary, fontSize: fonts.sizes.md, textAlign: 'center' },
  emptySubtext: { color: colors.textMuted, fontSize: fonts.sizes.sm },

  tourCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  tourCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tourCardLeft: { flex: 1 },
  tourCardName: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textPrimary },
  tourCardMeta: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: fonts.sizes.xs, fontWeight: '700' },

  tourCardStats: { flexDirection: 'row', gap: spacing.xl },
  stat: { gap: 2 },
  statLabel: { fontSize: fonts.sizes.xs, color: colors.textMuted },
  statValue: { fontSize: fonts.sizes.md, fontWeight: '700', color: colors.textPrimary },
  statGold: { color: colors.gold },

  fillBarWrap: { gap: 4 },
  fillBarBg: { height: 6, backgroundColor: colors.bgOverlay, borderRadius: 3, overflow: 'hidden' },
  fillBar: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  fillLabel: { fontSize: fonts.sizes.xs, color: colors.textMuted },

  joinedBadge: {
    backgroundColor: colors.success + '22',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  joinedText: { color: colors.success, fontWeight: '600', fontSize: fonts.sizes.sm },
  joinBtn: { width: '100%' },

  // ── Modal ──
  overlay: { flex: 1, backgroundColor: colors.overlay80, alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: 340,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  modalTitle: { fontSize: fonts.sizes.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  modalTourName: { fontSize: fonts.sizes.md, color: colors.textSecondary, textAlign: 'center' },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalLabel: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  modalValue: { color: colors.textPrimary, fontWeight: '700', fontSize: fonts.sizes.sm },
  modalPrize: { color: colors.gold },
  modalNote: { color: colors.textMuted, fontSize: fonts.sizes.xs, lineHeight: 17, textAlign: 'center' },
  modalError: { color: colors.error, fontSize: fonts.sizes.xs, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },
});
