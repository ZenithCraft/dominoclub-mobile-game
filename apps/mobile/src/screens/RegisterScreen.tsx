import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { phone?: string } };
};

function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(cpf[10]);
}

const LIME = '#4ade80';

function IconCircle({ children }: { children: React.ReactNode }) {
  return (
    <View style={iconCircleStyles.circle}>
      <Text style={iconCircleStyles.icon}>{children}</Text>
    </View>
  );
}
const iconCircleStyles = StyleSheet.create({
  circle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 24 },
});

export function RegisterScreen({ navigation, route }: Props) {
  const [name, setName]             = useState('');
  const [phone, setPhone]           = useState(route.params?.phone?.replace('+55', '') || '');
  const [cpf, setCpf]               = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cpfVerified, setCpfVerified] = useState(false);
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const { refreshUser } = useAuthStore();

  const rawCpf = cpf.replace(/\D/g, '');
  const cpfComplete = rawCpf.length === 11;
  const cpfFormatValid = cpfComplete && isValidCpf(rawCpf);

  const formatCPF = (t: string) => {
    const d = t.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };

  const handleVerifyCpf = async () => {
    if (!cpfFormatValid) { setErrors((e) => ({ ...e, cpf: 'CPF inválido' })); return; }
    setCpfLoading(true);
    try {
      await api.post('/auth/cpf/verify', { cpf: rawCpf });
      setCpfVerified(true);
    } catch (err: any) {
      setErrors((e) => ({ ...e, cpf: err.response?.data?.error || 'Não foi possível verificar o CPF' }));
      setCpfVerified(false);
    } finally {
      setCpfLoading(false);
    }
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 3) newErrors.name = 'Nome deve ter ao menos 3 caracteres';
    if (cpf && cpfFormatValid && !cpfVerified) newErrors.cpf = 'Verifique seu CPF antes de continuar';
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setLoading(true);
    try {
      await api.put('/auth/profile', { name: name.trim() });
      await refreshUser();
      navigation.replace('Main');
    } catch (err: any) {
      setErrors({ general: err.response?.data?.error || 'Erro ao salvar perfil' });
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Left column */}
          <View style={styles.left}>
            <Text style={styles.welcome}>Bem-vindo</Text>
            <Text style={styles.subtitle}>Crie a sua conta ou faça o login</Text>
          </View>

          {/* Vertical divider */}
          <View style={styles.vertDivider} />

          {/* Right column — form card */}
          <View style={styles.card}>
            <IconCircle>👤</IconCircle>
            <Text style={styles.cardTitle}>Criar nova conta</Text>

            <Input
              label=""
              placeholder="Nome completo"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={errors.name}
            />
            <Input
              label=""
              placeholder="Número de telefone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.cpfRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label=""
                  placeholder="CPF"
                  value={cpf}
                  onChangeText={(t) => { setCpf(formatCPF(t)); setCpfVerified(false); }}
                  keyboardType="number-pad"
                  error={errors.cpf}
                />
              </View>
              {cpfFormatValid && !cpfVerified && (
                <TouchableOpacity style={styles.verifyBtn} onPress={handleVerifyCpf} disabled={cpfLoading}>
                  <Text style={styles.verifyBtnText}>{cpfLoading ? '...' : 'Verificar'}</Text>
                </TouchableOpacity>
              )}
              {cpfVerified && <Text style={styles.cpfOk}>✓</Text>}
            </View>
            <Input
              label=""
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label=""
              placeholder="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Input
              label=""
              placeholder="Digite novamente a sua senha"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
            />

            {errors.general ? (
              <Text style={styles.generalError}>{errors.general}</Text>
            ) : null}

            <Button
              title="Criar Conta"
              onPress={handleSubmit}
              loading={loading}
              style={styles.btn}
            />

            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Já tem conta? Faça o login</Text>
            </TouchableOpacity>

            <Text style={styles.orText}>Ou entre com</Text>

            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialBtn}>
                <Text style={styles.socialIcon}>🍎</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn}>
                <Text style={styles.socialIcon}>G</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
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
  welcome: {
    fontSize: 38,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },

  vertDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(74, 222, 128, 0.25)',
    marginVertical: spacing.md,
    marginRight: spacing.xl,
  },

  card: {
    width: 360,
    backgroundColor: 'rgba(8, 20, 8, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.30)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: spacing.xs,
  },

  cpfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
  },
  verifyBtn: {
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderWidth: 1,
    borderColor: LIME,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
  verifyBtnText: { color: LIME, fontSize: fonts.sizes.xs, fontWeight: '600' },
  cpfOk: { color: LIME, fontSize: fonts.sizes.lg, fontWeight: '700', marginTop: 2 },

  btn: { width: '100%', marginTop: spacing.xs },

  generalError: {
    color: colors.error,
    fontSize: fonts.sizes.sm,
    textAlign: 'center',
  },

  linkText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
  orText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },

  socialRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  socialBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  socialIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
