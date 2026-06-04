import React, { useEffect, useState, useCallback } from 'react';
import { SettingsModal } from '../components/SettingsModal';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconTrophy } from '../components/Icons';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { GameTopBar } from './HomeScreen';

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

const RANK_META: Record<string, { label: string; color: string; bg: string; gradient: readonly [string, string] }> = {
  DIAMOND:  { label: 'Diamante', color: '#b9f2ff', bg: 'rgba(185,242,255,0.12)', gradient: ['#1e3a5f', '#0a1f3a'] },
  PLATINUM: { label: 'Platina',  color: '#e5e4e2', bg: 'rgba(229,228,226,0.12)', gradient: ['#3a3a3a', '#1a1a1a'] },
  GOLD:     { label: 'Ouro',     color: '#ffd700', bg: 'rgba(255,215,0,0.12)',    gradient: ['#3d2f00', '#1a1200'] },
  SILVER:   { label: 'Prata',    color: '#a8a9ad', bg: 'rgba(168,169,173,0.12)', gradient: ['#2a2a30', '#111118'] },
  BRONZE:   { label: 'Bronze',   color: '#cd7f32', bg: 'rgba(205,127,50,0.12)',  gradient: ['#2d1a06', '#110800'] },
};

const MEDAL: Record<number, { color: string; label: string }> = {
  1: { color: '#ffd700', label: '1º' },
  2: { color: '#c0c0c0', label: '2º' },
  3: { color: '#cd7f32', label: '3º' },
};

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
  wrap:      { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  wrapSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  text:      { fontSize: fonts.sizes.xs, fontWeight: '800' },
  textSmall: { fontSize: fonts.sizes.sm, fontWeight: '800' },
});

function MyLeagueCard({ data }: { data: MyLeague }) {
  const m = rankMeta(data.rank);
  return (
    <LinearGradient colors={m.gradient as any} style={myCardStyles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={myCardStyles.label}>Minha Liga</Text>
        <Text style={[myCardStyles.rankName, { color: m.color }]}>{m.label}</Text>
        {data.previous_rank && (
          <Text style={myCardStyles.prev}>
            Mês anterior:{' '}
            <Text style={{ color: rankMeta(data.previous_rank).color }}>
              {rankMeta(data.previous_rank).label}
            </Text>
          </Text>
        )}
      </View>
      <View style={myCardStyles.right}>
        <Text style={[myCardStyles.pts, { color: m.color }]}>{data.points}</Text>
        <Text style={myCardStyles.ptsLabel}>pontos</Text>
      </View>
    </LinearGradient>
  );
}

const myCardStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 6px 14px rgba(0,0,0,0.4)' } as any) : {}),
  },
  label:    { color: 'rgba(255,255,255,0.55)', fontSize: fonts.sizes.xs, fontWeight: '700', marginBottom: 4 },
  rankName: { fontSize: fonts.sizes.xxl, fontWeight: '900' },
  prev:     { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4 },
  right:    { alignItems: 'flex-end' },
  pts:      { fontSize: fonts.sizes.xxxl, fontWeight: '900' },
  ptsLabel: { color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs, fontWeight: '700' },
});

