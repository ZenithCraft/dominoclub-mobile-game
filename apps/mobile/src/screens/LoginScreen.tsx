import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';

type Props = { navigation: NativeStackNavigationProp<any> };

const LIME = '#4ade80';

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
        <View style={styles.row}>
          {/* Left column */}
          <View style={styles.left}>
            <Text style={styles.welcome}>Bem-vindo</Text>
            <Text style={styles.subtitle}>Crie a sua conta ou faça o login</Text>
          </View>

          {/* Vertical divider */}
          <View style={styles.vertDivider} />

          {/* Right card */}
          <View style={styles.card}>
            {/* Icon circle */}
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>📱</Text>
            </View>

            <Text style={styles.cardTitle}>Entrar</Text>
            <Text style={styles.cardSubtitle}>Informe seu número de celular</Text>

            <Input
              label=""
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
              <Text style={styles.linkPrimary}>Criar uma conta</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.linkMuted}>Esqueceu a senha?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  kav:  { flex: 1 },

  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
  },

  left: {
    flex: 1,
    paddingRight: spacing.xxl,
    gap: spacing.md,
  },
  welcome: {
    fontSize: 38,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },

  vertDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(74, 222, 128, 0.25)',
    marginVertical: spacing.md,
    marginRight: spacing.xxl,
  },

  card: {
    width: 340,
    backgroundColor: 'rgba(8, 20, 8, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.30)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },

  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconText: { fontSize: 24 },

  cardTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: '800',
    color: '#ffffff',
  },
  cardSubtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    marginTop: -spacing.xs,
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

  linkPrimary: {
    color: LIME,
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
  },
  linkMuted: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
  },
});
