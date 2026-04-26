import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Image,
  ActivityIndicator, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, radius, spacing } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { useAuthStore } from '../store/auth.store';
import { api } from '../services/api';

type Props = { navigation: NativeStackNavigationProp<any> };

function MiniPips({ value }: { value: number }) {
  const pos = [
    { x: 0.22, y: 0.22 },
    { x: 0.5,  y: 0.22 },
    { x: 0.78, y: 0.22 },
    { x: 0.22, y: 0.5 },
    { x: 0.5,  y: 0.5 },
    { x: 0.78, y: 0.5 },
    { x: 0.22, y: 0.78 },
    { x: 0.5,  y: 0.78 },
    { x: 0.78, y: 0.78 },
  ];
  const map: Record<number, number[]> = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const ids = map[Math.max(0, Math.min(6, value))] ?? [];
  return (
    <View style={styles.miniPips}>
      {ids.map((id) => (
        <View
          key={id}
          style={[
            styles.miniPip,
            {
              left: `${pos[id].x * 100}%`,
              top: `${pos[id].y * 100}%`,
            },
          ]}
        />
      ))}
    </View>
  );
}

function MiniDomino({ left, right }: { left: number; right: number }) {
  return (
    <View style={styles.miniDomino}>
      <View style={styles.miniHalf}>
        <MiniPips value={left} />
      </View>
      <View style={styles.miniDivider} />
      <View style={styles.miniHalf}>
        <MiniPips value={right} />
      </View>
    </View>
  );
}

export function SplashScreen({ navigation }: Props) {
  const { loadFromStorage, setTokens, setUser } = useAuthStore();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.92)).current;
  const pulse   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: (Platform as any).OS !== 'web' }),
      Animated.spring(scale,   { toValue: 1, friction: 6, tension: 80, useNativeDriver: (Platform as any).OS !== 'web' }),
    ]).start();

    let loop: Animated.CompositeAnimation | null = null;
    if (process.env.NODE_ENV !== 'test') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: (Platform as any).OS !== 'web' }),
          Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: (Platform as any).OS !== 'web' }),
        ])
      );
      loop.start();
    }

    const DEV_AUTO_LOGIN = process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true';

    let timer: ReturnType<typeof setTimeout> | null = null;
    loadFromStorage().then(async () => {
      if (!useAuthStore.getState().user && !useAuthStore.getState().accessToken && DEV_AUTO_LOGIN) {
        try {
          const { data } = await api.post('/auth/dev/login', {
            phone: '+5599999999999',
            name: 'Super Admin',
          });
          setTokens(data.accessToken, data.refreshToken);
          setUser(data.user);
        } catch {}
      }
      timer = setTimeout(async () => {
        if (!useAuthStore.getState().user) {
          navigation.replace('Login');
          return;
        }
        // Check for an active tournament enrollment
        try {
          const { data } = await api.get('/game/tournaments/my-active');
          if (data.enrollment) {
            navigation.replace('TournamentWaiting', {
              tournamentId: data.enrollment.tournamentId,
              tournamentName: data.enrollment.tournamentName,
              startsAt: data.enrollment.startsAt,
              entryFee: data.enrollment.entryFee,
            });
            return;
          }
        } catch {}
        navigation.replace('Main');
      }, 2400);
    });

    return () => {
      if (loop) loop.stop();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <Image
            source={require('../../assets/b9e1ca54722e75c0419489ace1bdc6e4b752369c.png')}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="DominoClub"
          />
          <Animated.View style={{ transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }, { rotate: '-10deg' }] }}>
            <MiniDomino left={6} right={6} />
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }, { rotate: '10deg' }] }}>
            <MiniDomino left={5} right={3} />
          </Animated.View>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.loadingText}>Carregando...</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 18, 8, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.28)',
    borderRadius: radius.xl,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: 72,
    gap: spacing.xl,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    letterSpacing: 2,
  },

  miniDomino: {
    width: 96,
    height: 54,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  miniHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  miniDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.16)' },
  miniPips: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  miniPip: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#1a1a1a',
    transform: [{ translateX: -3.5 }, { translateY: -3.5 }],
  },
  brandLogo: {
    width: 260,
    height: 64,
    maxWidth: '92%',
    marginBottom: 10,
  },
});
