import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, ViewStyle, Pressable, Platform } from 'react-native';
import { colors, radius, spacing, fonts } from '../theme';
import { IconEye, IconEyeOff } from './Icons';
import { sfx } from '../services/sfx';

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
  compact?: boolean;
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
  compact = false,
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
          style={[styles.input, styles.inputWeb, compact && styles.inputCompact]}
          placeholder={placeholder}
          placeholderTextColor={'rgba(28,187,61,0.4)'}
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
            onPress={() => { sfx.buttonClick(); setShowPassword(!showPassword); }}
            style={styles.eyeButton}
            accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
          >
            {showPassword ? (
              <IconEyeOff size={20} color={'rgba(28,187,61,0.5)'} />
            ) : (
              <IconEye size={20} color={'rgba(28,187,61,0.5)'} />
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
    backgroundColor: '#0f2a0d',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  focused: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(28,187,61,0.05)',
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
    color: '#e5ffe5',
    fontSize: fonts.sizes.md,
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
    backgroundColor: 'transparent',
  },
  inputCompact: {
    paddingVertical: 9,
    fontSize: fonts.sizes.sm,
  },
  inputWeb: ({
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
