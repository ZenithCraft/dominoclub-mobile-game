import React, { useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../components/Logo';
import { colors } from '../theme';
import { useAuthStore } from '../store/auth.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export function SplashScreen({ navigation }: Props) {
  const { loadFromStorage, user, isLoading } = useAuthStore();
  const opacity = new Animated.Value(0);
  const scale = new Animated.Value(0.8);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    loadFromStorage().then(() => {
      setTimeout(() => {
        if (useAuthStore.getState().user) {
          navigation.replace('Main');
        } else {
          navigation.replace('Login');
        }
      }, 2000);
    });
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.bgPattern}>
        {Array.from({ length: 8 }).flatMap((_, row) =>
          Array.from({ length: 12 }).map((__, col) => (
            <View key={`${row}-${col}`} style={[styles.bgTile, { opacity: 0.08 }]} />
          ))
        )}
      </View>

      <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
        <Logo size="lg" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgPattern: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bgTile: {
    width: 60,
    height: 32,
    borderWidth: 1,
    borderColor: colors.primary,
    margin: 8,
    borderRadius: 4,
  },
});
