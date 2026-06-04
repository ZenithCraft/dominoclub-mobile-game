import React, { useEffect, useState } from 'react';
import { SettingsModal } from '../components/SettingsModal';
import {
  View, Text, StyleSheet, ActivityIndicator,
  FlatList, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { GameTopBar } from './HomeScreen';

type Props = { navigation: NativeStackNavigationProp<any> };

type Game = {
  id: string;
  winner_id?: string;
  winnerId?: string;
  tournamentId?: string | null;
  bet_amount?: number;
};

type Achievement = {
  id: string;
  title: string;
  desc: string;
  unlocked: boolean;
  progress?: number;
  target?: number;
};

interface MyLeague {
  points: number;
  rank: string;
  previous_rank: string | null;
  previous_rank_month: string | null;
}

const RANK_META: Record<string, { label: string; color: string; gradient: readonly [string, string] }> = {
  DIAMOND:  { label: 'Diamante', color: '#b9f2ff', gradient: ['#1e3a5f', '#0a1f3a'] },
  PLATINUM: { label: 'Platina',  color: '#e5e4e2', gradient: ['#3a3a3a', '#1a1a1a'] },
  GOLD:     { label: 'Ouro',     color: '#ffd700', gradient: ['#3d2f00', '#1a1200'] },
  SILVER:   { label: 'Prata',    color: '#a8a9ad', gradient: ['#2a2a30', '#111118'] },
  BRONZE:   { label: 'Bronze',   color: '#cd7f32', gradient: ['#2d1a06', '#110800'] },
};

function rankMeta(rank: string) {
  return RANK_META[rank] ?? RANK_META['BRONZE'];
}

function computeWinStreak(games: Game[], myId: string): number {
  if (!myId) return 0;
  let streak = 0;
  let best = 0;
  for (const g of games) {
    const winner = g.winner_id ?? g.winnerId;
    if (winner === myId) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }
  return best;
}

function buildAchievements(
  wins: number,
  total: number,
  streak: number,
  tournamentsWon: number,
  league: MyLeague | null,
): Achievement[] {
  const rankOrder = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
  const currentRankIdx = rankOrder.indexOf(league?.rank ?? 'BRONZE');
  const hasReachedRank = (rank: string) =>
    !!league && (currentRankIdx >= rankOrder.indexOf(rank) ||
    (league.previous_rank ? rankOrder.indexOf(league.previous_rank) >= rankOrder.indexOf(rank) : false));

  return [
    { id: 'first_win',        title: 'Primeira Vitória',    desc: 'Vença uma partida',       unlocked: wins >= 1,   progress: Math.min(wins, 1),   target: 1   },
    { id: 'ten_wins',         title: 'Dez Vitórias',        desc: 'Vença 10 partidas',        unlocked: wins >= 10,  progress: Math.min(wins, 10),  target: 10  },
    { id: 'fifty_wins',       title: 'Cinquenta Vitórias',  desc: 'Vença 50 partidas',        unlocked: wins >= 50,  progress: Math.min(wins, 50),  target: 50  },
    { id: 'ten_games',        title: 'Primeiros Passos',    desc: 'Jogue 10 partidas',        unlocked: total >= 10, progress: Math.min(total, 10), target: 10  },
    { id: 'fifty_games',      title: 'Maratona',            desc: 'Jogue 50 partidas',        unlocked: total >= 50, progress: Math.min(total, 50), target: 50  },
    { id: 'streak_3',         title: 'Sequência de 3',      desc: 'Vença 3 seguidas',         unlocked: streak >= 3, progress: Math.min(streak, 3), target: 3   },
    { id: 'streak_5',         title: 'Em Chamas',           desc: 'Vença 5 seguidas',         unlocked: streak >= 5, progress: Math.min(streak, 5), target: 5   },
    { id: 'tournament_champ', title: 'Campeão de Torneio',  desc: 'Vença um torneio',         unlocked: tournamentsWon >= 1, progress: Math.min(tournamentsWon, 1), target: 1 },
    { id: 'silver_rank',      title: 'Liga Prata',          desc: 'Alcance a liga Prata',     unlocked: hasReachedRank('SILVER')   },
    { id: 'gold_rank',        title: 'Liga Ouro',           desc: 'Alcance a liga Ouro',      unlocked: hasReachedRank('GOLD')     },
    { id: 'platinum_rank',    title: 'Liga Platina',        desc: 'Alcance a liga Platina',   unlocked: hasReachedRank('PLATINUM') },
    { id: 'diamond_rank',     title: 'Liga Diamante',       desc: 'Alcance a liga Diamante',  unlocked: hasReachedRank('DIAMOND')  },
  ];
}

export function AchievementsScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [achs, setAchs] = useState<Achievement[]>([]);
  const [myLeague, setMyLeague] = useState<MyLeague | null>(null);
  const [stats, setStats] = useState({ wins: 0, total: 0, streak: 0, tournamentsWon: 0 });

  const load = async () => {
    try {
      const [leagueRes, historyPages] = await Promise.allSettled([
        api.get('/game/me/league'),
        (async () => {
          const games: Game[] = [];
          for (let page = 1; page <= 5; page++) {
            const { data } = await api.get(`/game/history?page=${page}`);
            const list: Game[] = data?.games ?? [];
            games.push(...list);
            if (list.length < 10) break;
          }
          return games;
        })(),
      ]);

      const league: MyLeague | null = leagueRes.status === 'fulfilled' ? leagueRes.value.data : null;
      setMyLeague(league);

      const games: Game[] = historyPages.status === 'fulfilled' ? historyPages.value : [];

      const wins = games.filter((g) => (g.winner_id ?? g.winnerId) === myId).length;
      const tournamentsWon = new Set(
        games
          .filter((g) => !!g.tournamentId && (g.winner_id ?? g.winnerId) === myId)
          .map((g) => g.tournamentId),
      ).size;
      const total = games.length;
      const streak = computeWinStreak(games, myId);

      setStats({ wins, total, streak, tournamentsWon });
      setAchs(buildAchievements(wins, total, streak, tournamentsWon, league));
    } catch {
      setAchs(buildAchievements(0, 0, 0, 0, null));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const currentRankMeta = rankMeta(myLeague?.rank ?? 'BRONZE');
  const prevRankMeta = myLeague?.previous_rank ? rankMeta(myLeague.previous_rank) : null;
  const unlockedCount = achs.filter((a) => a.unlocked).length;

  const renderItem = ({ item }: { item: Achievement }) => {
    const accentColor = item.unlocked ? '#facc15' : 'rgba(255,255,255,0.18)';
    const progressPct = item.target && item.progress !== undefined
      ? Math.min(item.progress / item.target, 1)
      : null;

    return (
      <View style={[styles.achCard, item.unlocked ? styles.achCardUnlocked : styles.achCardLocked]}>
        <View style={[styles.iconBadge, item.unlocked ? styles.iconBadgeUnlocked : styles.iconBadgeLocked]}>
          <Text style={[styles.iconEmoji, { opacity: item.unlocked ? 1 : 0.4 }]}>
            {item.unlocked ? '★' : '○'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.achTitle, !item.unlocked && styles.achTitleLocked]}>{item.title}</Text>
          <Text style={styles.achDesc}>{item.desc}</Text>
          {progressPct !== null && !item.unlocked && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
            </View>
          )}
          {progressPct !== null && !item.unlocked && (
            <Text style={styles.progressText}>{item.progress}/{item.target}</Text>
          )}
        </View>
        {item.unlocked && (
          <View style={styles.checkBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        )}
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
            data={achs}
            keyExtractor={(a) => a.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1CBB3D" />}
            ListHeaderComponent={
              <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
                {/* League rank card */}
                <LinearGradient colors={currentRankMeta.gradient as any} style={styles.rankCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankCardLabel}>Liga Atual</Text>
                    <Text style={[styles.rankName, { color: currentRankMeta.color }]}>
                      {currentRankMeta.label}
                    </Text>
                    {prevRankMeta && myLeague?.previous_rank_month && (
                      <Text style={styles.prevRankText}>
                        {myLeague.previous_rank_month}:{' '}
                        <Text style={{ color: prevRankMeta.color }}>{prevRankMeta.label}</Text>
                      </Text>
                    )}
                  </View>
                  <View style={styles.rankPts}>
                    <Text style={[styles.rankPtsNum, { color: currentRankMeta.color }]}>{myLeague?.points ?? 0}</Text>
                    <Text style={styles.rankPtsLabel}>pontos</Text>
                  </View>
                </LinearGradient>

                {/* Stats row */}
                <View style={styles.statsRow}>
                  {[
                    { label: 'Vitórias',   value: String(stats.wins),           color: '#1CBB3D' },
                    { label: 'Sequência',  value: String(stats.streak),          color: '#facc15' },
                    { label: 'Torneios',   value: String(stats.tournamentsWon),  color: '#b9f2ff' },
                    { label: 'Partidas',   value: String(stats.total),           color: '#fff'    },
                  ].map((s) => (
                    <View key={s.label} style={styles.statBox}>
                      <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Section header */}
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>CONQUISTAS</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{unlockedCount}/{achs.length}</Text>
                  </View>
                </View>
              </View>
            }
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

  rankCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', padding: spacing.lg,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 6px 14px rgba(0,0,0,0.4)' } as any) : {}),
  },
rankCardLabel: { color: 'rgba(255,255,255,0.55)', fontSize: fonts.sizes.xs, fontWeight: '700', marginBottom: 4 },
  rankName: { fontSize: fonts.sizes.xxl, fontWeight: '900' },
  prevRankText: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4 },
  rankPts: { alignItems: 'flex-end' },
  rankPtsNum: { fontSize: fonts.sizes.xxxl, fontWeight: '900' },
  rankPtsLabel: { color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', paddingVertical: spacing.md,
  },
  statValue: { fontSize: fonts.sizes.xl, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', marginTop: 2 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionLabel: {
    color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs,
    fontWeight: '800', letterSpacing: 1.2,
  },
  sectionBadge: {
    backgroundColor: 'rgba(250,204,21,0.15)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.3)',
  },
  sectionBadgeText: { color: '#facc15', fontSize: 10, fontWeight: '800' },

  achCard: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: radius.lg,
    padding: spacing.md, gap: spacing.md, marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  achCardUnlocked: {
    backgroundColor: 'rgba(30, 25, 5, 0.95)',
    borderColor: 'rgba(250,204,21,0.35)',
  },
  achCardLocked: {
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
iconBadge: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  iconBadgeUnlocked: {
    backgroundColor: 'rgba(255,212,0,0.15)',
    borderColor: 'rgba(250,204,21,0.35)',
  },
  iconBadgeLocked: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconEmoji: { fontSize: 18, color: '#facc15' },

  achTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.sm },
  achTitleLocked: { color: 'rgba(255,255,255,0.45)' },
  achDesc: { color: 'rgba(255,255,255,0.4)', fontSize: fonts.sizes.xs, marginTop: 1 },

  progressBar: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2, marginTop: 6, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: '#1CBB3D', borderRadius: 2,
  },
  progressText: {
    color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: '700', marginTop: 3,
  },

  checkBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(250,204,21,0.15)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkText: { color: '#facc15', fontWeight: '900', fontSize: 14 },
});
