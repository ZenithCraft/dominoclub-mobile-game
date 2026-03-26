import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
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

function ToastItem({ id, message, type }: { id: string; message: string; type: ToastType }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const dismiss = useToastStore((s) => s.dismiss);
  const cfg = TYPE_CONFIG[type];
  const IconComponent = cfg.Icon;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: (Platform as any).OS !== 'web' }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: (Platform as any).OS !== 'web' }),
    ]).start();
  }, []);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: (Platform as any).OS !== 'web' }),
      Animated.timing(translateY, { toValue: -8, duration: 150, useNativeDriver: (Platform as any).OS !== 'web' }),
    ]).start(() => dismiss(id));
  };

  return (
    <Animated.View style={[styles.toast, { backgroundColor: cfg.bg, borderColor: cfg.border, opacity, transform: [{ translateY }] }]}>
      <View style={[styles.iconBadge, { backgroundColor: cfg.border + '33' }]}>
        <IconComponent size={14} color={cfg.border} accessibilityLabel={type} />
      </View>
      <Text style={styles.message} numberOfLines={3}>{message}</Text>
      <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <IconX size={14} color={colors.textMuted} accessibilityLabel="Fechar" />
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
    left: spacing.lg,
    right: spacing.lg,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
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
