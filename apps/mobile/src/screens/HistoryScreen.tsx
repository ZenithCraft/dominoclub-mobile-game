import React, { useEffect, useState, useCallback } from 'react';
import { SettingsModal } from '../components/SettingsModal';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { GameTopBar } from './HomeScreen';

type Props = { navigation: NativeStackNavigationProp<any> };

type GameItem = {
  id: string;
  mode?: string;
  variant?: string;
  bet_amount?: number;
  prize_pool?: number;
  started_at?: string | Date;
  finished_at?: string | Date;
  winner_id?: string;
  winnerId?: string;
  players?: { user?: { id: string; name: string } }[];
  tournamentId?: string | null;
};

const MODE_LABELS: Record<string, string> = {
  ARENA_1V1:        'Arena 1v1',
  ARENA_2V2:        'Arena 2v2',
  RECREATIONAL_1V1: 'Recreacional 1v1',
  RECREATIONAL_2V2: 'Recreacional 2v2',
  CUP_1V1:          'Copa 1v1',
  CUP_2V2:          'Copa 2v2',
  TOURNAMENT:       'Torneio',
};

function formatMode(raw: string): string {
  if (MODE_LABELS[raw]) return MODE_LABELS[raw];
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(started: string | Date | undefined, finished: string | Date | undefined): string | null {
  if (!started || !finished) return null;
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return sec > 0 ? `${min}min ${sec}s` : `${min}min`;
}

export function HistoryScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const myUserId = user?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<GameItem[]>([]);
  const [pairStats, setPairStats] = useState<Array<{ userId: string; name: string; games: number; wins: number; winRate: number; alert: boolean }>>([]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const all: GameItem[] = [];
      for (let page = 1; page <= 5; page++) {
        const { data } = await api.get(`/game/history?page=${page}`);
        const list: GameItem[] = data?.games ?? [];
        all.push(...list);
        if (list.length < 10) break;
      }
      setItems(all);
      if (myUserId) {
        const byOpp = new Map<string, { userId: string; name: string; games: number; wins: number }>();
        for (const g of all) {
          const mode = g.mode ?? '';
          const bet = g.bet_amount ?? 0;
          if (!(mode === 'ARENA_1V1' || mode === 'CUP_1V1')) continue;
          if (bet <= 0) continue;
          const winner = g.winner_id ?? g.winnerId;
          if (!winner) continue;
          const players = g.players ?? [];
          const ids = players.map((p) => p.user?.id).filter(Boolean) as string[];
          if (!ids.includes(myUserId)) continue;
          const opp = players.find((p) => p.user?.id && p.user.id !== myUserId)?.user;
          if (!opp?.id) continue;
          const entry = byOpp.get(opp.id) ?? { userId: opp.id, name: opp.name || '—', games: 0, wins: 0 };
          entry.games += 1;
          if (winner === myUserId) entry.wins += 1;
          if (!entry.name || entry.name === '—') entry.name = opp.name || '—';
          byOpp.set(opp.id, entry);
        }
        const list = [...byOpp.values()]
          .map((s) => {
            const winRate = s.games > 0 ? s.wins / s.games : 0;
            const skew = Math.max(winRate, 1 - winRate);
            const alert = s.games >= 10 && skew >= 0.9;
            return { ...s, winRate, alert };
          })
          .sort((a, b) => (b.games - a.games) || (b.winRate - a.winRate))
          .slice(0, 10);
        setPairStats(list);
      } else {
        setPairStats([]);
      }
    } catch {
      const now = Date.now();
      const fallback: GameItem[] = Array.from({ length: 8 }).map((_, i) => ({
        id: `mock-${i + 1}`,
        mode: i % 2 === 0 ? 'ARENA_1V1' : 'RECREATIONAL_2V2',
        variant: i % 3 === 0 ? 'CLÁSSICO' : 'CRUZADA',
        bet_amount: [2, 5, 10, 20][i % 4],
        prize_pool: [4, 10, 20, 40][i % 4],
        started_at: new Date(now - i * 3600_000 - [8,12,15,20,10,18,9,14][i % 8] * 60_000).toISOString(),
        finished_at: new Date(now - i * 3600_000).toISOString(),
        winnerId: i % 3 === 0 ? '' : 'you',
        tournamentId: i % 4 === 0 ? `T-${100 + i}` : null,
      }));
      setItems(fallback);
      setPairStats([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myUserId]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const renderItem = ({ item }: { item: GameItem }) => {
    const winner = item.winner_id ?? item.winnerId;
    const isWin = !!winner && (winner === myUserId || winner === 'you');
    const isLoss = !!winner && !isWin;
    const dateStr = item.finished_at
      ? new Date(item.finished_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const duration = formatDuration(item.started_at, item.finished_at);
    const isTournament = !!item.tournamentId;
    const rawMode = item.mode || (isTournament ? 'TOURNAMENT' : 'Partida');
    const modeLabel = formatMode(rawMode);
    const variantLabel = item.variant ? ` · ${item.variant.charAt(0).toUpperCase() + item.variant.slice(1).toLowerCase()}` : '';

    const cardStyle = isWin ? styles.cardWin : isLoss ? styles.cardLoss : styles.card;
    const accentColor = isWin ? '#1CBB3D' : isLoss ? '#f87171' : colors.textMuted;
    const resultLabel = isWin ? 'Vitória' : isLoss ? 'Derrota' : 'Sem resultado';

    return (
      <View style={cardStyle}>
        <View style={[styles.cardAccentBar, { backgroundColor: accentColor }]} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{modeLabel}{variantLabel}</Text>
            <Text style={styles.sub}>
              {dateStr}{duration ? `  •  ${duration}` : ''}
            </Text>
          </View>
          <View style={[styles.resultBadge, { backgroundColor: isWin ? 'rgba(28,187,61,0.15)' : isLoss ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)', borderColor: accentColor }]}>
            <Text style={[styles.resultBadgeText, { color: accentColor }]}>{resultLabel}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.statBox}>
            <Text style={[styles.statLabel, styles.statLabelBet]}>Aposta</Text>
            <Text style={styles.statValue}>R$ {Number(item.bet_amount ?? 0).toFixed(2)}</Text>
          </View>
          {(item.prize_pool ?? 0) > 0 && (
            <View style={[styles.statBox, isWin && styles.statBoxHighlight]}>
              <Text style={[styles.statLabel, styles.statLabelPrize]}>Prêmio</Text>
              <Text style={styles.statValue}>R$ {Number(item.prize_pool ?? 0).toFixed(2)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <GameTopBar
          user={user}
          exitVariant="back"
          onWallet={() => navigation.navigate('Wallet')}
          onExit={() => navigation.goBack()}
          onSettings={() => setSettingsVisible(true)}
          onProfile={() => navigation.navigate('Main', { openModal: 'profile' })}
        />

        {loading ? (
          <ActivityIndicator color="#1CBB3D" style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(g) => g.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1CBB3D" />}
            ListHeaderComponent={pairStats.length > 0 ? (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Confrontos (1v1 pago)</Text>
                {pairStats.map((s) => (
                  <View key={s.userId} style={styles.summaryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryName} numberOfLines={1}>{s.name}</Text>
                      <Text style={styles.summarySub}>
                        {s.wins}/{s.games} vitórias • {(s.winRate * 100).toFixed(0)}%
                      </Text>
                    </View>
                    {s.alert ? <Text style={styles.alert}>ALERTA</Text> : null}
                  </View>
                ))}
                <Text style={styles.summaryHint}>Taxa muito alta pode indicar conluio. O sistema evita parear estes jogadores novamente.</Text>
              </View>
            ) : null}
            ListEmptyComponent={<Text style={styles.empty}>Nenhuma partida finalizada encontrada.</Text>}
          />
        )}
        <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(187, 255, 0, 0.22)',
  },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.lg },
  card: {
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardWin: {
    backgroundColor: 'rgba(10, 40, 15, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(28, 187, 61, 0.45)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardLoss: {
    backgroundColor: 'rgba(40, 10, 10, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.45)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  title: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md, paddingLeft: 8 },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: fonts.sizes.xs, marginTop: 2, paddingLeft: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm, paddingLeft: 8 },
  resultBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultBadgeText: { fontWeight: '800', fontSize: fonts.sizes.xs },
  statBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 80,
  },
  statBoxHighlight: {
    backgroundColor: 'rgba(28, 187, 61, 0.1)',
  },
  statLabel: { fontSize: fonts.sizes.xs, fontWeight: '600' },
  statLabelBet: { color: 'rgb(250, 204, 21)' },
  statLabelPrize: { color: 'rgb(28, 187, 61)' },
  statValue: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.sm, marginTop: 2 },
  result: { marginTop: spacing.sm, fontWeight: '700' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  summaryCard: {
    backgroundColor: 'rgba(24, 73, 18, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 212, 0, 0.28)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryTitle: { color: '#fff', fontWeight: '800', fontSize: fonts.sizes.md, marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  summaryName: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  summarySub: { color: 'rgba(255,255,255,0.65)', marginTop: 3, fontSize: fonts.sizes.sm },
  alert: {
    marginLeft: spacing.md,
    color: '#0a1f0a',
    fontWeight: '900',
    backgroundColor: '#FFD400',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  summaryHint: { color: colors.textMuted, fontSize: fonts.sizes.xs, marginTop: spacing.sm },
});
