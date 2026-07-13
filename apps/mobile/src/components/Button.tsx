import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Platform,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, fonts } from '../theme';
import { sfx } from '../services/sfx';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  style,
  textStyle,
}: Props) {
  const isDisabled = disabled || loading;

  const handlePress = () => {
    sfx.buttonClick();
    onPress();
  };

  const sizeStyles = {
    sm: { paddingVertical: 8, paddingHorizontal: 16, fontSize: fonts.sizes.sm },
    md: { paddingVertical: 14, paddingHorizontal: 24, fontSize: fonts.sizes.md },
    lg: { paddingVertical: 18, paddingHorizontal: 32, fontSize: fonts.sizes.lg },
  }[size];

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={isDisabled}
        style={[styles.touchable, isDisabled && styles.disabled, style]}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#BEF311', '#1CBB3D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { paddingVertical: sizeStyles.paddingVertical, paddingHorizontal: sizeStyles.paddingHorizontal }]}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={[styles.primaryText, { fontSize: sizeStyles.fontSize }, textStyle]}>
              {title}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyle = {
    secondary: styles.secondary,
    ghost: styles.ghost,
    outline: styles.outline,
    danger: styles.danger,
  }[variant as 'secondary' | 'ghost' | 'outline' | 'danger'];

  const variantTextStyle = {
    secondary: styles.secondaryText,
    ghost: styles.ghostText,
    outline: styles.outlineText,
    danger: styles.dangerText,
  }[variant as 'secondary' | 'ghost' | 'outline' | 'danger'];

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isDisabled}
      style={[
        styles.base,
        variantStyle,
        { paddingVertical: sizeStyles.paddingVertical, paddingHorizontal: sizeStyles.paddingHorizontal },
        isDisabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.baseText, variantTextStyle, { fontSize: sizeStyles.fontSize }, textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function WalletBalanceButton({
  balance,
  onPress,
  style,
  height,
}: {
  balance: number;
  onPress?: () => void;
  style?: ViewStyle;
  height?: number;
}) {
  const content = (
    <Text style={walletStyles.balanceText}>R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</Text>
  );

  return (
    <TouchableOpacity style={[walletStyles.wrap, height != null && { height }, style]} onPress={onPress} activeOpacity={0.85}>
      {Platform.OS === 'web' ? (
        <View
          style={[
            walletStyles.pill,
            {
              backgroundImage: 'linear-gradient(114.864deg, rgb(190, 243, 17), rgb(28, 187, 61))',
            } as any,
          ]}
        >
          {content}
        </View>
      ) : (
        <LinearGradient
          colors={['#BEF311', '#1CBB3D']}
          start={{ x: 0, y: 0.268 }}
          end={{ x: 1, y: 0.732 }}
          style={walletStyles.pill}
        >
          {content}
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: colors.textOnPrimary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  baseText: {
    fontWeight: '600',
  },
  secondaryText: {
    color: colors.textPrimary,
  },
  ghostText: {
    color: colors.primary,
  },
  outlineText: {
    color: colors.textSecondary,
  },
  dangerText: {
    color: '#fff',
  },
});

const walletStyles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  balanceText: { color: '#0a1f0a', fontWeight: '900', fontSize: fonts.sizes.sm },
  balancePlus: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    paddingBottom: 2,
    paddingTop: 4,
  },
  balancePlusText: { color: '#000', fontWeight: '900', fontSize: 20 },
});
