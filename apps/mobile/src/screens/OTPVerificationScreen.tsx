import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { colors, spacing, fonts, radius } from '../theme';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params: { phone: string } };
};

export function OTPVerificationScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [error, setError] = useState('');
  const inputs = useRef<TextInput[]>([]);
  const { setTokens, setUser } = useAuthStore();

  useEffect(() => {
    if (resendTimer === 0) return;
    const timer = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text.slice(-1);
    setOtp(newOtp);
    if (text && index < 5) inputs.current[index + 1]?.focus();
    if (!text && index > 0) inputs.current[index - 1]?.focus();
    setError('');
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Digite todos os 6 dígitos');
      return;
    }

    setLoading(true);
    setError('');
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
      setResendTimer(60);
      setOtp(['', '', '', '', '', '']);
      setError('');
    } catch {
      setError('Erro ao reenviar código');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bgPattern} pointerEvents="none">
        {Array.from({ length: 60 }).map((_, i) => (
          <View key={i} style={styles.bgTile} />
        ))}
      </View>

      <View style={styles.content}>
        <View style={styles.left}>
          <Logo size="lg" />
          <Text style={styles.tagline}>Bem-vindo</Text>
          <Text style={styles.subtitle}>Verifique seu número{'\n'}de celular</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Verificação OTP</Text>
          <Text style={styles.subtitle2}>
            Enviamos um código de 6 dígitos para{'\n'}
            <Text style={styles.phone}>{phone}</Text>
          </Text>

          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { if (ref) inputs.current[i] = ref; }}
                style={[styles.otpInput, digit ? styles.otpFilled : null, error ? styles.otpError : null]}
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

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Não recebeu o código? </Text>
            {resendTimer > 0 ? (
              <Text style={styles.timerText}>{resendTimer}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendLink}>Reenviar</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
    gap: spacing.xxl,
  },
  bgPattern: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  bgTile: {
    width: 50, height: 28, borderWidth: 1,
    borderColor: colors.primary, margin: 8, borderRadius: 3, opacity: 0.06,
  },
  left: { flex: 1, gap: spacing.lg },
  tagline: { fontSize: fonts.sizes.xxxl, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xxl },
  subtitle: { fontSize: fonts.sizes.lg, color: colors.textSecondary, lineHeight: 26 },
  card: {
    width: 380,
    backgroundColor: 'rgba(10,31,10,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.xxl,
  },
  title: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle2: { fontSize: fonts.sizes.sm, color: colors.textMuted, marginBottom: spacing.xl, lineHeight: 20 },
  phone: { color: colors.primary, fontWeight: '600' },
  otpRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.lg },
  otpInput: {
    width: 48, height: 56, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.07)',
    textAlign: 'center', fontSize: fonts.sizes.xxl,
    color: colors.textPrimary, fontWeight: '700',
  },
  otpFilled: { borderColor: colors.primary },
  otpError: { borderColor: colors.error },
  errorText: { color: colors.error, fontSize: fonts.sizes.sm, textAlign: 'center', marginBottom: spacing.sm },
  btn: { width: '100%', marginTop: spacing.sm },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  resendText: { color: colors.textMuted, fontSize: fonts.sizes.sm },
  timerText: { color: colors.primary, fontSize: fonts.sizes.sm, fontWeight: '600' },
  resendLink: { color: colors.primary, fontSize: fonts.sizes.sm, fontWeight: '600' },
  backBtn: { marginTop: spacing.lg, alignItems: 'center' },
  backText: { color: colors.textSecondary, fontSize: fonts.sizes.sm },
});
