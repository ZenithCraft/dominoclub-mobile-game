import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ImageBackground, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { IconTrophy } from '../components/Icons';
import { api } from '../services/api';
import { connectSocket } from '../services/socket';

type BracketGame = {
  id: string;
  status: string;
  tournament_round: number;
  players: { userId: string; user: { id: string; name: string; avatar: string | null } }[];
};

type BracketData = {
  tournament: {
    id: string; name: string; status: string;
    current_round: number; max_players: number;
    prize_pool: number; entry_fee: number;
    starts_at: string;
  };
  players: { userId: string; eliminated_at: string | null; final_position: number | null; prize_won: number; user: { id: string; name: string; avatar: string | null } }[];
  games: BracketGame[];
  myStatus: { eliminated: boolean; finalPosition: number | null; prizeWon: number };
};

function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quartas de final';
  return `Rodada ${round}`;
}

function avatar(name: string) {
  return name?.[0]?.toUpperCase() ?? '?';
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params: { tournamentId: string } };
};

export function TournamentBracketScreen({ navigation, route }: Props) {
  const { tournamentId } = route.params;
  const [data, setData] = useState<BracketData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBracket = useCallback(async () => {
    try {
      const res = await api.get(`/game/tournaments/${tournamentId}/bracket`);
      setData(res.data);
    } catch {} finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchBracket();
    const interval = setInterval(fetchBracket, 10_000); // poll every 10s
    return () => clearInterval(interval);
  }, [fetchBracket]);

  // Listen for next_game / eliminated events to redirect
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const socket = await connectSocket();
        socket.on('tournament:next_game', (d: { tournamentId: string; gameId: string }) => {
          if (!mounted || d.tournamentId !== tournamentId) return;
          navigation.replace('Game', { gameId: d.gameId });
        });
        socket.on('tournament:champion', (d: { tournamentId: string; prize: number }) => {
          if (!mounted || d.tournamentId !== tournamentId) return;
          navigation.replace('TournamentResult', { tournamentId, won: true, prize: d.prize, finalPosition: 1 });
        });
        socket.on('tournament:eliminated', (d: { tournamentId: string; finalPosition: number; prize: number }) => {
          if (!mounted || d.tournamentId !== tournamentId) return;
          navigation.replace('TournamentResult', { tournamentId, won: false, prize: d.prize, finalPosition: d.finalPosition });
        });
      } catch {}
    })();
    return () => { mounted = false; };
  }, [tournamentId]);

  if (loading || !data) {
    return (
      <ImageBackground source={require('../../assets/background.png')} style={[styles.bg, backgroundCoverFix]} resizeMode="cover">
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <ActivityIndicator color="#4ade80" size="large" />
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const { tournament, games, players } = data;
  const totalRounds = Math.max(1, Math.ceil(Math.log2(tournament.max_players)));
  const rounds = Array.from({ length: tournament.current_round }, (_, i) => i + 1);

  const isEliminated = (userId: string) =>
    players.find((p) => p.userId === userId)?.eliminated_at != null;

  return (
    <ImageBackground source={require('../../assets/background.png')} style={[styles.bg, backgroundCoverFix]} resizeMode="cover">
      <View style={styles.overlay} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
              <Text style={styles.backBtnText}>← Voltar</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <IconTrophy size={20} color="#fbbf24" accessibilityLabel="Torneio" />
              <Text style={styles.headerTitle}>{tournament.name}</Text>
            </View>
            <View style={{ width: 70 }} />
          </View>

          {/* Prize info */}
          <LinearGradient
            colors={['rgba(251,191,36,0.15)', 'rgba(0,0,0,0.3)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.prizeCard}
          >
            <Text style={styles.prizeLabel}>Prêmio total</Text>
            <Text style={styles.prizeValue}>R$ {tournament.prize_pool.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
            <Text style={styles.prizeRound}>Rodada atual: {roundLabel(tournament.current_round, totalRounds)}</Text>
          </LinearGradient>

          {/* Rounds column */}
          {/* Round progress pills */}
          <View style={styles.progressRow}>
            {Array.from({ length: totalRounds }, (_, i) => {
              const r = i + 1;
              const done = r < tournament.current_round;
              const active = r === tournament.current_round;
              return (
                <View key={r} style={styles.progressStep}>
                  <View style={[styles.progressCircle, done && styles.progressDone, active && styles.progressActive]}>
                    <Text style={[styles.progressNum, (done || active) && styles.progressNumActive]}>{r}</Text>
                  </View>
                  <Text style={[styles.progressLabel, active && styles.progressLabelActive]}>
                    {roundLabel(r, totalRounds)}
                  </Text>
                  {r < totalRounds && <View style={[styles.progressLine, done && styles.progressLineDone]} />}
                </View>
              );
            })}
          </View>

          {/* Games per round */}
          {rounds.map((round) => {
            const roundGames = games.filter((g) => g.tournament_round === round);
            return (
              <View key={round} style={styles.roundSection}>
                <Text style={styles.roundTitle}>{roundLabel(round, totalRounds)}</Text>
                {roundGames.map((game) => (
                  <View key={game.id} style={styles.matchCard}>
                    {game.players.map((gp, idx) => {
                      const elim = isEliminated(gp.userId);
                      const isLast = idx === game.players.length - 1;
                      return (
                        <View key={gp.userId}>
                          <View style={[styles.matchPlayer, elim && styles.matchPlayerElim]}>
                            <View style={styles.matchAvatar}>
                              <Text style={styles.matchAvatarText}>{avatar(gp.user.name)}</Text>
                            </View>
                            <Text style={[styles.matchPlayerName, elim && styles.matchPlayerNameElim]}>
                              {gp.user.name}
                            </Text>
                            {elim && <Text style={styles.matchElimTag}>Eliminado</Text>}
                            {game.status === 'FINISHED' && !elim && <Text style={styles.matchWinTag}>✓ Vencedor</Text>}
                          </View>
                          {!isLast && <View style={styles.matchDivider} />}
                        </View>
                      );
                    })}
                    <View style={[styles.matchStatus, game.status === 'FINISHED' && styles.matchStatusDone]}>
                      <Text style={styles.matchStatusText}>
                        {game.status === 'WAITING' ? 'Aguardando' : game.status === 'PLAYING' ? 'Em andamento' : 'Finalizado'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}

        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0a1f0a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { paddingVertical: 8, paddingHorizontal: spacing.sm },
  backBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.sm, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerTitle: { color: '#fff', fontSize: fonts.sizes.lg, fontWeight: '900' },

  prizeCard: {
    borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
    alignItems: 'center', gap: 4,
  },
  prizeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.sm, fontWeight: '600' },
  prizeValue: { color: '#fbbf24', fontSize: fonts.sizes.xxl, fontWeight: '900' },
  prizeRound: { color: 'rgba(255,255,255,0.5)', fontSize: fonts.sizes.xs },

  progressRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 0 },
  progressStep: { alignItems: 'center', flex: 1, position: 'relative' },
  progressCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  progressDone: { backgroundColor: 'rgba(74,222,128,0.2)', borderColor: '#4ade80' },
  progressActive: { backgroundColor: '#4ade80', borderColor: '#4ade80' },
  progressNum: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.xs, fontWeight: '700' },
  progressNumActive: { color: '#052e16' },
  progressLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, textAlign: 'center', fontWeight: '600' },
  progressLabelActive: { color: '#4ade80' },
  progressLine: {
    position: 'absolute', top: 15, left: '50%', right: '-50%', height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressLineDone: { backgroundColor: '#4ade80' },

  roundSection: { gap: spacing.sm },
  roundTitle: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.sm, fontWeight: '700', letterSpacing: 0.5 },

  matchCard: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  matchPlayer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  matchPlayerElim: { opacity: 0.45 },
  matchAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(74,222,128,0.2)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  matchAvatarText: { color: '#4ade80', fontWeight: '900', fontSize: fonts.sizes.md },
  matchPlayerName: { color: '#fff', fontWeight: '700', fontSize: fonts.sizes.md, flex: 1 },
  matchPlayerNameElim: { textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.4)' },
  matchElimTag: {
    backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 2,
    color: '#fca5a5', fontSize: fonts.sizes.xs, fontWeight: '700',
  },
  matchWinTag: {
    backgroundColor: 'rgba(74,222,128,0.2)', borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 2,
    color: '#4ade80', fontSize: fonts.sizes.xs, fontWeight: '700',
  },
  matchDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: spacing.md },
  matchStatus: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    paddingVertical: 6, paddingHorizontal: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  matchStatusDone: { backgroundColor: 'rgba(74,222,128,0.08)' },
  matchStatusText: { color: 'rgba(255,255,255,0.5)', fontSize: fonts.sizes.xs, fontWeight: '600' },
});
