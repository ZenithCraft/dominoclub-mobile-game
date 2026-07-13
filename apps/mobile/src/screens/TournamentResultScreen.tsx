import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Pressable, Image, Platform } from 'react-native';
import { BlurModal } from '../components/BlurModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fonts, radius, shadows } from '../theme';
import { isTablet } from '../theme/responsive';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconTrophy, IconSettings, IconX } from '../components/Icons';
import { GradientToggle } from './HomeScreen';
import { sfx } from '../services/sfx';

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
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const isChampion = finalPosition === 1;
  const hasPrize   = prize > 0;

  return (
    <ScreenBackground style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={[]}>
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.gearBtn} onPress={() => { sfx.buttonClick(); setSettingsVisible(true); }} accessibilityLabel="Configurações">
            <IconSettings size={22} color="#fff" accessibilityLabel="Configurações" />
          </TouchableOpacity>
        </View>
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
              <Text style={[styles.resultValue, hasPrize ? { color: '#1CBB3D' } : { color: 'rgba(255,255,255,0.4)' }]}>
                {hasPrize ? `R$ ${prize.toFixed(2)}` : '—'}
              </Text>
            </View>
          </LinearGradient>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.bracketBtn}
              onPress={() => { sfx.buttonClick(); navigation.replace('TournamentBracket', { tournamentId }); }}
              activeOpacity={0.85}
            >
              <Text style={styles.bracketBtnText}>Ver chaveamento</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.homeBtn}
              onPress={() => { sfx.buttonClick(); navigation.replace('Main'); }}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#BEF311', '#1CBB3D']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.homeBtnGrad}
              >
                <Text style={styles.homeBtnText}>Ir para o início</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playAgainBtn}
              onPress={() => { sfx.buttonClick(); navigation.replace('ModeSelect', { mode: 'TORNEIO' }); }}
              activeOpacity={0.85}
            >
              <Text style={styles.playAgainBtnText}>Entrar em outro torneio</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>

        {/* ── Settings modal ── */}
        <BlurModal visible={settingsVisible} transparent animationType="fade">
          <Pressable style={settingsStyles.overlay} onPress={() => setSettingsVisible(false)} testID="settings-overlay">
            <Pressable style={settingsStyles.card} onPress={() => {}} onStartShouldSetResponder={() => true} testID="settings-card">
              <View style={[settingsStyles.textureWrap, (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : null)]}>
                <Image
                  source={require('../../assets/e27c2e8e377e60057010a8431706b96b0152436f.png')}
                  style={settingsStyles.texture}
                  resizeMode="cover"
                />
              </View>
              <View style={settingsStyles.header}>
                <View style={{ width: 26 }} />
                <Text style={settingsStyles.title}>Configurações</Text>
                <TouchableOpacity onPress={() => { sfx.buttonClick(); setSettingsVisible(false); }} accessibilityLabel="Fechar configurações">
                  <IconX size={26} color="#fff" accessibilityLabel="Fechar" />
                </TouchableOpacity>
              </View>
              <View style={settingsStyles.row}>
                <Text style={settingsStyles.label}>Som:</Text>
                <GradientToggle value={soundOn} onValueChange={setSoundOn} pressableTestID="settings-sound-toggle" accessibilityLabel="Som" kind="sound" />
              </View>
              <View style={settingsStyles.row}>
                <Text style={settingsStyles.label}>Música:</Text>
                <GradientToggle value={musicOn} onValueChange={setMusicOn} pressableTestID="settings-music-toggle" accessibilityLabel="Música" kind="music" />
              </View>
            </Pressable>
          </Pressable>
        </BlurModal>

      </SafeAreaView>
    </ScreenBackground>
  );
}

const SETTINGS_CARD_PAD = Platform.OS === 'web' ? 24 : 16;
const SETTINGS_ITEM_GAP = Platform.OS === 'web' ? 24 : 16;

const settingsStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  card: {
    width: Platform.OS === 'web' ? 640 : 520,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: SETTINGS_CARD_PAD,
    gap: SETTINGS_ITEM_GAP,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#BBFF00',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 8px 20px rgba(0,0,0,0.45)' } as any) : shadows.card),
  },
  textureWrap: { ...StyleSheet.absoluteFillObject },
  texture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    width: '140%',
    height: '140%',
    top: '-20%' as any,
    left: '-20%' as any,
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover', objectPosition: 'center' } as any) : null),
  } as any,
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SETTINGS_CARD_PAD,
    paddingVertical: SETTINGS_ITEM_GAP,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  label: {
    fontSize: fonts.sizes.xl,
    color: '#fff',
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
});

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0a1f0a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.60)' },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  gearBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(187,255,0,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
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
    width: '100%', maxWidth: isTablet ? 680 : 360,
    borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    gap: spacing.md,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { color: 'rgba(255,255,255,0.6)', fontSize: fonts.sizes.md, fontWeight: '600' },
  resultValue: { color: '#fff', fontSize: fonts.sizes.xl, fontWeight: '900' },
  resultDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },

  actions: { width: '100%', maxWidth: isTablet ? 680 : 360, gap: spacing.sm },

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
