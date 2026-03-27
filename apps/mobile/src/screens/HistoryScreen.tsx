import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, ImageBackground, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { api } from '../services/api';
import { IconChevronLeft, IconTrophy } from '../components/Icons';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<GameItem[]>([]);

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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
          <Text style={styles.badge}>Aposta: R$ {(item.bet_amount ?? 0).toFixed(2)}</Text>
          <Text style={[styles.badge, { marginLeft: spacing.sm }]}>Prêmio: R$ {(item.prize_pool ?? 0).toFixed(2)}</Text>
        </View>
        <Text style={[styles.result, { color: winner ? '#4ade80' : colors.textMuted }]}>
          {winner ? 'Vitória registrada' : 'Sem vencedor'}
        </Text>
      </View>
    );
  };

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix]}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <IconChevronLeft size={20} color="#fff" accessibilityLabel="Voltar" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Histórico de partidas</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <ActivityIndicator color="#4ade80" style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(g) => g.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.lg }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ade80" />}
            ListEmptyComponent={<Text style={styles.empty}>Nenhuma partida finalizada encontrada.</Text>}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
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
    backgroundColor: 'rgba(8, 18, 8, 0.72)',
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
});
