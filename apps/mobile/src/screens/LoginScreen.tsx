import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from '../components/Logo';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 11) {
      setError('Digite um número de celular válido');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formattedPhone = `+55${cleanPhone}`;
      await api.post('/auth/otp/send', { phone: formattedPhone });
      navigation.navigate('OTPVerification', { phone: formattedPhone });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  return (
    <View style={styles.container}>
      {/* Domino pattern background */}
      <View style={styles.bgPattern} pointerEvents="none">
        {Array.from({ length: 60 }).map((_, i) => (
          <View key={i} style={styles.bgTile} />
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.left}>
            <Logo size="lg" />
            <Text style={styles.tagline}>Bem-vindo</Text>
            <Text style={styles.subtitle}>Jogue dominó online{'\n'}com apostas reais em PIX</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Entrar</Text>
            <Text style={styles.cardSubtitle}>
              Digite seu número para receber o código de acesso
            </Text>

            <Input
              label="Celular"
              placeholder="(11) 99999-9999"
              value={phone}
              onChangeText={(t) => setPhone(formatPhone(t))}
              keyboardType="phone-pad"
              error={error}
              maxLength={15}
            />

            <Button
              title="Enviar código"
              onPress={handleSendOtp}
              loading={loading}
              style={styles.btn}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              title="Criar conta"
              onPress={() => navigation.navigate('Register')}
              variant="ghost"
              style={styles.btn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
    gap: spacing.xxl,
  },
  bgPattern: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  bgTile: {
    width: 50,
    height: 28,
    borderWidth: 1,
    borderColor: colors.primary,
    margin: 8,
    borderRadius: 3,
    opacity: 0.06,
  },
  left: {
    flex: 1,
    gap: spacing.lg,
  },
  tagline: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xxl,
  },
  subtitle: {
    fontSize: fonts.sizes.lg,
    color: colors.textSecondary,
    lineHeight: 26,
  },
  card: {
    width: 360,
    backgroundColor: 'rgba(10,31,10,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.xxl,
  },
  cardTitle: {
    fontSize: fonts.sizes.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  btn: {
    width: '100%',
    marginTop: spacing.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
  },
});
