import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  ScrollView, KeyboardAvoidingView, TouchableOpacity, Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { IconUser, IconCheck, IconGoogle, IconAppleLogo } from '../components/Icons';
import { colors, spacing, fonts, radius } from '../theme';
import { ScreenBackground } from '../components/ScreenBackground';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform } from 'react-native';

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


export function RegisterScreen({ navigation, route }: Props) {
  const { width: winW } = useWindowDimensions();
  const welcomeSize = winW < 480 ? 32 : 40;
  const [name, setName]             = useState('');
  const [phone, setPhone]           = useState(route.params?.phone?.replace('+55', '') || '');
  const [cpf, setCpf]               = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [dob, setDob]               = useState('');
  const [loading, setLoading]       = useState(false);
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cpfVerified, setCpfVerified] = useState(false);
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const { refreshUser } = useAuthStore();
  const [hoverApple, setHoverApple] = useState(false);
  const [hoverGoogle, setHoverGoogle] = useState(false);

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

  const formatDob = (t: string) => {
    const d = t.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  };

  const parseDob = (formatted: string): Date | null => {
    const parts = formatted.split('/');
    if (parts.length !== 3 || parts[2].length < 4) return null;
    const [day, month, year] = parts.map(Number);
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 3) newErrors.name = 'Nome deve ter ao menos 3 caracteres';
    if (cpf && cpfFormatValid && !cpfVerified) newErrors.cpf = 'Verifique seu CPF antes de continuar';
    if (!dob || dob.length < 10) {
      newErrors.dob = 'Data de nascimento obrigatória';
    } else {
      const dobDate = parseDob(dob);
      if (!dobDate) {
        newErrors.dob = 'Data inválida';
      } else {
        const age = (Date.now() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (age < 18) newErrors.dob = 'Você precisa ter ao menos 18 anos para se cadastrar';
      }
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setLoading(true);
    try {
      const dobDate = parseDob(dob)!;
      await api.put('/auth/profile', { name: name.trim(), date_of_birth: dobDate.toISOString() });
      await refreshUser();
      navigation.replace('Main');
    } catch (err: any) {
      setErrors({ general: err.response?.data?.error || 'Erro ao salvar perfil' });
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
            <View style={[styles.panel, { width: '100%', flexDirection: 'column' }]}>
              {/* Left column */}
              <View style={[styles.left, styles.leftMobile]}>
                <Text style={[styles.welcome, styles.welcomeGradientWeb, { fontSize: welcomeSize }]}>Bem-vindo</Text>
                <Text style={styles.subtitle}>Crie a sua conta ou faça o login</Text>
              </View>

              {/* Form */}
              <View style={[styles.right, { width: '100%' }]}>
                <View style={styles.formInner}>
                  <LinearGradient
                    colors={['#BEF311', '#1CBB3D']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconCircle}
                  >
                    <IconUser size={32} color={colors.textPrimary} accessibilityLabel="Usuário" />
                  </LinearGradient>
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
                    {cpfVerified && <IconCheck size={24} color="#4ade80" accessibilityLabel="CPF Verificado" />}
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
                    placeholder="Data de nascimento (DD/MM/AAAA)"
                    value={dob}
                    onChangeText={(t) => setDob(formatDob(t))}
                    keyboardType="number-pad"
                    error={errors.dob}
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

                  <Button title="Criar Conta" onPress={handleSubmit} loading={loading} style={{ ...styles.btn, width: winW >= 768 ? 320 : 220 }} />

                  <View style={styles.loginRow}>
                  <Text style={[styles.linkText, styles.whiteText]}>Já tem conta? faça o </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                      <Text style={[styles.linkText, styles.linkUnderline]}>login</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.socialRow, { marginTop: spacing.md }]}>
                  <Pressable
                    onHoverIn={() => setHoverApple(true)}
                    onHoverOut={() => setHoverApple(false)}
                    style={[styles.socialBtn, hoverApple && styles.socialBtnHover]}
                    accessibilityLabel="Apple"
                  >
                    <IconAppleLogo size={22} color="#fff" accessibilityLabel="Apple" />
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
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1f0a' },
  safe: { flex: 1 },
  kav:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },

  panel: {
    backgroundColor: 'rgba(34, 92, 52, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(187, 255, 0, 0.16)',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  leftMobile: { width: '100%' },
  left: {
    flex: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingLeft: spacing.xxl,
    paddingRight: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  welcome: {
    fontSize: 52,
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
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  formInner: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
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

  btn: { width: 220, alignSelf: 'center', marginTop: spacing.xs },

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
  linkUnderline: { textDecorationLine: 'underline', color: '#fff' },
  loginRow: { flexDirection: 'row', alignItems: 'center' },
  whiteText: { color: '#fff' },
  orText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.md,
    fontWeight: '500',
  },

  socialRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  socialBtn: {
    width: 48, height: 48, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(74,222,128,0.3)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  socialBtnHover: {
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderColor: 'rgba(74,222,128,0.6)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  socialIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
