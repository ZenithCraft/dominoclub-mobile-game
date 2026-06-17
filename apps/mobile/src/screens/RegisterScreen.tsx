import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  ScrollView, KeyboardAvoidingView, TouchableOpacity, Pressable,
  useWindowDimensions, Platform,
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

const LIME = '#1CBB3D';

export function RegisterScreen({ navigation, route }: Props) {
  const { width: winW } = useWindowDimensions();
  const isWide   = winW >= 580;
  const isTablet = winW >= 768;

  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState(route.params?.phone?.replace('+55', '') || '');
  const [cpf, setCpf]                 = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [dob, setDob]                 = useState('');
  const [loading, setLoading]         = useState(false);
  const [cpfLoading, setCpfLoading]   = useState(false);
  const [cpfVerified, setCpfVerified] = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const { refreshUser } = useAuthStore();
  const [hoverApple, setHoverApple]   = useState(false);
  const [hoverGoogle, setHoverGoogle] = useState(false);

  const rawCpf = cpf.replace(/\D/g, '');
  const cpfComplete    = rawCpf.length === 11;
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
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.panel, isWide && styles.panelWide, isTablet && styles.panelTablet]}>

              {/* Header */}
              <View style={styles.header}>
                <LinearGradient
                  colors={['#BEF311', '#1CBB3D']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.iconCircle}
                >
                  <IconUser size={22} color="#0a1f0a" accessibilityLabel="Usuário" />
                </LinearGradient>
                <View style={styles.headerText}>
                  <Text style={[styles.welcome, Platform.OS === 'web' && styles.welcomeGradientWeb]}>
                    Bem-vindo
                  </Text>
                  <Text style={styles.subtitle}>Crie a sua conta</Text>
                </View>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Fields — two columns on wide, one on narrow */}
              <View style={[styles.fields, isWide && styles.fieldsWide]}>

                {/* Left column */}
                <View style={[styles.col, isWide && styles.colWide]}>
                  <Input label="" placeholder="Nome completo" value={name} onChangeText={setName}
                    autoCapitalize="words" error={errors.name} compact />
                  <Input label="" placeholder="Número de telefone" value={phone} onChangeText={setPhone}
                    keyboardType="phone-pad" compact />
                  <View style={styles.cpfRow}>
                    <View style={{ flex: 1 }}>
                      <Input label="" placeholder="CPF" value={cpf}
                        onChangeText={(t) => { setCpf(formatCPF(t)); setCpfVerified(false); }}
                        keyboardType="number-pad" error={errors.cpf} compact />
                    </View>
                    {cpfFormatValid && !cpfVerified && (
                      <TouchableOpacity style={styles.verifyBtn} onPress={handleVerifyCpf} disabled={cpfLoading}>
                        <Text style={styles.verifyBtnText}>{cpfLoading ? '...' : 'Verificar'}</Text>
                      </TouchableOpacity>
                    )}
                    {cpfVerified && <IconCheck size={22} color="#1CBB3D" accessibilityLabel="CPF Verificado" />}
                  </View>
                  <Input label="" placeholder="Email" value={email} onChangeText={setEmail}
                    keyboardType="email-address" autoCapitalize="none" compact />
                </View>

                {/* Vertical divider (wide only) */}
                {isWide && <View style={styles.colDivider} />}

                {/* Right column */}
                <View style={[styles.col, isWide && styles.colWide]}>
                  <Input label="" placeholder="Data de nascimento (DD/MM/AAAA)" value={dob}
                    onChangeText={(t) => setDob(formatDob(t))} keyboardType="number-pad"
                    error={errors.dob} compact />
                  <Input label="" placeholder="Senha" value={password} onChangeText={setPassword}
                    secureTextEntry compact />
                  <Input label="" placeholder="Confirme a senha" value={confirm} onChangeText={setConfirm}
                    secureTextEntry compact />

                  {errors.general ? <Text style={styles.generalError}>{errors.general}</Text> : null}

                  <Button title="Criar Conta" onPress={handleSubmit} loading={loading} size="sm" style={styles.btn} />

                  <View style={styles.loginRow}>
                    <Text style={styles.linkText}>Já tem conta? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                      <Text style={styles.linkUnderline}>Fazer login</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.socialRow}>
                    <Pressable onHoverIn={() => setHoverApple(true)} onHoverOut={() => setHoverApple(false)}
                      style={[styles.socialBtn, hoverApple && styles.socialBtnHover]} accessibilityLabel="Apple">
                      <IconAppleLogo size={18} color="#fff" accessibilityLabel="Apple" />
                    </Pressable>
                    <Pressable onHoverIn={() => setHoverGoogle(true)} onHoverOut={() => setHoverGoogle(false)}
                      style={[styles.socialBtn, hoverGoogle && styles.socialBtnHover]} accessibilityLabel="Google">
                      <IconGoogle size={18} accessibilityLabel="Google" />
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
    paddingVertical: spacing.lg,
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
  panelWide:   { maxWidth: 700 },
  panelTablet: { maxWidth: 860 },

  // Header (horizontal: icon + text side by side)
  header: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  headerText: { flex: 1 },
  welcome: {
    fontSize: 26, fontWeight: '800',
    color: Platform.OS === 'web' ? '#ffffff' : '#FDD835',
    letterSpacing: 0.5,
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
    fontSize: fonts.sizes.xs,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Platform.OS === 'web' ? ('Poppins' as any) : 'System',
  },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: spacing.lg },

  // Fields area
  fields: { padding: spacing.lg, gap: spacing.sm },
  fieldsWide: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },

  col: { gap: spacing.sm },
  colWide: { flex: 1 },
  colLabel: {
    color: 'rgba(255,255,255,0.5)', fontSize: 10,
    fontWeight: '800', letterSpacing: 1.1,
    marginBottom: spacing.xs,
  },
  colDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'stretch' },

  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  cpfRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm,
  },
  verifyBtn: {
    backgroundColor: 'rgba(28,187,61,0.15)',
    borderWidth: 1, borderColor: LIME,
    borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 6,
    marginTop: 2,
  },
  verifyBtnText: { color: LIME, fontSize: fonts.sizes.xs, fontWeight: '600' },

  btn: { width: '100%', marginTop: spacing.xs },

  generalError: {
    color: colors.error, fontSize: fonts.sizes.sm, textAlign: 'center',
  },

  loginRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  linkText: { color: '#fff', fontSize: fonts.sizes.sm },
  linkUnderline: { color: '#fff', fontSize: fonts.sizes.sm, textDecorationLine: 'underline' },

  socialRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs, justifyContent: 'center', width: '100%' },
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
