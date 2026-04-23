import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ImageBackground, FlatList,
  ActivityIndicator, TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { IconChevronLeft, IconTrophy } from '../components/Icons';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';

type Props = { navigation: NativeStackNavigationProp<any> };

type Period = 'week' | 'month';

interface LeaderEntry {
  position: number;
  userId: string;
  name: string;
  avatar: string | null;
  points: number;
  rank: string;
  previousRank: string | null;
}

interface MyLeague {
  points: number;
  rank: string;
  previous_rank: string | null;
  previous_rank_month: string | null;
}

const RANK_META: Record<string, { label: string; color: string; bg: string }> = {
  DIAMOND:  { label: 'Diamante',  color: '#b9f2ff', bg: 'rgba(185,242,255,0.15)' },
  PLATINUM: { label: 'Platina',   color: '#e5e4e2', bg: 'rgba(229,228,226,0.14)' },
  GOLD:     { label: 'Ouro',      color: '#ffd700', bg: 'rgba(255,215,0,0.15)'   },
  SILVER:   { label: 'Prata',     color: '#a8a9ad', bg: 'rgba(168,169,173,0.14)' },
  BRONZE:   { label: 'Bronze',    color: '#cd7f32', bg: 'rgba(205,127,50,0.14)'  },
};

const MEDAL_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

function rankMeta(rank: string) {
  return RANK_META[rank] ?? RANK_META['BRONZE'];
}

function RankBadge({ rank, small }: { rank: string; small?: boolean }) {
  const m = rankMeta(rank);
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: m.bg }, small && badgeStyles.wrapSmall]}>
      <Text style={[badgeStyles.text, { color: m.color }, small && badgeStyles.textSmall]}>
        {m.label}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  wrapSmall: { paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: fonts.sizes.xs, fontWeight: '800' },
  textSmall: { fontSize: 10 },
});

function MyLeagueCard({ data }: { data: MyLeague }) {
  const m = rankMeta(data.rank);
  return (
    <LinearGradient
      colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.3)']}
      style={cardStyles.wrap}
    >
      <View style={{ flex: 1 }}>
        <Text style={cardStyles.label}>Minha Liga</Text>
        <RankBadge rank={data.rank} />
        {data.previous_rank && (
          <Text style={cardStyles.prev}>
            Mês anterior: <Text style={{ color: rankMeta(data.previous_rank).color }}>{rankMeta(data.previous_rank).label}</Text>
          </Text>
        )}
      </View>
      <View style={cardStyles.right}>
        <Text style={[cardStyles.pts, { color: m.color }]}>{data.points}</Text>
        <Text style={cardStyles.ptsLabel}>pontos</Text>
      </View>
    </LinearGradient>
  );
}

const cardStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs, fontWeight: '700', marginBottom: 4 },
  prev: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 6 },
  right: { alignItems: 'flex-end' },
  pts: { fontSize: fonts.sizes.xxxl, fontWeight: '900' },
  ptsLabel: { color: 'rgba(255,255,255,0.55)', fontSize: fonts.sizes.xs, fontWeight: '700' },
});

function PodiumItem({ entry, pos }: { entry: LeaderEntry; pos: number }) {
  const medalColor = MEDAL_COLORS[pos - 1];
  const heights = [80, 60, 50];
  const h = heights[pos - 1] ?? 50;
  return (
    <View style={[podiumStyles.wrap, pos === 1 && podiumStyles.wrapFirst]}>
      <Text style={[podiumStyles.name, pos === 1 && podiumStyles.nameFirst]} numberOfLines={1}>{entry.name}</Text>
      <RankBadge rank={entry.rank} small />
      <Text style={[podiumStyles.pts, { color: medalColor }]}>{entry.points}pts</Text>
      <View style={[podiumStyles.base, { height: h, borderColor: medalColor }]}>
        <Text style={[podiumStyles.pos, { color: medalColor }]}>{pos}</Text>
      </View>
    </View>
  );
}

const podiumStyles = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1, paddingHorizontal: 4 },
  wrapFirst: { marginTop: -12 },
  name: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 3 },
  nameFirst: { fontSize: fonts.sizes.sm },
  pts: { fontSize: 11, fontWeight: '900', marginBottom: 4 },
  base: {
    width: '80%',
    borderWidth: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pos: { fontSize: fonts.sizes.xxl, fontWeight: '900' },
});

