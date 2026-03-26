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
  const scale   = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, friction: 7, useNativeDriver: true }),
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(8, 22, 8, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.22)',
    borderRadius: radius.xl,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: 64,
    alignItems: 'center',
    gap: spacing.xl,
    minWidth: 300,
  },
  loadingSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    letterSpacing: 1,
  },
});
