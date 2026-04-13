import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { IconSmartphone } from '../components/Icons';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { RootStackParamList } from '../navigation';
import { LinearGradient } from 'expo-linear-gradient';

type Props = NativeStackScreenProps<RootStackParamList, 'OTPVerification'>;

const LIME = '#4ade80';

export function OTPVerificationScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const [otp, setOtp]               = useState(['', '', '', '', '', '']);
  const [loading, setLoading]       = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [error, setError]           = useState('');
  const inputs = useRef<TextInput[]>([]);
  const { setTokens, setUser } = useAuthStore();

  useEffect(() => {
    if (resendTimer === 0) return;
    const t = setInterval(() => setResendTimer((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  const handleChange = (text: string, i: number) => {
    setOtp((prev) => {
      const next = [...prev];
      next[i] = text.slice(-1);
      return next;
    });
    if (text && i < 5) inputs.current[i + 1]?.focus();
    if (!text && i > 0) inputs.current[i - 1]?.focus();
    setError('');
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) { setError('Digite todos os 6 dígitos'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/otp/verify', { phone, otp: code });
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      if (data.user.isNewUser || !data.user.name) {
        navigation.replace('Register', { phone });
      } else {
        navigation.replace('Main');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Código inválido ou expirado');
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await api.post('/auth/otp/send', { phone });
      setResendTimer(60); setOtp(['', '', '', '', '', '']); setError('');
      inputs.current[0]?.focus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao reenviar código');
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
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
                <View style={styles.rightInner}>
                  <View style={styles.formInner}>
                  <View style={styles.iconCircle}>
                    <IconSmartphone size={32} color={colors.textPrimary} accessibilityLabel="Smartphone" />
                  </View>

                  <Text style={styles.cardTitle}>Verificar SMS</Text>

                  <View style={styles.otpRow}>
                    {otp.map((digit, i) => (
                      <TextInput
                        key={i}
                        ref={(r) => { if (r) inputs.current[i] = r; }}
                        style={[
                          styles.otpBox,
                          Platform.OS === 'web' ? styles.otpBoxWeb : null,
                          digit ? styles.otpBoxFilled : null,
                          error ? styles.otpBoxError : null,
                        ]}
                        value={digit}
                        onChangeText={(t) => handleChange(t, i)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                      />
                    ))}
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <Button
                    title="Verificar"
                    onPress={handleVerify}
                    loading={loading}
                    disabled={otp.join('').length !== 6}
                    size="sm"
                    style={styles.btn}
                  />

                  <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                    <Text style={styles.linkText}>Criar uma conta</Text>
                  </TouchableOpacity>

                  {resendTimer > 0 ? (
                    <Text style={styles.timerText}>Reenviar em {resendTimer}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleResend}>
                      <Text style={styles.resendLink}>Reenviar código</Text>
                    </TouchableOpacity>
                  )}
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
  kav: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  panelWeb: Platform.OS === 'web' ? ({ width: 1160, minHeight: 560 } as any) : {},

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
    width: 480,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingLeft: spacing.xl,
    paddingRight: spacing.xxxl + 24,
    justifyContent: 'center',
  },
  rightInner: {
    width: 380,
    alignSelf: 'center',
  },
  formInner: { alignItems: 'center', gap: spacing.xl },

  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1CBB3D',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 24 },

  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff' },

  otpRow: { flexDirection: 'row', width: 360, justifyContent: 'space-between', alignSelf: 'center' },
  otpBox: {
    width: 54, height: 62, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: 'rgba(187,255,0,0.22)',
    backgroundColor: '#184912',
    textAlign: 'center', fontSize: fonts.sizes.xxl,
    color: '#ffffff', fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? ('Inria Sans' as any) : 'System',
  },
  otpBoxWeb: ({
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any),
  otpBoxFilled: { borderColor: '#BBFF00' },
  otpBoxError:  { borderColor: colors.error },

  errorText: { color: colors.error, fontSize: fonts.sizes.sm, textAlign: 'center' },

  btn: { width: 150, alignSelf: 'center' },

  linkText: {
    color: '#ffffff',
    fontSize: fonts.sizes.sm,
  },
  timerText: { color: '#ffffff', fontSize: fonts.sizes.sm },
  resendLink: { color: '#BBFF00', fontSize: fonts.sizes.sm, fontWeight: '700' },
});
