import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { api } from '../services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { IconUser, IconApple } from '../components/Icons';
import { IconGoogle } from '../components/Icons';

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
      style={[styles.root, backgroundCoverFix]}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.panel}>
              <View style={styles.left}>
                <Text style={styles.welcome}>Bem-vindo</Text>
                <Text style={styles.subtitle}>Crie a sua conta ou faça o login</Text>
              </View>
              <View style={styles.vertDivider}>
                <LinearGradient colors={['#1a8f3a', '#4ade80', '#1a8f3a']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.vertGrad} />
              </View>
              <View style={styles.right}>
                <View style={styles.iconCircle}>
                  <IconUser size={32} color={colors.textPrimary} accessibilityLabel="Usuário" />
                </View>
                <Text style={styles.cardTitle}>Fazer login</Text>
                <Input
                  label=""
                  placeholder="Número de telefone"
                  value={phone}
                  onChangeText={(t) => { setPhone(formatPhone(t)); setError(''); }}
                  keyboardType="phone-pad"
                  error={error}
                  maxLength={15}
                />
                <Button title="Enviar código" onPress={handleSendOtp} loading={loading} style={styles.btn} />
                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                  <Text style={styles.linkMuted}>Não tem conta? Crie a sua</Text>
                </TouchableOpacity>
                <Text style={styles.orText}>Ou entre com</Text>
                <View style={styles.socialRow}>
                  <TouchableOpacity style={styles.socialBtn} accessibilityLabel="Apple">
                    <IconApple size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.socialBtn} accessibilityLabel="Google">
                    <IconGoogle size={24} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
  },
  panel: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8, 20, 8, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.28)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  left: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
  },
  welcome: { fontSize: 38, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  subtitle: { fontSize: fonts.sizes.sm, color: colors.textMuted, lineHeight: 20 },
  vertDivider: { width: 1, marginVertical: spacing.xl, backgroundColor: 'rgba(74,222,128,0.25)' },
  vertGrad: { width: 1, height: '100%' },
  right: {
    width: 360,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff', marginBottom: spacing.xs },

  btn: { width: '100%' },
  linkMuted: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
  orText: { color: colors.textMuted, fontSize: fonts.sizes.sm, marginTop: spacing.xs },
  socialRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  socialBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  }
});
