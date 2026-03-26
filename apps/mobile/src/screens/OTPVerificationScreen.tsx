import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  TextInput, TouchableOpacity,
} from 'react-native';
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
      <View style={styles.row}>
        {/* Left column */}
        <View style={styles.left}>
          <Text style={styles.welcome}>Bem-vindo</Text>
          <Text style={styles.subtitle}>A reserva da mesa, agora no seu celular</Text>
        </View>

        {/* Vertical divider */}
        <View style={styles.vertDivider} />

        {/* Right card */}
        <View style={styles.card}>
          {/* Icon circle */}
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>📱</Text>
          </View>

          <Text style={styles.cardTitle}>Verificar SMS</Text>

          {/* 6-digit OTP boxes */}
          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={(r) => { if (r) inputs.current[i] = r; }}
                style={[
                  styles.otpBox,
                  digit && styles.otpBoxFilled,
                  error && styles.otpBoxError,
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
            title="Send"
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

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
  welcome: { fontSize: 38, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  subtitle: { fontSize: fonts.sizes.sm, color: colors.textMuted, lineHeight: 20 },

  vertDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(74, 222, 128, 0.25)',
    marginVertical: spacing.md,
    marginRight: spacing.xxl,
  },

  card: {
    width: 340,
    backgroundColor: 'rgba(8, 22, 8, 0.80)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.22)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },

  iconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 22 },

  cardTitle: { fontSize: fonts.sizes.lg, fontWeight: '700', color: '#ffffff' },

  otpRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  otpBox: {
    width: 42, height: 50, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.3)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    textAlign: 'center', fontSize: fonts.sizes.xl,
    color: '#ffffff', fontWeight: '700',
  },
  otpBoxFilled: { borderColor: LIME },
  otpBoxError:  { borderColor: colors.error },

  errorText: { color: colors.error, fontSize: fonts.sizes.sm, textAlign: 'center' },

  btn: { width: '100%' },

  linkText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
  timerText: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  resendLink: { color: LIME, fontSize: fonts.sizes.sm, fontWeight: '600' },
});
