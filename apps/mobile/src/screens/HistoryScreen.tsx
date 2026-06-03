import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { api } from '../services/api';
import { IconTrophy } from '../components/Icons';
import { useAuthStore } from '../store/auth.store';
import { GameTopBarMinimal } from './HomeScreen';

type Props = { navigation: NativeStackNavigationProp<any> };

type GameItem = {
  id: string;
  mode?: string;
  variant?: string;
  bet_amount?: number;
  prize_pool?: number;
  finished_at?: string | Date;
  winner_id?: string;
  winnerId?: string;
  players?: { user?: { id: string; name: string } }[];
  tournamentId?: string | null;
};

export function HistoryScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const myUserId = user?.id ?? '';
  const [loading, setLoading] = useState(true);
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
        finished_at: new Date(now - i * 3600_000).toISOString(),
        winnerId: 'you',
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
    const dateStr = item.finished_at ? new Date(item.finished_at).toLocaleString('pt-BR') : '';
    const isTournament = !!item.tournamentId;
    const modeLabel = item.mode || (isTournament ? 'Torneio' : 'Partida');
    return (
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>{modeLabel}{item.variant ? ` • ${item.variant}` : ''}</Text>
          {isTournament ? <IconTrophy size={16} color="#FFD400" /> : null}
        </View>
        <Text style={styles.sub}>{dateStr}</Text>
        <View style={styles.row}>
          <Text style={styles.badge}>Aposta: R$ {Number(item.bet_amount ?? 0).toFixed(2)}</Text>
          <Text style={[styles.badge, { marginLeft: spacing.sm }]}>Prêmio: R$ {Number(item.prize_pool ?? 0).toFixed(2)}</Text>
        </View>
        <Text style={[styles.result, { color: winner ? '#4ade80' : colors.textMuted }]}>
          {winner ? 'Vitória registrada' : 'Sem vencedor'}
        </Text>
      </View>
    );
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <GameTopBarMinimal
          user={user}
          exitVariant="back"
          onExit={() => navigation.goBack()}
          onSettings={() => navigation.navigate('Main', { openModal: 'settings' })}
          onProfile={() => navigation.navigate('Main', { openModal: 'profile' })}
        />

        {loading ? (
          <ActivityIndicator color="#4ade80" style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(g) => g.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ade80" />}
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
    backgroundColor: 'rgba(24, 73, 18, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.28)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  sub: { color: colors.textMuted, fontSize: fonts.sizes.xs, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  badge: {
    color: '#0a1f0a',
    fontWeight: '800',
    backgroundColor: '#BEF311',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
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
  summaryName: { color: '#fff', fontWeight: '700' },
  summarySub: { color: colors.textMuted, marginTop: 2, fontSize: fonts.sizes.xs },
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
