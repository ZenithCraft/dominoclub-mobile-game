import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../components/Logo';
import { colors, fonts, radius, spacing } from '../theme';
import { useAuthStore } from '../store/auth.store';

type Props = { navigation: NativeStackNavigationProp<any> };

export function SplashScreen({ navigation }: Props) {
  const { loadFromStorage } = useAuthStore();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();

    loadFromStorage().then(() => {
      setTimeout(() => {
        if (useAuthStore.getState().user) {
          navigation.replace('Main');
        } else {
          navigation.replace('Login');
        }
      }, 2200);
    });
  }, []);

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={styles.root}
      resizeMode="cover"
    >
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <Logo size="lg" />

        <View style={styles.loadingSection}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>Carregando</Text>
        </View>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a1f0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(8, 20, 8, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.30)',
    borderRadius: radius.xl,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: 80,
    alignItems: 'center',
    gap: spacing.xl,
    minWidth: 360,
  },
  loadingSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    letterSpacing: 2,
  },
});
