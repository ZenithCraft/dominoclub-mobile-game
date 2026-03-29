import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  KeyboardAvoidingView, Platform, TouchableOpacity, ScrollView, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { LinearGradient } from 'expo-linear-gradient';
import { IconUser, IconGoogle, IconAppleLogo } from '../components/Icons';

type Props = { navigation: NativeStackNavigationProp<any> };

const LIME = '#4ade80';

export function LoginScreen({ navigation }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [hoverApple, setHoverApple] = useState(false);
  const [hoverGoogle, setHoverGoogle] = useState(false);
  const { setTokens, setUser } = useAuthStore();

  const isEmail = /[a-zA-Z@]/.test(identifier);
  const DEV_AUTH_BYPASS =
    process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true' ||
    (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'));

  const formatPhone = (text: string) => {
    const d = text.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const handleIdentifierChange = (t: string) => {
    const looksLikePhone = /^[0-9()\s+-]*$/.test(t);
    setIdentifier(looksLikePhone ? formatPhone(t) : t);
    setError('');
  };

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      if (DEV_AUTH_BYPASS) {
        const clean = identifier.replace(/\D/g, '');
        const phone = clean.length >= 11 ? `+55${clean}` : undefined;
        const { data } = await api.post('/auth/dev/login', { phone, name: 'Dev User' });
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
        navigation.replace('Main');
        return;
      }

      if (identifier.includes('@')) { setError('Use seu número de telefone para entrar'); return; }
      const clean = identifier.replace(/\D/g, '');
      if (clean.length < 11) { setError('Digite um número de celular válido'); return; }
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
            <View style={[styles.panel, styles.panelWeb]}>
              <View style={styles.left}>
                <Text style={[styles.welcome, styles.welcomeGradientWeb]}>Bem-vindo</Text>
                <Text style={styles.subtitle}>A resenha da mesa, agora no seu celular</Text>
              </View>
              <View style={styles.vertDivider}>
                <LinearGradient
                  colors={[
                    'rgba(44,99,35,0)',
                    '#2C6323',
                    '#BBFF00',
                    '#1E5518',
                    'rgba(30,85,24,0)',
                  ]}
                  locations={[0, 0.14, 0.5, 0.86, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.vertGrad}
                />
              </View>
              <View style={styles.right}>
                <View style={styles.formInner}>
                  <View style={styles.iconCircle}>
                    <IconUser size={32} color={colors.textPrimary} accessibilityLabel="Usuário" />
                  </View>
                  <Text style={styles.cardTitle}>Entrar</Text>
                <Input
                  label=""
                  placeholder="Email ou número de telefone"
                  value={identifier}
                  onChangeText={handleIdentifierChange}
                  keyboardType={isEmail ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                  error={error}
                  maxLength={isEmail ? 64 : 15}
                />
                  <Input
                    label=""
                    placeholder="Senha"
                    value={password}
                    onChangeText={(t) => setPassword(t)}
                    secureTextEntry
                  />

                  <View style={styles.forgotRow}>
                    <TouchableOpacity style={styles.forgotBtn} onPress={() => navigation.navigate('ForgotPassword')}>
                      <Text style={styles.forgotText}>Esqueceu a senha?</Text>
                    </TouchableOpacity>
                  </View>

                  <Button title="Entrar" onPress={handleSendOtp} loading={loading} size="sm" style={styles.btn} />

                  <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                    <Text style={styles.linkMuted}>Criar uma conta</Text>
                  </TouchableOpacity>

                  <Text style={styles.orText}>Ou entre com</Text>
                  <View style={styles.socialRow}>
                    <Pressable
                      onHoverIn={() => setHoverApple(true)}
                      onHoverOut={() => setHoverApple(false)}
                      style={[styles.socialBtn, hoverApple && styles.socialBtnHover]}
                      accessibilityLabel="Apple"
                    >
                      <IconAppleLogo size={20} color="#fff" accessibilityLabel="Apple" />
                    </Pressable>
                    <Pressable
                      onHoverIn={() => setHoverGoogle(true)}
                      onHoverOut={() => setHoverGoogle(false)}
                      style={[styles.socialBtn, hoverGoogle && styles.socialBtnHover]}
                      accessibilityLabel="Google"
                    >
                      <IconGoogle size={20} accessibilityLabel="Google" />
                    </Pressable>
                  </View>
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
    paddingLeft: spacing.xxl + 16,
  },
  panel: {
    flexDirection: 'row',
    backgroundColor: 'rgba(34, 92, 52, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.16)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  panelWeb: Platform.OS === 'web' ? ({ width: 980 } as any) : {},
  left: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingLeft: spacing.xxl,
    paddingRight: spacing.xl,
  },
  welcome: {
    fontSize: 52,
    fontWeight: '800',
    color: '#ffffff',
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
    color: '#ffffff',
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System',
  },
  vertDivider: {
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertGrad: { width: 3, height: 230, borderRadius: 2 },
  right: {
    width: 360,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  formInner: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1CBB3D',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff', marginBottom: spacing.xs },

  forgotRow: { width: '100%', alignItems: 'flex-end', marginTop: -spacing.xs },
  forgotBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
  },
  forgotText: {
    color: '#EF4444',
    fontSize: fonts.sizes.sm,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  btn: { width: 150, alignSelf: 'center' },
  linkMuted: { color: '#ffffff', fontSize: fonts.sizes.sm, marginTop: spacing.xs },
  orText: { color: '#ffffff', fontSize: fonts.sizes.sm, marginTop: spacing.sm },
  socialRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  socialBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  socialBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
