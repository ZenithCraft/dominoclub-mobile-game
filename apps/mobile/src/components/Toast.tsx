import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, ToastType } from '../store/toast.store';
import { colors, fonts, radius, spacing } from '../theme';
import { IconAlert, IconCheck, IconInfo, IconX } from './Icons';

const TYPE_CONFIG: Record<ToastType, { bg: string; border: string; Icon: React.ComponentType<any> }> = {
  error:   { bg: '#2d0a0a', border: colors.error,   Icon: IconX },
  success: { bg: '#0a2d0a', border: colors.success, Icon: IconCheck },
  warning: { bg: '#2d1f0a', border: colors.warning, Icon: IconAlert },
  info:    { bg: '#0a1a2d', border: colors.info,    Icon: IconInfo },
};

const useNative = Platform.OS !== 'web';

function ToastItem({ id, message, type }: { id: string; message: string; type: ToastType }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const dismiss    = useToastStore((s) => s.dismiss);
  const cfg        = TYPE_CONFIG[type];
  const IconComponent = cfg.Icon;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1, duration: 200, useNativeDriver: useNative }),
      Animated.timing(translateY,  { toValue: 0, duration: 200, useNativeDriver: useNative }),
    ]).start();
  }, []);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0, duration: 150, useNativeDriver: useNative }),
      Animated.timing(translateY, { toValue: -8, duration: 150, useNativeDriver: useNative }),
    ]).start(() => dismiss(id));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
      onPanResponderMove: (_, { dx }) => translateX.setValue(dx),
      onPanResponderRelease: (_, { dx, vx }) => {
        if (Math.abs(dx) > 80 || Math.abs(vx) > 0.8) {
          Animated.parallel([
            Animated.timing(translateX, { toValue: dx > 0 ? 400 : -400, duration: 180, useNativeDriver: useNative }),
            Animated.timing(opacity,    { toValue: 0, duration: 180, useNativeDriver: useNative }),
          ]).start(() => dismiss(id));
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: useNative, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.toast,
        { backgroundColor: cfg.bg, borderColor: cfg.border, opacity, transform: [{ translateY }, { translateX }] },
      ]}
    >
      <View style={[styles.iconBadge, { backgroundColor: cfg.border + '33' }]}>
        <IconComponent size={14} color={cfg.border} accessibilityLabel={type} />
      </View>
      <Text style={styles.message} numberOfLines={3}>{message}</Text>
      <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.closeBtn}>
        <IconX size={20} color={cfg.border} accessibilityLabel="Fechar" />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: insets.top + (Platform.OS === 'android' ? 8 : 4) }, (Platform.OS === 'web' ? ({ pointerEvents: 'box-none' } as any) : null)]}>
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    zIndex: 9999,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 4px 8px rgba(0,0,0,0.40)' } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 10,
        }),
  },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: {
    fontSize: 12,
    fontWeight: '800',
  },
  message: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fonts.sizes.sm,
    lineHeight: 18,
  },
  closeBtn: { flexShrink: 0 },
});
