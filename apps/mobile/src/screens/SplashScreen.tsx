import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Image,
  ActivityIndicator, Animated, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fonts, radius, spacing } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { api } from '../services/api';

// Cores do estilo KYC
const KYC_COLORS = {
  modalBg: '#082006',
  modalBorder: '#0F400B',
  completed: '#1F5D18',
  uncompleted: '#0E290F',
  buttonChoice: '#0E290F',
  buttonChoiceBorder: '#1F5D18',
  buttonSelected: '#1F5D18',
  buttonNext: '#0F400B',
};

// Peças de dominó reais
const dominoImages: Record<string, any> = {
  '6-6': require('../../assets/domino-pieces/6-6.png'),
  '3-5': require('../../assets/domino-pieces/3-5.png'),
  '6-0': require('../../assets/domino-pieces/6-0.png'),
  '4-4': require('../../assets/domino-pieces/4-4.png'),
};

type Props = { navigation: NativeStackNavigationProp<any> };

export function SplashScreen({ navigation }: Props) {
  const { loadFromStorage, setTokens, setUser } = useAuthStore();
  const { width: winW, height: winH } = useWindowDimensions();
  const isTabletSize = Math.min(winW, winH) >= 768;
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
        // Check for an active game (reconnect after app restart)
        try {
          const { data: gameData } = await api.get('/game/active');
          if (gameData.game?.id) {
            navigation.replace('Game', { gameId: gameData.game.id });
            return;
          }
        } catch {}
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
    <View style={styles.root}>
      <Image
        source={require('../../assets/background.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      <View style={styles.overlay} />
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.card, isTabletSize && styles.cardTablet, { opacity, transform: [{ scale }] }]}>
          <Image
            source={require('../../assets/b9e1ca54722e75c0419489ace1bdc6e4b752369c.png')}
            style={[styles.brandLogo, isTabletSize && styles.brandLogoTablet]}
            resizeMode="contain"
            accessibilityLabel="DominoClub"
          />
          <View style={[styles.dominoRow, isTabletSize && styles.dominoRowTablet]}>
            {/* Peça esquerda */}
            <Animated.View style={[
              styles.dominoWrapper,
              { transform: [
                { translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
                { rotate: '-10deg' }
              ]}
            ]}>
              <Image
                source={dominoImages['6-6']}
                style={[styles.dominoPiece, isTabletSize && styles.dominoPieceTablet]}
                resizeMode="contain"
              />
            </Animated.View>

            {/* Peça central */}
            <Animated.View style={[
              styles.dominoWrapperCenter,
              { transform: [
                { translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
                { rotate: '0deg' }
              ]}
            ]}>
              <Image
                source={dominoImages['4-4']}
                style={[styles.dominoPieceCenter, isTabletSize && styles.dominoPieceCenterTablet]}
                resizeMode="contain"
              />
            </Animated.View>

            {/* Peça direita */}
            <Animated.View style={[
              styles.dominoWrapper,
              { transform: [
                { translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
                { rotate: '10deg' }
              ]}
            ]}>
              <Image
                source={dominoImages['3-5']}
                style={[styles.dominoPiece, isTabletSize && styles.dominoPieceTablet]}
                resizeMode="contain"
              />
            </Animated.View>
          </View>

          <View style={styles.loadingRow}>
            <ActivityIndicator color="#1CBB3D" size={isTabletSize ? 'large' : 'small'} />
            <Text style={[styles.loadingText, isTabletSize && styles.loadingTextTablet]}>Carregando...</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: KYC_COLORS.modalBg,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 32, 6, 0.75)',
  },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: KYC_COLORS.modalBg,
    borderWidth: 2,
    borderColor: KYC_COLORS.modalBorder,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: 40,
    width: 260,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.35)' } as any)
      : {
          elevation: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        }),
  },

  dominoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    position: 'relative',
    height: 65,
    width: 180,
  },
  dominoWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  dominoWrapperCenter: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 2,
    marginHorizontal: -4,
  },
  dominoPiece: {
    width: 55,
    height: 28,
    borderRadius: 4,
  },
  dominoPieceCenter: {
    width: 70,
    height: 35,
    borderRadius: 4,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  loadingText: {
    color: '#a3c4a3',
    fontSize: fonts.sizes.sm,
    letterSpacing: 2,
  },

  brandLogo: {
    width: 200,
    height: 50,
    maxWidth: '90%',
    marginBottom: spacing.xs,
  },

  // Tablet overrides
  cardTablet: {
    width: 420,
    paddingVertical: spacing.xxl,
    paddingHorizontal: 60,
  },
  brandLogoTablet: {
    width: 320,
    height: 80,
  },
  dominoRowTablet: {
    height: 110,
    width: 300,
  },
  dominoPieceTablet: {
    width: 90,
    height: 46,
  },
  dominoPieceCenterTablet: {
    width: 115,
    height: 58,
  },
  loadingTextTablet: {
    fontSize: fonts.sizes.md,
  },
});
