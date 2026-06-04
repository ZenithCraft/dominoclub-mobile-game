import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconLock } from '../components/Icons';
import { api } from '../services/api';

type Props = { navigation: NativeStackNavigationProp<any> };

export function ForgotPasswordScreen({ navigation }: Props) {
  const { width: winW } = useWindowDimensions();
  const welcomeSize = winW < 480 ? 32 : 40;

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
          <View style={styles.center}>
            <View style={[styles.panel, { width: '100%', flexDirection: 'column' }]}>
              {/* Top section */}
              <View style={[styles.left, styles.leftMobile]}>
                <Text style={[styles.welcome, styles.welcomeGradientWeb, { fontSize: welcomeSize }]}>
                  Bem-vindo
                </Text>
                <Text style={styles.subtitle}>A resenha da mesa, agora no seu celular</Text>
              </View>

              {/* Form section */}
              <View style={[styles.right, { width: '100%' }]}>
                <View style={styles.formInner}>
                  <LinearGradient
                    colors={['#BEF311', '#1CBB3D']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconCircle}
                  >
                    <IconLock size={28} color="#0a1f0a" accessibilityLabel="Senha" />
                  </LinearGradient>

                  <Text style={styles.cardTitle}>Esqueceu a senha?</Text>

                  {sent ? (
                    <View style={styles.sentBox}>
                      <Text style={styles.sentText}>
                        Enviamos um link de redefinição para{'\n'}
                        <Text style={styles.sentEmail}>{email}</Text>
                      </Text>
                      <Button
                        title="Voltar ao login"
                        onPress={() => navigation.navigate('Login')}
                        style={styles.btn}
                      />
                    </View>
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
                        compact
                      />

                      <Button
                        title="Enviar"
                        onPress={handleSend}
                        loading={loading}
                        style={styles.btn}
                      />
                    </>
                  )}

                  <View style={styles.linksRow}>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                      <Text style={styles.linkMuted}>Fazer login</Text>
                    </TouchableOpacity>
                    <Text style={styles.linkSep}>·</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                      <Text style={styles.linkMuted}>Criar uma conta</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav:  { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  panel: {
    backgroundColor: 'rgba(34, 92, 52, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.16)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },

  header: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  welcome: {
    fontSize: 36,
    fontWeight: '800',
    color: Platform.OS === 'web' ? '#ffffff' : '#FDD835',
    letterSpacing: 0.5,
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System',
  },
  welcomeGradientWeb: Platform.OS === 'web'
    ? ({
        backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #FDD835 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      } as any)
    : {},
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System',
  },

  right: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  formInner: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },

  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fonts.sizes.lg, fontWeight: '700',
    color: '#ffffff', marginBottom: spacing.xs,
  },

  btn: { width: '100%' },

  sentBox: { width: '100%', alignItems: 'center', gap: spacing.lg },
  sentText: {
    color: 'rgba(255,255,255,0.75)', fontSize: fonts.sizes.sm,
    textAlign: 'center', lineHeight: 22,
  },
  sentEmail: { color: '#1CBB3D', fontWeight: '700' },

  linksRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, marginTop: spacing.xs,
  },
  linkMuted: { color: '#ffffff', fontSize: fonts.sizes.sm },
  linkSep:   { color: 'rgba(255,255,255,0.4)', fontSize: fonts.sizes.sm },
});
