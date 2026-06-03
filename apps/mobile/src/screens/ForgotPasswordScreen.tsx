import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconLock } from '../components/Icons';
import { api } from '../services/api';

type Props = { navigation: NativeStackNavigationProp<any> };

const LIME = '#4ade80';

export function ForgotPasswordScreen({ navigation }: Props) {
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 768;
  const panelMaxW = Math.min(winW * 0.92, 960);
  const rightW = isWide ? Math.max(280, Math.min(420, winW * 0.40)) : '100%';
  const welcomeSize = winW < 480 ? 28 : winW < 768 ? 34 : 38;

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSend = async () => {
    if (!email.trim()) { setError('Digite seu e-mail'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          {/* ONE frosted-glass panel */}
          <View style={[styles.panel, isWide ? { width: panelMaxW, flexDirection: 'row' } : { width: '100%', flexDirection: 'column' }]}>
            {/* Left column */}
            <View style={[styles.left, !isWide && styles.leftMobile]}>
              <Text style={[styles.welcome, { fontSize: welcomeSize }]}>Bem-vindo</Text>
              <Text style={styles.subtitle}>A reserva da mesa, agora no seu celular</Text>
            </View>

            {/* Vertical divider */}
            <View style={[styles.vertDivider, !isWide && { display: 'none' }]} />

            {/* Right column — form */}
            <View style={[styles.right, { width: rightW }]}>
              <View style={styles.iconCircle}>
                <IconLock size={24} color={colors.textOnPrimary} accessibilityLabel="Senha" />
              </View>

              <Text style={styles.cardTitle}>Esqueceu a senha?</Text>

              {sent ? (
                <Text style={styles.sentText}>
                  Enviamos um link de redefinição para {email}
                </Text>
              ) : (
                <>
                  <Input
                    label=""
                    placeholder="Insira seu e-mail"
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={error}
                  />

                  <Button
                    title="Enviar"
                    onPress={handleSend}
                    loading={loading}
                    style={styles.btn}
                  />
                </>
              )}

              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Criar uma conta</Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },

  panel: {
    backgroundColor: 'rgba(8, 20, 8, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.28)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },

  leftMobile: { width: '100%' },
  left: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
  },
  welcome: { fontSize: 38, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  subtitle: { fontSize: fonts.sizes.sm, color: colors.textMuted, lineHeight: 20 },

  vertDivider: {
    width: 1,
    backgroundColor: 'rgba(74, 222, 128, 0.25)',
    marginVertical: spacing.xl,
  },

  right: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },

  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1CBB3D',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 24 },

  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff' },

  sentText: {
    color: LIME,
    fontSize: fonts.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  btn: { width: '100%' },

  linkText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
});
