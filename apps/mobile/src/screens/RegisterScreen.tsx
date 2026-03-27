import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ImageBackground,
  ScrollView, KeyboardAvoidingView, TouchableOpacity, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { IconUser, IconCheck, IconGoogle, IconAppleLogo } from '../components/Icons';
import { colors, spacing, fonts, radius, backgroundCoverFix } from '../theme';
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

function IconCircle({ children }: { children: React.ReactNode }) {
  return (
    <View style={iconCircleStyles.circle}>
      {children}
    </View>
  );
}
const iconCircleStyles = StyleSheet.create({
  circle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1CBB3D',
    alignItems: 'center', justifyContent: 'center',
  },
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
            {/* ONE frosted-glass panel */}
            <View style={[styles.panel, styles.panelWeb]}>
              {/* Left column */}
              <View style={styles.left}>
                <Text style={[styles.welcome, styles.welcomeGradientWeb]}>Bem-vindo</Text>
                <Text style={styles.subtitle}>Crie a sua conta ou faça o login</Text>
              </View>

              {/* Vertical divider */}
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

              {/* Right column — form */}
              <View style={styles.right}>
                <View style={styles.formInner}>
                  <IconCircle>
                    <IconUser size={32} color={colors.textPrimary} accessibilityLabel="Usuário" />
                  </IconCircle>
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

                  <Button title="Criar Conta" onPress={handleSubmit} loading={loading} style={styles.btn} />

                  <View style={styles.loginRow}>
                  <Text style={[styles.linkText, styles.whiteText]}>Já tem conta? faça o </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                      <Text style={[styles.linkText, styles.linkUnderline]}>login</Text>
                    </TouchableOpacity>
                  </View>

                <Text style={[styles.orText, styles.whiteText]}>Ou entre com</Text>

                  <View style={styles.socialRow}>
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
    </ImageBackground>
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
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  formInner: {
    width: 320,
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
  socialBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  socialIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
