import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { IconTrophy } from '../components/Icons';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params: { tournamentId: string; won: boolean; prize: number; finalPosition: number; totalPlayers?: number } };
};

function ordinal(n: number): string {
  if (n === 1) return '1º';
  if (n === 2) return '2º';
  if (n === 3) return '3º';
  return `${n}º`;
}

export function TournamentResultScreen({ navigation, route }: Props) {
  const { tournamentId, won, prize, finalPosition, totalPlayers } = route.params;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const isChampion = finalPosition === 1;
  const hasPrize   = prize > 0;

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.bg, backgroundCoverFix]}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.centered, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>

          {/* Icon */}
          <View style={[styles.iconCircle, isChampion ? styles.iconCircleWin : styles.iconCircleLoss]}>
            {isChampion
              ? <IconTrophy size={52} color="#fbbf24" accessibilityLabel="Campeão" />
              : <Text style={styles.eliminatedEmoji}>💀</Text>
            }
          </View>

          {/* Title */}
          <Text style={[styles.title, isChampion ? styles.titleWin : styles.titleLoss]}>
            {isChampion ? '🏆 Você é o Campeão!' : 'Você foi eliminado'}
          </Text>

          {/* Result card */}
          <LinearGradient
            colors={isChampion
              ? ['rgba(251,191,36,0.20)', 'rgba(0,0,0,0.45)', 'rgba(251,191,36,0.10)']
              : ['rgba(239,68,68,0.15)', 'rgba(0,0,0,0.45)', 'rgba(239,68,68,0.08)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.resultCard}
          >
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Posição final</Text>
              <Text style={[styles.resultValue, isChampion && { color: '#fbbf24' }]}>
                {ordinal(finalPosition)}
                {totalPlayers ? ` / ${totalPlayers}` : ''}
              </Text>
            </View>

            <View style={styles.resultDivider} />

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Prêmio</Text>
              <Text style={[styles.resultValue, hasPrize ? { color: '#4ade80' } : { color: 'rgba(255,255,255,0.4)' }]}>
                {hasPrize ? `R$ ${prize.toFixed(2)}` : '—'}
              </Text>
            </View>
          </LinearGradient>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.bracketBtn}
              onPress={() => navigation.replace('TournamentBracket', { tournamentId })}
              activeOpacity={0.85}
            >
              <Text style={styles.bracketBtnText}>Ver chaveamento</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.homeBtn}
              onPress={() => navigation.replace('Main')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#4ade80', '#16a34a']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.homeBtnGrad}
              >
                <Text style={styles.homeBtnText}>Ir para o início</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playAgainBtn}
              onPress={() => navigation.replace('ModeSelect', { mode: 'TORNEIO' })}
              activeOpacity={0.85}
            >
              <Text style={styles.playAgainBtnText}>Entrar em outro torneio</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0a1f0a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.60)' },
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xl },

  iconCircle: {
    width: 110, height: 110, borderRadius: 55,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  iconCircleWin: { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.5)' },
  iconCircleLoss: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)' },
  eliminatedEmoji: { fontSize: 48 },

  title: { fontSize: fonts.sizes.xxl, fontWeight: '900', textAlign: 'center' },
  titleWin: { color: '#fbbf24' },
  titleLoss: { color: '#fff' },

  resultCard: {
    width: '100%', maxWidth: 360,
    borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    gap: spacing.md,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.md, fontWeight: '600' },
  resultValue: { color: '#fff', fontSize: fonts.sizes.xl, fontWeight: '900' },
  resultDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },

  actions: { width: '100%', maxWidth: 360, gap: spacing.sm },

  bracketBtn: {
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 14, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  bracketBtnText: { color: '#e2e8f0', fontWeight: '700', fontSize: fonts.sizes.md },

  homeBtn: { borderRadius: radius.full, overflow: 'hidden' },
  homeBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  homeBtnText: { color: '#052e16', fontWeight: '900', fontSize: fonts.sizes.md },

  playAgainBtn: { alignItems: 'center', paddingVertical: 10 },
  playAgainBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: fonts.sizes.sm, fontWeight: '600' },
});
