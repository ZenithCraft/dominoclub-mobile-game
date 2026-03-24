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

const TYPE_CONFIG: Record<ToastType, { bg: string; border: string; icon: string }> = {
  error:   { bg: '#2d0a0a', border: colors.error,   icon: '✕' },
  success: { bg: '#0a2d0a', border: colors.success,  icon: '✓' },
  warning: { bg: '#2d1f0a', border: colors.warning,  icon: '!' },
  info:    { bg: '#0a1a2d', border: colors.info,     icon: 'i' },
};

function ToastItem({ id, message, type }: { id: string; message: string; type: ToastType }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const dismiss = useToastStore((s) => s.dismiss);
  const cfg = TYPE_CONFIG[type];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -8, duration: 150, useNativeDriver: true }),
    ]).start(() => dismiss(id));
  };

  return (
    <Animated.View style={[styles.toast, { backgroundColor: cfg.bg, borderColor: cfg.border, opacity, transform: [{ translateY }] }]}>
      <View style={[styles.iconBadge, { backgroundColor: cfg.border + '33' }]}>
        <Text style={[styles.icon, { color: cfg.border }]}>{cfg.icon}</Text>
      </View>
      <Text style={styles.message} numberOfLines={3}>{message}</Text>
      <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.closeBtn}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: insets.top + (Platform.OS === 'android' ? 8 : 4) }]} pointerEvents="box-none">
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
  closeBtn: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
  },
});
