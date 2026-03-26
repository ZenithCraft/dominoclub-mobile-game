import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  ActivityIndicator, Animated, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, radius, spacing, backgroundCoverFix } from '../theme';
import { useAuthStore } from '../store/auth.store';

type Props = { navigation: NativeStackNavigationProp<any> };

export function SplashScreen({ navigation }: Props) {
  const { loadFromStorage } = useAuthStore();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();

    loadFromStorage().then(() => {
      setTimeout(() => {
        navigation.replace(useAuthStore.getState().user ? 'Main' : 'Login');
      }, 2400);
    });
  }, []);

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix]}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.loadingText}>Carregando</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
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

  logo: {
    width: 220,
    height: 80,
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
});
