import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../components/Logo';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { colors, spacing, fonts, radius } from '../theme';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth.store';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: { params?: { phone?: string } };
};

// CPF checksum validation (mirrors backend validators.ts)
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

export function RegisterScreen({ navigation, route }: Props) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cpfVerified, setCpfVerified] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { refreshUser } = useAuthStore();

  const rawCpf = cpf.replace(/\D/g, '');
  const cpfComplete = rawCpf.length === 11;
  const cpfFormatValid = cpfComplete && isValidCpf(rawCpf);

  const formatCPF = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const handleCpfChange = (text: string) => {
    setCpf(formatCPF(text));
    setCpfVerified(false);
    setErrors((e) => ({ ...e, cpf: '' }));
  };

  // Explicit CPF verification step (calls Serpro via backend)
  const handleVerifyCpf = async () => {
    if (!cpfFormatValid) {
      setErrors((e) => ({ ...e, cpf: 'CPF inválido' }));
      return;
    }
    setCpfLoading(true);
    setErrors((e) => ({ ...e, cpf: '' }));
    try {
      await api.post('/auth/cpf/verify', { cpf: rawCpf });
      setCpfVerified(true);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Não foi possível verificar o CPF';
      setErrors((e) => ({ ...e, cpf: msg }));
      setCpfVerified(false);
    } finally {
      setCpfLoading(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 3) {
      newErrors.name = 'Nome deve ter ao menos 3 caracteres';
    }
    if (cpf && !cpfFormatValid) {
      newErrors.cpf = 'CPF inválido';
    }
    if (cpf && cpfFormatValid && !cpfVerified) {
      newErrors.cpf = 'Verifique seu CPF antes de continuar';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.put('/auth/profile', {
        name: name.trim(),
        // CPF already saved during verification — pass it again so profile name is also saved
      });
      await refreshUser();
      navigation.replace('Main');
    } catch (err: any) {
      setErrors({ general: err.response?.data?.error || 'Erro ao salvar perfil' });
    } finally {
      setLoading(false);
    }
  };

  // CPF status indicator
  const cpfStatus = () => {
    if (!cpf) return null;
    if (!cpfComplete) return null;
    if (!cpfFormatValid) return { color: colors.error, text: 'CPF inválido' };
    if (cpfVerified) return { color: colors.success, text: '✓ CPF verificado' };
    return null;
  };
  const status = cpfStatus();

  return (
    <View style={styles.container}>
      <View style={styles.bgPattern} pointerEvents="none">
        {Array.from({ length: 60 }).map((_, i) => <View key={i} style={styles.bgTile} />)}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.left}>
            <Logo size="lg" />
            <Text style={styles.tagline}>Bem-vindo</Text>
            <Text style={styles.subtitle}>Complete seu perfil{'\n'}para começar a jogar</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle2}>Preencha seus dados para continuar</Text>

            <Input
              label="Nome completo"
              placeholder="Seu nome"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={errors.name}
            />

            {/* CPF field + inline verify button */}
            <View style={styles.cpfRow}>
              <View style={styles.cpfInputWrap}>
                <Input
                  label="CPF (obrigatório para saques)"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChangeText={handleCpfChange}
                  keyboardType="number-pad"
                  error={errors.cpf}
                />
                {status && (
                  <Text style={[styles.cpfStatus, { color: status.color }]}>{status.text}</Text>
                )}
              </View>

              {cpfFormatValid && !cpfVerified && (
                <View style={styles.verifyBtnWrap}>
                  <Button
                    title={cpfLoading ? '...' : 'Verificar'}
                    onPress={handleVerifyCpf}
                    loading={cpfLoading}
                    variant="outline"
                    size="sm"
                    style={styles.verifyBtn}
                  />
                </View>
              )}
            </View>

            <Text style={styles.cpfNote}>
              O CPF é validado junto à Receita Federal e é necessário para saques via PIX.
            </Text>

            {errors.general ? (
              <Text style={styles.generalError}>{errors.general}</Text>
            ) : null}

            <Button
              title="Criar conta"
              onPress={handleSubmit}
              loading={loading}
              style={styles.btn}
            />
            <Button
              title="Pular por agora"
              onPress={() => navigation.replace('Main')}
              variant="ghost"
              style={styles.btn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.xl, gap: spacing.xxl,
  },
  bgPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  bgTile: { width: 50, height: 28, borderWidth: 1, borderColor: colors.primary, margin: 8, borderRadius: 3, opacity: 0.06 },
  left: { flex: 1, gap: spacing.lg },
  tagline: { fontSize: fonts.sizes.xxxl, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xxl },
  subtitle: { fontSize: fonts.sizes.lg, color: colors.textSecondary, lineHeight: 26 },
  card: {
    width: 360, backgroundColor: 'rgba(10,31,10,0.92)',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, padding: spacing.xxl,
  },
  title: { fontSize: fonts.sizes.xxl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle2: { fontSize: fonts.sizes.sm, color: colors.textMuted, marginBottom: spacing.xl },
  cpfRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cpfInputWrap: { flex: 1 },
  cpfStatus: { fontSize: fonts.sizes.xs, marginTop: 2, marginBottom: spacing.xs },
  verifyBtnWrap: { paddingTop: 22 }, // align with input (label height offset)
  verifyBtn: { minWidth: 80 },
  cpfNote: { fontSize: fonts.sizes.xs, color: colors.textMuted, lineHeight: 17, marginBottom: spacing.md },
  btn: { width: '100%', marginTop: spacing.sm },
  generalError: { color: colors.error, fontSize: fonts.sizes.sm, marginBottom: spacing.sm, textAlign: 'center' },
});