function LeaderRow({ entry, isMe }: { entry: LeaderEntry; isMe: boolean }) {
  const m = rankMeta(entry.rank);
  return (
    <View style={[rowStyles.wrap, isMe && rowStyles.wrapMe]}>
      <Text style={rowStyles.pos}>#{entry.position}</Text>
      <View style={[rowStyles.avatar, { backgroundColor: m.bg }]}>
        <Text style={[rowStyles.avatarText, { color: m.color }]}>{entry.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.name, isMe && rowStyles.nameMe]} numberOfLines={1}>{entry.name}{isMe ? ' (você)' : ''}</Text>
        <RankBadge rank={entry.rank} small />
      </View>
      <Text style={[rowStyles.pts, { color: m.color }]}>{entry.points}pts</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  wrapMe: { backgroundColor: 'rgba(34,197,94,0.12)' },
  pos: { color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.sm, fontWeight: '700', width: 32 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontWeight: '900', fontSize: fonts.sizes.md },
  name: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  nameMe: { color: '#22c55e' },
  pts: { fontWeight: '900', fontSize: fonts.sizes.sm },
});

export function LeaderboardScreen({ navigation }: Props) {
  const myUserId = useAuthStore((s) => s.user?.id);
  const [period, setPeriod] = useState<Period>('month');
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [myLeague, setMyLeague] = useState<MyLeague | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [lbRes, meRes] = await Promise.allSettled([
        api.get(`/game/leaderboard?period=${period}`),
        api.get('/game/me/league'),
      ]);
      if (lbRes.status === 'fulfilled') {
        setEntries(lbRes.value.data.leaderboard ?? []);
      }
      if (meRes.status === 'fulfilled') {
        setMyLeague(meRes.value.data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix]}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <IconChevronLeft size={20} color="#fff" accessibilityLabel="Voltar" />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <IconTrophy size={18} color="#ffd700" accessibilityLabel="Liga" />
            <Text style={styles.headerTitleText}>Liga & Ranking</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Period toggle */}
        <View style={styles.toggleRow}>
          {(['week', 'month'] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.toggleBtn, period === p && styles.toggleBtnActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, period === p && styles.toggleTextActive]}>
                {p === 'week' ? 'Esta Semana' : 'Este Mês'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color="#22c55e" style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={rest}
            keyExtractor={(e) => e.userId}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor="#22c55e" />}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {myLeague && <MyLeagueCard data={myLeague} />}

                {top3.length > 0 && (
                  <View style={styles.podiumWrap}>
                    <View style={styles.podiumRow}>
                      {top3.length >= 3
                        ? podiumOrder.map((e, idx) => {
                            const realPos = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                            return <PodiumItem key={e.userId} entry={e} pos={realPos} />;
                          })
                        : top3.map((e) => <PodiumItem key={e.userId} entry={e} pos={e.position} />)
                      }
                    </View>
                  </View>
                )}

                {rest.length > 0 && (
                  <Text style={styles.restLabel}>Classificação Geral</Text>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <LeaderRow entry={item} isMe={item.userId === myUserId} />
            )}
            ListEmptyComponent={
              top3.length === 0 ? (
                <View style={styles.empty}>
                  <IconTrophy size={36} color="#ffd700" accessibilityLabel="Troféu" />
                  <Text style={styles.emptyText}>Nenhuma pontuação ainda.</Text>
                  <Text style={styles.emptyHint}>Jogue partidas pagas para ganhar pontos de liga!</Text>
                </View>
              ) : null
            }
            contentContainerStyle={styles.listContent}
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, marginBottom: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(187,255,0,0.22)',
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerTitleText: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.lg },

  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.full,
    padding: 3,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: radius.full,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#22c55e' },
  toggleText: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: fonts.sizes.sm },
  toggleTextActive: { color: '#000', fontWeight: '900' },

  listContent: { paddingBottom: 40 },
  listHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  podiumWrap: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.35)' } as any) : {}),
  },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.sm },

  restLabel: {
    color: 'rgba(255,255,255,0.55)', fontSize: fonts.sizes.xs,
    fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm,
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  emptyText: { color: '#fff', fontSize: fonts.sizes.lg, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: 'rgba(255,255,255,0.55)', fontSize: fonts.sizes.sm, textAlign: 'center' },
});
