import React from 'react';
import { ImageBackground, View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { backgroundCoverFix } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const webImageStyle = Platform.OS === 'web'
  ? ({ filter: 'blur(10px)', transform: 'scale(1.12)' } as any)
  : undefined;

export function ScreenBackground({ children, style }: Props) {
  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={[styles.root, backgroundCoverFix, style]}
      imageStyle={webImageStyle}
      resizeMode="cover"
      blurRadius={Platform.OS === 'web' ? 0 : 10}
    >
      <View style={styles.overlay} pointerEvents="none" />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a', overflow: 'hidden' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.84)',
  },
});
