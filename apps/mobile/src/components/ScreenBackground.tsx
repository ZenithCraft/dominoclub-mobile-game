import React from 'react';
import { ImageBackground, View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { backgroundCoverFix } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenBackground({ children, style }: Props) {
  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix, style]}
      resizeMode="cover"
      blurRadius={Platform.OS === 'web' ? 0 : 5}
    >
      <View style={styles.overlay} pointerEvents="none" />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
});
