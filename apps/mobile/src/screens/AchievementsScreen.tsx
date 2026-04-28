import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  FlatList, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconTrophy, IconStar } from '../components/Icons';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { GameTopBarMinimal } from './HomeScreen';

type Props = { navigation: NativeStackNavigationProp<any> };

type Game = {
  id: string;
  winner_id?: string;
  winnerId?: string;
  tournamentId?: string | null;
  bet_amount?: number;
};

type Achievement = { id: string; title: string; desc: string; unlocked: boolean };

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

export function AchievementsScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [achs, setAchs] = useState<Achievement[]>([]);
  const [myLeague, setMyLeague] = useState<MyLeague | null>(null);
  const [stats, setStats] = useState({ wins: 0, total: 0, streak: 0, tournamentsWon: 0 });

  useEffect(() => {
    (async () => {
      setLoading(true);
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

        let league: MyLeague | null = null;
        if (leagueRes.status === 'fulfilled') league = leagueRes.value.data;
        setMyLeague(league);

        const games: Game[] = historyPages.status === 'fulfilled' ? historyPages.value : [];

        const myId = league ? undefined : undefined;
        const wins = games.filter((g) => !!(g.winner_id ?? g.winnerId)).length;
        const tournamentsWon = new Set(
          games.filter((g) => !!g.tournamentId && !!(g.winner_id ?? g.winnerId)).map((g) => g.tournamentId),
        ).size;
        const total = games.length;
        const streak = computeWinStreak(games, '');

        setStats({ wins, total, streak, tournamentsWon });

        setAchs([
          { id: 'first_win',       title: 'Primeira vitória',       desc: 'Vença uma partida',              unlocked: wins >= 1           },
          { id: 'ten_wins',        title: 'Dez vitórias',           desc: 'Vença 10 partidas',              unlocked: wins >= 10          },
          { id: 'fifty_games',     title: 'Maratona',               desc: 'Jogue 50 partidas',              unlocked: total >= 50         },
          { id: 'tournament_champ',title: 'Campeão de Torneio',     desc: 'Vença um torneio',               unlocked: tournamentsWon >= 1 },
          { id: 'silver_rank',     title: 'Liga Prata',             desc: 'Alcance a liga Prata',           unlocked: !!league && (league.points >= 200 || league.previous_rank === 'SILVER' || league.previous_rank === 'GOLD' || league.previous_rank === 'PLATINUM' || league.previous_rank === 'DIAMOND') },
          { id: 'gold_rank',       title: 'Liga Ouro',              desc: 'Alcance a liga Ouro',            unlocked: !!league && (league.points >= 700 || league.previous_rank === 'GOLD' || league.previous_rank === 'PLATINUM' || league.previous_rank === 'DIAMOND') },
        ]);
      } catch {
        setAchs([
          { id: 'first_win',       title: 'Primeira vitória',       desc: 'Vença uma partida',  unlocked: false },
          { id: 'ten_wins',        title: 'Dez vitórias',           desc: 'Vença 10 partidas',  unlocked: false },
          { id: 'fifty_games',     title: 'Maratona',               desc: 'Jogue 50 partidas',  unlocked: false },
          { id: 'tournament_champ',title: 'Campeão de Torneio',     desc: 'Vença um torneio',   unlocked: false },
          { id: 'silver_rank',     title: 'Liga Prata',             desc: 'Alcance a liga Prata', unlocked: false },
          { id: 'gold_rank',       title: 'Liga Ouro',              desc: 'Alcance a liga Ouro',  unlocked: false },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentRankMeta = rankMeta(myLeague?.rank ?? 'BRONZE');
  const prevRankMeta = myLeague?.previous_rank ? rankMeta(myLeague.previous_rank) : null;

  const renderItem = ({ item }: { item: Achievement }) => (
    <View style={[
      styles.achCard,
      { opacity: item.unlocked ? 1 : 0.55, borderColor: item.unlocked ? 'rgba(250,204,21,0.48)' : 'rgba(255,255,255,0.10)' },
    ]}>
      <View style={styles.iconBadge}>
        {item.unlocked
          ? <IconTrophy size={18} color="#facc15" />
          : <IconStar size={18} color="#a3a3a3" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.achTitle}>{item.title}</Text>
        <Text style={styles.achDesc}>{item.desc}</Text>
      </View>
      <Text style={[styles.status, { color: item.unlocked ? '#4ade80' : colors.textMuted }]}>
        {item.unlocked ? '✓' : '—'}
      </Text>
    </View>
  );

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <GameTopBarMinimal
          user={user}
          exitVariant="back"
          onExit={() => navigation.goBack()}
        />

        {loading ? (
          <ActivityIndicator color="#4ade80" style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={achs}
            keyExtractor={(a) => a.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl }}
            ListHeaderComponent={
              <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
                {/* League rank card */}
                <LinearGradient
                  colors={currentRankMeta.gradient as any}
                  style={styles.rankCard}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankCardLabel}>Liga Atual</Text>
                    <Text style={[styles.rankName, { color: currentRankMeta.color }]}>
                      {currentRankMeta.label}
                    </Text>
                    {prevRankMeta && myLeague?.previous_rank_month && (
                      <Text style={styles.prevRankText}>
                        {myLeague.previous_rank_month}: <Text style={{ color: prevRankMeta.color }}>{prevRankMeta.label}</Text>
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
                    { label: 'Vitórias',  value: String(stats.wins)          },
                    { label: 'Melhor Seq.', value: String(stats.streak)       },
                    { label: 'Torneios',  value: String(stats.tournamentsWon) },
                    { label: 'Partidas',  value: String(stats.total)          },
                  ].map((s) => (
                    <View key={s.label} style={styles.statBox}>
                      <Text style={styles.statValue}>{s.value}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>CONQUISTAS</Text>
              </View>
            }
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(187,255,0,0.22)',
  },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.lg },

  rankCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', padding: spacing.lg,
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
    flex: 1, backgroundColor: 'rgba(24, 73, 18, 0.92)',
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', paddingVertical: spacing.md,
  },
  statValue: { color: '#fff', fontSize: fonts.sizes.xl, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700' },

  sectionLabel: {
    color: 'rgba(255,255,255,0.45)', fontSize: fonts.sizes.xs,
    fontWeight: '800', letterSpacing: 1.2,
  },

  achCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(24, 73, 18, 0.92)',
    borderWidth: 1, borderRadius: radius.lg,
    padding: spacing.md, gap: spacing.md, marginBottom: spacing.md,
  },
  iconBadge: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,212,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.24)',
  },
  achTitle: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md },
  achDesc: { color: colors.textMuted, fontSize: fonts.sizes.xs },
  status: { fontWeight: '800', fontSize: fonts.sizes.md },
});
