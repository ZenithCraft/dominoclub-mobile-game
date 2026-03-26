import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <View style={styles.container}>
            {/* ── Hero logo card — matches log in.png exactly ── */}
            <View style={styles.logoCard}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* ── Auth form card ── */}
            <View style={styles.formCard}>
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
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  container: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },

  // Hero logo card — mirrors Loading.png but no spinner
  logoCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },

  logo: {
    width: 220,
    height: 80,
  },

  // Auth form below logo
  formCard: {
    width: 360,
    backgroundColor: 'rgba(8, 20, 8, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.28)',
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
