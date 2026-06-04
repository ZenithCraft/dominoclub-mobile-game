import React from 'react';
import { Modal, ModalProps, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

interface BlurModalProps extends ModalProps {
  children: React.ReactNode;
  intensity?: number;
}

export function BlurModal({ children, intensity = 22, ...modalProps }: BlurModalProps) {
  return (
    <Modal transparent statusBarTranslucent {...modalProps}>
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      >
        {children}
      </BlurView>
    </Modal>
  );
}
