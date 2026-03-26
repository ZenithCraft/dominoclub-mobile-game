import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { RootStackParamList } from '../navigation';

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
    const next = [...otp]; next[i] = text.slice(-1); setOtp(next);
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
      style={styles.root}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          {/* ONE frosted-glass panel */}
          <View style={styles.panel}>
            {/* Left column */}
            <View style={styles.left}>
              <Text style={styles.welcome}>Bem-vindo</Text>
              <Text style={styles.subtitle}>A reserva da mesa, agora no seu celular</Text>
            </View>

            {/* Vertical divider */}
            <View style={styles.vertDivider} />

            {/* Right column — form */}
            <View style={styles.right}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>📱</Text>
              </View>

              <Text style={styles.cardTitle}>Verificar SMS</Text>

              <View style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { if (r) inputs.current[i] = r; }}
                    style={[
                      styles.otpBox,
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },

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

  vertDivider: {
    width: 1,
    backgroundColor: 'rgba(74, 222, 128, 0.25)',
    marginVertical: spacing.xl,
  },

  right: {
    width: 360,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
  },

  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 24 },

  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff' },

  otpRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  otpBox: {
    width: 46, height: 54, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.35)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    textAlign: 'center', fontSize: fonts.sizes.xxl,
    color: '#ffffff', fontWeight: '700',
  },
  otpBoxFilled: { borderColor: LIME, backgroundColor: 'rgba(74,222,128,0.08)' },
  otpBoxError:  { borderColor: colors.error },

  errorText: { color: colors.error, fontSize: fonts.sizes.sm, textAlign: 'center' },

  btn: { width: '100%' },

  linkText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
  },
  timerText: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  resendLink: { color: LIME, fontSize: fonts.sizes.sm, fontWeight: '600' },
});
