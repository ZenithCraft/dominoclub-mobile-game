import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../components/Logo';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';

type Props = { navigation: NativeStackNavigationProp<any> };

export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const formatPhone = (text: string) => {
    const d = text.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const handleSendOtp = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 11) { setError('Digite um número de celular válido'); return; }
    setLoading(true);
    setError('');
    try {
      const formattedPhone = `+55${clean}`;
      await api.post('/auth/otp/send', { phone: formattedPhone });
      navigation.navigate('OTPVerification', { phone: formattedPhone });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/background.png')}
      style={styles.root}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo card — matches "log in.png" exactly */}
          <View style={styles.logoCard}>
            <Logo size="lg" />
          </View>

          {/* Auth form — below the logo card */}
          <View style={styles.formCard}>
            <Input
              label="Número de celular"
              placeholder="(11) 99999-9999"
              value={phone}
              onChangeText={(t) => { setPhone(formatPhone(t)); setError(''); }}
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

            <View style={styles.dividerRow}>
              <View style={styles.divLine} />
              <Text style={styles.divText}>ou</Text>
              <View style={styles.divLine} />
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkText}>Criar uma conta</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={{ marginTop: spacing.xs }}
            >
              <Text style={styles.linkMuted}>Esqueceu a senha?</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kav:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },

  /* The logo card — the hero element matching "log in.png" */
  logoCard: {
    backgroundColor: 'rgba(8, 22, 8, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.22)',
    borderRadius: radius.xl,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: 64,
    alignItems: 'center',
    minWidth: 300,
  },

  /* Auth form card below */
  formCard: {
    width: 320,
    backgroundColor: 'rgba(8, 22, 8, 0.80)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },

  btn: { width: '100%' },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
  },
  divLine: { flex: 1, height: 1, backgroundColor: 'rgba(74,222,128,0.15)' },
  divText: { color: colors.textMuted, fontSize: fonts.sizes.sm },

  linkText: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  linkMuted: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
  },
});