function PodiumItem({ entry, pos }: { entry: LeaderEntry; pos: number }) {
  const medal = MEDAL[pos];
  const m = rankMeta(entry.rank);
  const heights = [88, 64, 52];
  const h = heights[pos - 1] ?? 52;
  return (
    <View style={[podiumStyles.wrap, pos === 1 && podiumStyles.wrapFirst]}>
      <View style={[podiumStyles.avatar, { backgroundColor: m.bg, borderColor: medal.color }]}>
        <Text style={[podiumStyles.avatarText, { color: medal.color }]}>
          {entry.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <Text style={[podiumStyles.name, pos === 1 && podiumStyles.nameFirst]} numberOfLines={1}>
        {entry.name}
      </Text>
      <Text style={[podiumStyles.pts, { color: medal.color }]}>{entry.points} pts</Text>
      <View style={[podiumStyles.base, { height: h, borderColor: medal.color }]}>
        <Text style={[podiumStyles.pos, { color: medal.color }]}>{medal.label}</Text>
      </View>
    </View>
  );
}

const podiumStyles = StyleSheet.create({
  wrap:      { alignItems: 'center', flex: 1, paddingHorizontal: 4 },
  wrapFirst: { marginTop: -16 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginBottom: 4,
  },
  avatarText: { fontWeight: '900', fontSize: fonts.sizes.md },
  name:      { color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center', marginBottom: 2 },
  nameFirst: { fontSize: fonts.sizes.sm },
  pts:       { fontSize: 10, fontWeight: '900', marginBottom: 4 },
  base: {
    width: '80%', borderWidth: 2, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pos: { fontSize: fonts.sizes.xl, fontWeight: '900' },
});

function LeaderRow({ entry, isMe }: { entry: LeaderEntry; isMe: boolean }) {
  const m = rankMeta(entry.rank);
  return (
    <View style={[rowStyles.wrap, isMe && rowStyles.wrapMe]}>
      <Text style={[rowStyles.pos, isMe && { color: '#1CBB3D' }]}>#{entry.position}</Text>
      <View style={[rowStyles.avatar, { backgroundColor: m.bg, borderColor: isMe ? '#1CBB3D' : m.color, borderWidth: isMe ? 2 : 1 }]}>
        <Text style={[rowStyles.avatarText, { color: isMe ? '#1CBB3D' : m.color }]}>
          {entry.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.name, isMe && rowStyles.nameMe]} numberOfLines={1}>
          {entry.name}{isMe ? ' (você)' : ''}
        </Text>
        <RankBadge rank={entry.rank} small />
      </View>
      <Text style={[rowStyles.pts, { color: isMe ? '#1CBB3D' : m.color }]}>{entry.points} pts</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  wrapMe: {
    backgroundColor: 'rgba(10,40,15,0.95)',
    borderColor: 'rgba(28,187,61,0.4)',
  },
  pos:        { color: 'rgba(255,255,255,0.75)', fontSize: fonts.sizes.md, fontWeight: '800', width: 36 },
  avatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900', fontSize: fonts.sizes.md },
  name:       { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm, marginBottom: 2 },
  nameMe:     { color: '#1CBB3D' },
  pts:        { fontWeight: '900', fontSize: fonts.sizes.sm },
});

export function LeaderboardScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const myUserId = user?.id;
  const [period, setPeriod] = useState<Period>('month');
  const [settingsVisible, setSettingsVisible] = useState(false);
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
      if (lbRes.status === 'fulfilled') setEntries(lbRes.value.data.leaderboard ?? []);
      if (meRes.status === 'fulfilled') setMyLeague(meRes.value.data);
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

        <View style={styles.toggleRow}>
          {(['week', 'month'] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={styles.toggleBtn}
              onPress={() => setPeriod(p)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={period === p ? ['#BEF311', '#1CBB3D'] : ['transparent', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.toggleGrad}
              >
                <Text style={[styles.toggleText, period === p && styles.toggleTextActive]}>
                  {p === 'week' ? 'Esta Semana' : 'Este Mês'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color="#1CBB3D" style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={rest}
            keyExtractor={(e) => e.userId}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor="#1CBB3D" />}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {myLeague && <MyLeagueCard data={myLeague} />}

                {top3.length > 0 && (
                  <View style={styles.podiumWrap}>
                    <Text style={styles.podiumTitle}>Pódio</Text>
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
                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>CLASSIFICAÇÃO GERAL</Text>
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>{entries.length} jogadores</Text>
                    </View>
                  </View>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <LeaderRow entry={item} isMe={item.userId === myUserId} />
            )}
            ListEmptyComponent={
              top3.length === 0 ? (
                <View style={styles.empty}>
                  <IconTrophy size={36} color="#ffd700" />
                  <Text style={styles.emptyText}>Nenhuma pontuação ainda.</Text>
                  <Text style={styles.emptyHint}>Jogue partidas pagas para ganhar pontos de liga!</Text>
                </View>
              ) : null
            }
            contentContainerStyle={styles.listContent}
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

  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.full,
    padding: 3,
    height: 36,
  },
  toggleBtn:        { flex: 1, borderRadius: radius.full, overflow: 'hidden' },
  toggleBtnActive:  {},
  toggleGrad:       { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  toggleText:       { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: fonts.sizes.sm },
  toggleTextActive: { color: '#000', fontWeight: '900' },

  listContent: { paddingBottom: 40 },
  listHeader:  { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  podiumWrap: {
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: radius.xl, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.lg, marginBottom: spacing.lg,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.35)' } as any) : {}),
  },
  podiumTitle: {
    color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs,
    fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.md,
  },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.sm },

  sectionRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionLabel:      { color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs, fontWeight: '800', letterSpacing: 1.2 },
  sectionBadge:      { backgroundColor: 'rgba(28,187,61,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(28,187,61,0.25)' },
  sectionBadgeText:  { color: '#1CBB3D', fontSize: 10, fontWeight: '800' },

  empty:    { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  emptyText:{ color: '#fff', fontSize: fonts.sizes.lg, fontWeight: '700', textAlign: 'center' },
  emptyHint:{ color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.sm, textAlign: 'center' },
});
