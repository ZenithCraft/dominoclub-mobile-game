import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, ViewStyle, Pressable, Platform } from 'react-native';
import { colors, radius, spacing, fonts } from '../theme';
import { IconEye, IconEyeOff } from './Icons';

interface Props {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad';
  error?: string;
  style?: ViewStyle;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  editable?: boolean;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType = 'default',
  error,
  style,
  autoCapitalize = 'none',
  maxLength,
  editable = true,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        style={[
          styles.inputWrapper,
          hovered && !focused && !error ? styles.hovered : null,
          focused && styles.focused,
          error ? styles.errorBorder : null,
        ]}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
      >
        <TextInput
          style={[styles.input, styles.inputWeb]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)} 
            style={styles.eyeButton}
            accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
          >
            {showPassword ? (
              <IconEyeOff size={20} color={colors.textSecondary} />
            ) : (
              <IconEye size={20} color={colors.textSecondary} />
            )}
          </Pressable>
        )}
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#184912',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  focused: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(74,222,128,0.05)',
  },
  hovered: {
    borderColor: 'rgba(190,243,17,0.55)',
    backgroundColor: 'rgba(190,243,17,0.06)',
  },
  errorBorder: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: fonts.sizes.md,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  inputWeb: ({
    backgroundColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any),
  eyeButton: {
    padding: spacing.xs,
  },
  eyeIcon: {
    fontSize: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: fonts.sizes.xs,
    marginTop: spacing.xs,
  },
});
