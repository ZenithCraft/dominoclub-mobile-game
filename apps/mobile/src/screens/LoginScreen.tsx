import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableOpacity, Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { LinearGradient } from 'expo-linear-gradient';
import { IconUser, IconGoogle, IconAppleLogo } from '../components/Icons';

type Props = { navigation: NativeStackNavigationProp<any> };

export function LoginScreen({ navigation }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const isShort  = winH < 700;
  const isTablet = winW >= 768;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [hoverApple, setHoverApple] = useState(false);
  const [hoverGoogle, setHoverGoogle] = useState(false);
  const { setTokens, setUser } = useAuthStore();

  const isEmail = /[a-zA-Z@]/.test(identifier);
  const DEV_AUTH_BYPASS = process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true';

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

  const handleLogin = async () => {
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
      await api.post('/auth/otp/send', { phone: `+55${clean}` });
      navigation.navigate('OTPVerification', { phone: `+55${clean}` });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground style={styles.root}>
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <View style={styles.center}>
            <View style={[styles.panel, isTablet && styles.panelTablet]}>

              {/* Header */}
              <View style={[styles.header, isShort && styles.headerShort]}>
                <Text style={[
                  styles.welcome,
                  isShort && styles.welcomeShort,
                  Platform.OS === 'web' && styles.welcomeGradientWeb,
                ]}>
                  Bem-vindo
                </Text>
                {!isShort && (
                  <Text style={styles.subtitle}>A resenha da mesa, agora no seu celular</Text>
                )}
              </View>

              {/* Form */}
              <View style={[styles.form, isShort && styles.formShort]}>
                <LinearGradient
                  colors={['#BEF311', '#1CBB3D']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.iconCircle, isShort && styles.iconCircleShort]}
                >
                  <IconUser size={isShort ? 22 : 28} color="#0a1f0a" accessibilityLabel="Usuário" />
                </LinearGradient>

                <Text style={[styles.cardTitle, isShort && styles.cardTitleShort]}>Entrar</Text>

                <Input
                  label=""
                  placeholder="Email ou número de telefone"
                  value={identifier}
                  onChangeText={handleIdentifierChange}
                  keyboardType={isEmail ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                  error={error}
                  maxLength={isEmail ? 64 : 15}
                  compact
                />
                <Input
                  label=""
                  placeholder="Senha"
                  value={password}
                  onChangeText={(t) => setPassword(t)}
                  secureTextEntry
                  compact
                />

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.forgotBtn}
                    onPress={() => navigation.navigate('ForgotPassword')}
                  >
                    <Text style={styles.forgotText}>Esqueceu a senha?</Text>
                  </TouchableOpacity>
                  <Button
                    title="Entrar"
                    onPress={handleLogin}
                    loading={loading}
                    size="sm"
                    style={styles.btn}
                  />
                </View>

                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                  <Text style={styles.linkMuted}>Criar uma conta</Text>
                </TouchableOpacity>

                <View style={styles.socialRow}>
                  <Pressable
                    onHoverIn={() => setHoverApple(true)}
                    onHoverOut={() => setHoverApple(false)}
                    style={[styles.socialBtn, hoverApple && styles.socialBtnHover]}
                    accessibilityLabel="Apple"
                  >
                    <IconAppleLogo size={18} color="#fff" accessibilityLabel="Apple" />
                  </Pressable>
                  <Pressable
                    onHoverIn={() => setHoverGoogle(true)}
                    onHoverOut={() => setHoverGoogle(false)}
                    style={[styles.socialBtn, hoverGoogle && styles.socialBtnHover]}
                    accessibilityLabel="Google"
                  >
                    <IconGoogle size={18} accessibilityLabel="Google" />
                  </Pressable>
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
    width: '100%',
    maxWidth: 480,
    backgroundColor: 'rgba(34, 92, 52, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.16)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  panelTablet: {
    maxWidth: 640,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  headerShort: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  welcome: {
    fontSize: 36,
    fontWeight: '800',
    color: Platform.OS === 'web' ? '#ffffff' : '#FDD835',
    letterSpacing: 0.5,
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System',
  },
  welcomeShort: { fontSize: 28 },
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

  // ── Form ──
  form: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  formShort: { gap: spacing.xs, paddingBottom: spacing.lg },

  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconCircleShort: { width: 36, height: 36, borderRadius: 18 },

  cardTitle: {
    fontSize: fonts.sizes.lg, fontWeight: '700',
    color: '#ffffff', marginBottom: spacing.xs,
  },
  cardTitleShort: { fontSize: fonts.sizes.md, marginBottom: 0 },

  actionRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  forgotBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: 'rgba(250,204,21,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.5)',
  },
  forgotText: { color: '#facc15', fontSize: fonts.sizes.xs, fontWeight: '700' },
  btn: { width: 110 },

  linkMuted: { color: '#ffffff', fontSize: fonts.sizes.sm },

  socialRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  socialBtn: {
    width: 42, height: 42, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(28,187,61,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  socialBtnHover: {
    backgroundColor: 'rgba(28,187,61,0.15)',
    borderColor: 'rgba(28,187,61,0.6)',
  },
});
