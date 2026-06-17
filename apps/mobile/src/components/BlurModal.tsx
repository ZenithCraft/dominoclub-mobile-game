import React from 'react';
import { Modal, ModalProps, StyleSheet, View } from 'react-native';

interface BlurModalProps extends ModalProps {
  children: React.ReactNode;
  intensity?: number;
}

export function BlurModal({ children, intensity = 22, ...modalProps }: BlurModalProps) {
  const opacity = Math.min(0.85, intensity / 100 + 0.6);
  return (
    <Modal transparent statusBarTranslucent {...modalProps}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(0,0,0,${opacity})` }]}>
        {children}
      </View>
    </Modal>
  );
}
